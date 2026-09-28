import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const browser = await chromium.launch(
  process.platform === "win32"
    ? { channel: "msedge", headless: true }
    : { headless: true },
);
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
await page.route("**/api/problems/**", (r) =>
  r.fulfill({
    json: {
      id: "p-2023-a",
      title: "2023 全国电赛 A题",
      year: 2023,
      category: "signal",
      competitionType: "national",
      competitionName: "全国大学生电子设计竞赛",
      group: "undergraduate",
      problemCode: "A",
      attachments: [],
    },
  }),
);
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
await page.route("**/api/comments*", (r) =>
  r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }),
);
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
await page.locator(".problem-title").click();
await expect(page).toHaveURL(/\/problems\/p-2023-a$/);
await page.getByRole("link", { name: "← 返回列表" }).click();
await expect(page).toHaveURL(`${base}/`);
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
await page.goto(`${base}/search?q=2023`);
await expect(page.getByText("“2023”的搜索结果")).toBeVisible();
await page.locator(".problem-title").click();
await page.getByRole("link", { name: "← 返回列表" }).click();
await expect(page).toHaveURL(`${base}/search?q=2023`);
await page.goto(`${base}/problems/p-2023-a`);
await page.getByRole("link", { name: "← 返回列表" }).click();
await expect(page).toHaveURL(`${base}/problems`);
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
const filteredProblemsUrl = page.url();
await page.evaluate(() => {
  document.body.style.minHeight = "2400px";
  window.scrollTo(0, 600);
});
await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
const listScrollY = await page.evaluate(() => window.scrollY);
await page.locator(".problem-title").evaluate((element) => element.click());
await expect(page).toHaveURL(/\/problems\/p-2023-a$/);
await expect(page.getByRole("heading", { name: "2023 全国电赛 A题" })).toBeVisible();
await page.getByRole("link", { name: "← 返回列表" }).click();
await expect(page).toHaveURL(filteredProblemsUrl);
await expect
  .poll(() => page.evaluate(() => window.scrollY))
  .toBeGreaterThanOrEqual(listScrollY - 2);
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
await admin.route("**/api/problems/pdf-online", (r) =>
  r.fulfill({
    json: {
      id: "pdf-online",
      title: "在线 PDF 阅读测试题",
      year: 2022,
      category: "signal",
      competitionType: "provincial",
      competitionName: "陕西省 TI 杯",
      group: "all",
      problemCode: "F",
      attachments: [
        {
          id: "test-pdf",
          name: "F题-信号调制度测量装置.pdf",
          mime: "application/pdf",
          url: "/api/official-files/test-pdf",
        },
      ],
    },
  }),
);
await admin.route("**/api/official-files/test-pdf", (r) =>
  r.fulfill({
    path: resolve("server/seed/problems-official-files/2022/all/F.pdf"),
    contentType: "application/pdf",
  }),
);
await admin.route("**/api/comments*", (r) =>
  r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }),
);
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
let moderationDecision = null;
let articlePinned = false;
await admin.route("**/api/admin/articles/*/decision", (r) => { moderationDecision = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
await admin.route("**/api/admin/articles/*/pin", (r) => { articlePinned = !!r.request().postDataJSON().pinned; return r.fulfill({ json: { pinned: articlePinned } }); });
await admin.route("**/api/admin/announcements*", (r) => r.fulfill({ json: { items: [] } }));
await admin.route("**/api/admin/queue*", (r) => {
  const url = new URL(r.request().url());
  return r.fulfill({ json: url.searchParams.get("type") === "articles" ? { items: [{ id: "published-1", title: "已通过的真实帖子", excerpt: "可由管理员搜索并直接下架", body: "## 正文", status: "approved", published: true, pinned: articlePinned }], total: 1, page: 1, pageSize: 20 } : { items: [] } });
});
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
await admin.goto(`${base}/account`);
await expect(admin.getByRole("heading", { name: "个人头像" })).toBeVisible();
const avatarEditorAlignment = await admin.locator(".avatar-editor").evaluate((editor) => {
  const copy = editor.querySelector(".avatar-editor-copy").getBoundingClientRect();
  const action = editor.querySelector(".action-row").getBoundingClientRect();
  const button = editor.querySelector(".action-row > *").getBoundingClientRect();
  return {
    actionOffset: Math.abs(action.left - copy.left),
    buttonOffset: Math.abs(button.left - copy.left),
    buttonHeight: button.height,
  };
});
assert.ok(avatarEditorAlignment.actionOffset < 2, "avatar actions should align with their explanatory copy");
assert.ok(avatarEditorAlignment.buttonOffset < 2, "avatar upload should not float in the middle of the panel");
assert.ok(avatarEditorAlignment.buttonHeight >= 44, "avatar upload target should be at least 44px high");
const desktopProfileChipFits = await admin.locator(".profile-chip").evaluate((chip) => {
  const outer = chip.getBoundingClientRect();
  const copy = chip.querySelector(".profile-chip-copy").getBoundingClientRect();
  return copy.left >= outer.left && copy.right <= outer.right + 0.5;
});
assert.equal(desktopProfileChipFits, true, "account identity should fit within the sidebar");
await admin.screenshot({ path: "work/qa/account-profile-desktop.png", fullPage: true });
await admin.goto(`${base}/problems/pdf-online`);
await expect(admin.getByRole("heading", { name: "在线阅读" })).toBeVisible();
await expect(admin.locator(".pdf-page")).toHaveCount(2);
await expect
  .poll(() => admin.locator(".pdf-page canvas").first().evaluate((canvas) => canvas.width))
  .toBeGreaterThan(0);
await admin.goto(`${base}/admin`);
await expect(admin.getByRole("heading", { name: "管理工作台" })).toBeVisible();
await expect(admin.getByRole("button", { name: "公告", exact: true })).toHaveClass(/active/);
await expect(admin.getByRole("heading", { name: "站内公告" })).toBeVisible();
await expect(admin.getByLabel("公告标题")).toBeVisible();
await admin.getByRole("button", { name: "文章" }).click();
await expect(admin.getByRole("button", { name: "文章" })).toHaveClass(/active/);
await expect(admin.getByLabel("搜索帖子")).toBeVisible();
await expect(admin.getByText("已通过的真实帖子")).toBeVisible();
await expect(admin.getByRole("button", { name: "下架", exact: true })).toBeVisible();
await admin.getByRole("button", { name: "设为首页必读" }).click();
await expect.poll(() => articlePinned).toBe(true);
await expect(admin.getByText("首页必读", { exact: true })).toBeVisible();
await expect(admin.locator(".markdown h2")).toHaveText("正文");
await admin.getByRole("button", { name: "下架", exact: true }).click();
await expect(admin.locator(".moderation-confirm")).toContainText("下架后公开页面将立即不可见");
await admin.getByRole("button", { name: "取消", exact: true }).click();
assert.equal(moderationDecision, null, "cancelling inline moderation must not submit");
await admin.getByRole("button", { name: "下架", exact: true }).click();
await admin.getByRole("button", { name: "确认下架", exact: true }).click();
await expect.poll(() => moderationDecision?.decision).toBe("hidden");
await expect(admin.getByText("已下架", { exact: true }).last()).toBeVisible();
await admin.screenshot({ path: "test-results/new-features-ui/admin-article-search.png", fullPage: true });
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
await expect(admin.getByText(/管理员可管理全部内容/)).toBeVisible();
await admin.getByRole("button", { name: "确认角色" }).click();
await expect.poll(() => accountPatch?.role).toBe("admin");
assert.equal("permissions" in accountPatch, false);
await admin.screenshot({
  path: "work/qa/production-admin.png",
  fullPage: true,
});
const subordinate = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
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
await subordinate.route("**/api/admin/announcements*", (r) =>
  r.fulfill({ json: { items: [{ id: "notice-mobile", title: "已发布公告", body: "检查窄屏操作区", published: true, updatedAt: "2026-09-26T00:00:00.000Z", publishedAt: "2026-09-26T00:00:00.000Z" }] } }),
);
await subordinate.goto(`${base}/admin`);
await expect(subordinate.getByRole("button", { name: "账号" })).toHaveCount(0);
await subordinate.getByRole("button", { name: /已发布公告/ }).click();
await subordinate.getByLabel("公告标题").fill("移动端公告");
await subordinate.getByLabel("公告内容").fill("检查公告操作按钮在窄屏下不会溢出。");
assert.equal(await subordinate.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "announcement admin actions must not overflow a narrow viewport");
await subordinate.screenshot({ path: "test-results/new-features-ui/announcement-admin-mobile.png", fullPage: true });
await subordinate.goto(`${base}/account`);
await expect(subordinate.getByRole("heading", { name: "个人头像" })).toBeVisible();
assert.equal(await subordinate.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "account profile must not overflow a 390px viewport");
const mobileProfileChipFits = await subordinate.locator(".profile-chip").evaluate((chip) => {
  const outer = chip.getBoundingClientRect();
  const copy = chip.querySelector(".profile-chip-copy").getBoundingClientRect();
  return copy.left >= outer.left && copy.right <= outer.right + 0.5;
});
assert.equal(mobileProfileChipFits, true, "account identity should remain inside its card on mobile");
await subordinate.screenshot({ path: "test-results/new-features-ui/account-profile-mobile.png", fullPage: true });
const authFlow = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
await authFlow.route("**/api/bootstrap", (r) => r.fulfill({ json: { user: null, config: { registrationEnabled: true, maxUploadBytes: 52428800 } } }));
let codeRequests = 0, resetPayload = null;
await authFlow.route("**/api/auth/request-code", async (r) => { codeRequests += 1; await new Promise((resolve) => setTimeout(resolve, 150)); return r.fulfill({ json: { ok: true, expiresIn: 180, cooldownSeconds: 60 } }); });
await authFlow.route("**/api/auth/reset-password", (r) => { resetPayload = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
await authFlow.goto(`${base}/auth`);
await authFlow.getByRole("button", { name: "注册" }).click();
await authFlow.getByLabel("邮箱", { exact: true }).fill("cooldown@example.test");
await authFlow.locator(".field-action button").click();
await expect(authFlow.getByRole("button", { name: "发送中…" })).toBeDisabled();
await expect.poll(() => codeRequests).toBe(1);
await expect(authFlow.getByText("若该邮箱可用于注册，验证码将发送；若收件箱中没有，请检查垃圾邮件或广告邮件。")).toBeVisible();
await expect(authFlow.getByLabel("邮箱验证码")).toHaveAttribute("inputmode", "numeric");
await authFlow.reload();
await authFlow.getByRole("button", { name: "注册" }).click();
await authFlow.getByLabel("邮箱", { exact: true }).fill("cooldown@example.test");
await expect(authFlow.getByRole("button", { name: /秒后可重发/ })).toBeDisabled();
await authFlow.getByRole("button", { name: "忘记密码" }).click();
await expect(authFlow.getByRole("button", { name: /秒后可重发/ })).toBeDisabled();
await authFlow.getByLabel("邮箱验证码").fill("123456");
await expect(authFlow.getByLabel("邮箱验证码")).toHaveValue("123456");
await authFlow.getByLabel("新密码").fill("new-password-123");
await authFlow.getByLabel("确认密码").fill("different-password");
await authFlow.getByRole("button", { name: "重置密码" }).click();
await expect(authFlow.getByText("两次输入的密码不一致")).toBeVisible();
assert.equal(resetPayload, null);
await authFlow.getByLabel("确认密码").fill("new-password-123");
await authFlow.getByRole("button", { name: "重置密码" }).click();
await expect(authFlow.getByText("密码已重置，请使用新密码登录。")).toBeVisible();
assert.equal(resetPayload.code, "123456");
await authFlow.goto(`${base}/topics`);
const topicNames = await authFlow.locator(".topic-card h2").allTextContents();
assert.equal(topicNames[0], "电赛方案");
assert.equal(topicNames.includes("控制与自动化"), false);
await browser.close();
console.log("Production UI checks passed.");
