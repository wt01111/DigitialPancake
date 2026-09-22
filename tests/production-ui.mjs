import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/bootstrap", (r) =>
  r.fulfill({
    json: {
      user: null,
      config: { registrationEnabled: false, maxUploadBytes: 52428800 },
    },
  }),
);
const problemRequests = [];
await page.route("**/api/problems*", (r) => {
  problemRequests.push(r.request().url());
  return r.fulfill({
    json: {
      items: [
        {
          id: "p-2023-a",
          title: "2023 全国电赛 A题",
          year: 2023,
          category: "signal",
          competitionType: "national",
          competitionName: "全国大学生电子设计竞赛",
          group: "本科组",
          letter: "A",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 24,
      facets: {
        years: [2023],
        groups: ["本科组"],
        categories: ["signal"],
        competitionTypes: ["national"],
      },
    },
  });
});
await page.route("**/api/articles*", (r) => r.fulfill({ json: { items: [] } }));
await page.route("**/api/shops*", (r) => r.fulfill({ json: { items: [] } }));
const base = process.env.PREVIEW_BASE || "http://127.0.0.1:5173";
await mkdir("work/qa", { recursive: true });
await page.goto(base);
await expect(page.getByRole("heading", { name: /让每一次探索/ })).toBeVisible();
assert.equal(await page.getByText(/演示|本地预览|示例题库/).count(), 0);
await page.screenshot({
  path: "work/qa/production-desktop.png",
  fullPage: true,
});
await page.getByRole("link", { name: "店铺口碑" }).first().click();
await expect(
  page.getByRole("heading", { name: "输入关键词开始搜索" }),
).toBeVisible();
await expect(
  page.getByText("店铺不会默认罗列，也不会在无匹配时推荐其他店铺。"),
).toBeVisible();
await page.goto(`${base}/auth`);
await expect(page.getByText("注册与找回密码暂未开放。")).toBeVisible();
await expect(page.getByRole("button", { name: "注册" })).toBeDisabled();
await expect(page.getByLabel("邮箱")).toHaveJSProperty("type", "email");
await page.goto(`${base}/problems`);
await page.getByLabel("竞赛").selectOption("national");
await expect
  .poll(() =>
    problemRequests.some((url) => url.includes("competitionType=national")),
  )
  .toBeTruthy();
await page.getByLabel("类型").selectOption("signal");
await expect
  .poll(() => problemRequests.some((url) => url.includes("type=signal")))
  .toBeTruthy();
await page.getByLabel("年份").selectOption("2023");
await expect
  .poll(() =>
    problemRequests.some(
      (url) =>
        url.includes("year=2023") &&
        url.includes("type=signal") &&
        url.includes("competitionType=national"),
    ),
  )
  .toBeTruthy();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base);
await expect(page.getByRole("heading", { name: /让每一次探索/ })).toBeVisible();
await page.screenshot({
  path: "work/qa/production-mobile.png",
  fullPage: true,
});
assert.equal(errors.length, 0, errors.join("\n"));
const admin = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
await admin.route("**/api/bootstrap", (r) =>
  r.fulfill({
    json: {
      user: {
        id: "owner",
        nickname: "管理员",
        email: "owner@example.test",
        role: "owner",
        permissions: [],
      },
      config: { registrationEnabled: false, maxUploadBytes: 52428800 },
    },
  }),
);
await admin.route("**/api/admin/queue*", (r) =>
  r.fulfill({ json: { items: [] } }),
);
let accountPatch = null;
await admin.route("**/api/admin/accounts/**", async (r) => {
  accountPatch = r.request().postDataJSON();
  return r.fulfill({ json: { ok: true, ...accountPatch } });
});
await admin.route("**/api/admin/accounts*", async (r) => {
  if (r.request().method() === "PATCH") {
    accountPatch = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true, ...accountPatch } });
  }
  return r.fulfill({
    json: {
      items: [
        {
          id: "owner",
          email: "owner@example.test",
          nickname: "站长",
          role: "owner",
          permissions: [],
          enabled: true,
          emailVerified: true,
        },
        {
          id: "member-1",
          email: "member@example.test",
          nickname: "已验证用户",
          role: "member",
          permissions: [],
          enabled: true,
          emailVerified: true,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    },
  });
});
await admin.goto(`${base}/admin`);
await expect(admin.getByRole("heading", { name: "管理工作台" })).toBeVisible();
await expect(admin.getByRole("button", { name: "文章" })).toHaveClass(/active/);
await admin.getByRole("button", { name: "账号" }).click();
await expect(admin.getByText("Admin", { exact: true })).toBeVisible();
await expect(admin.getByText("最高管理员", { exact: true })).toBeVisible();
await expect(
  admin
    .getByText("Admin", { exact: true })
    .locator("xpath=ancestor::article")
    .getByRole("button", { name: "管理此用户" }),
).toHaveCount(0);
await admin.getByRole("button", { name: "管理此用户" }).click();
await expect(
  admin.getByRole("heading", { name: "确认管理目标" }),
).toBeVisible();
await expect(
  admin.getByRole("dialog").getByText("member@example.test", { exact: true }),
).toBeVisible();
await admin.getByLabel("角色").selectOption("admin");
await admin.getByLabel("文章与赛题").check();
await admin.getByRole("button", { name: "确认角色与权限" }).click();
await expect.poll(() => accountPatch?.role).toBe("admin");
assert.deepEqual(accountPatch.permissions, ["content"]);
await admin.screenshot({
  path: "work/qa/production-admin.png",
  fullPage: true,
});
const subordinate = await browser.newPage();
await subordinate.route("**/api/bootstrap", (r) =>
  r.fulfill({
    json: {
      user: {
        id: "admin-1",
        nickname: "内容管理员",
        email: "admin@example.test",
        role: "admin",
        permissions: ["content"],
      },
      config: { registrationEnabled: false, maxUploadBytes: 52428800 },
    },
  }),
);
await subordinate.route("**/api/admin/queue*", (r) =>
  r.fulfill({ json: { items: [] } }),
);
await subordinate.goto(`${base}/admin`);
await expect(subordinate.getByRole("button", { name: "账号" })).toHaveCount(0);
await browser.close();
console.log("Production UI checks passed.");
