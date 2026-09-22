import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join, resolve, sep } from "node:path";

const testRoot = resolve("work");
await mkdir(testRoot, { recursive: true });
const temp = await mkdtemp(join(testRoot, "e2e-test-"));
const reserved = createServer();
await new Promise((ok, fail) =>
  reserved.once("error", fail).listen(0, "127.0.0.1", ok),
);
const port = reserved.address().port;
await new Promise((ok) => reserved.close(ok));
const base = `http://127.0.0.1:${port}`;
process.env.NODE_ENV = "test";
process.env.PUBLIC_ORIGIN = base;
process.env.DATABASE_PATH = join(temp, "site.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.MIN_FREE_BYTES = "0";
const [{ app }, { run, db }, { hashPassword }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
  import("../server/security.js"),
]);
const created = new Date().toISOString();
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',1,1,?,1)",
  "owner-e2e",
  "owner@e2e.local",
  "Admin",
  await hashPassword("owner-e2e-password-123"),
  created,
);
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'member','[]',1,1,?,1)",
  "member-e2e",
  "member@e2e.local",
  "测试成员",
  await hashPassword("member-e2e-password-123"),
  created,
);
const server = app.listen(port, "127.0.0.1");
await new Promise((ok) => server.once("listening", ok));
const browser = await chromium.launch({
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const attachment = join(temp, "电路调试记录.pdf");
await writeFile(attachment, "%PDF-1.4\nE2E attachment\n%%EOF");
async function login(account, password) {
  await page.goto(`${base}/auth`);
  await page.getByLabel("邮箱", { exact: true }).fill(account);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).last().click();
  await page.waitForURL((url) => !url.pathname.endsWith("/auth"));
}
async function logout() {
  const button = page.getByRole("button", { name: "退出" });
  if (await button.count()) {
    await button.click();
    await expect(page.getByRole("link", { name: "登录 / 注册" })).toBeVisible();
  }
}
try {
  await login("member@e2e.local", "member-e2e-password-123");
  await page.goto(`${base}/shops/submit`);
  await page.getByLabel("店铺名称").fill("端到端器件店");
  await page.getByLabel("所在平台").fill("测试平台");
  await page.getByLabel("经营范围").fill("STM32 与测量模块");
  await page.getByLabel("店铺链接").fill("https://example.test/e2e-shop");
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("已提交审核。")).toBeVisible();
  await logout();
  await login("owner@e2e.local", "owner-e2e-password-123");
  await page.goto(`${base}/admin`);
  await page.getByRole("button", { name: "店铺", exact: true }).click();
  const shopCard = page
    .locator(".record-list article")
    .filter({ hasText: "端到端器件店" });
  await expect(shopCard).toContainText("STM32 与测量模块");
  await expect(shopCard).toContainText("https://example.test/e2e-shop");
  await shopCard.getByRole("button", { name: "通过", exact: true }).click();
  await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByLabel("搜索用户").fill("member@e2e.local");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const memberAccount = page
    .locator(".record-list article")
    .filter({ hasText: "member@e2e.local" });
  await memberAccount.getByRole("button", { name: "管理此用户" }).click();
  await expect(
    page.getByRole("heading", { name: "确认管理目标" }),
  ).toBeVisible();
  await page.getByLabel("角色").selectOption("admin");
  await page.getByLabel("文章与赛题").check();
  await page.getByRole("button", { name: "确认角色与权限" }).click();
  await expect(page.getByText(/已更新.*member@e2e\.local/)).toBeVisible();
  await logout();
  await page.goto(`${base}/shops`);
  await page.getByPlaceholder("输入店铺名称或关键词").fill("端到端器件店");
  await page.getByPlaceholder("输入店铺名称或关键词").press("Enter");
  await expect(
    page.getByRole("heading", { name: "端到端器件店" }),
  ).toBeVisible();
  await login("member@e2e.local", "member-e2e-password-123");
  await page.goto(`${base}/write`);
  await page.getByLabel("标题").fill("端到端 Markdown 调试记录");
  await page.getByLabel("摘要").fill("真实前后端审核测试");
  await page
    .getByLabel("Markdown")
    .fill(
      "## E2E 正文\n\n这段正文必须出现在审核页和公开详情。\n\n```c\nint main(void){return 0;}\n```",
    );
  await page.getByLabel(/附件（单个不超过/).setInputFiles(attachment);
  await page.getByRole("button", { name: "提交审核" }).click();
  await page.waitForURL(/\/account/);
  await logout();
  await login("owner@e2e.local", "owner-e2e-password-123");
  await page.goto(`${base}/admin`);
  const articleCard = page
    .locator(".record-list article")
    .filter({ hasText: "端到端 Markdown 调试记录" });
  await expect(articleCard).toContainText("这段正文必须出现在审核页和公开详情");
  await expect(articleCard).toContainText("电路调试记录.pdf");
  await articleCard.getByRole("button", { name: "通过", exact: true }).click();
  await logout();
  await login("member@e2e.local", "member-e2e-password-123");
  await page.goto(`${base}/articles`);
  await page.getByRole("link", { name: "端到端 Markdown 调试记录" }).click();
  await expect(
    page.getByText("这段正文必须出现在审核页和公开详情"),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /电路调试记录\.pdf/ }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "电路调试记录.pdf");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real React + Express shop/article moderation and private attachment E2E",
  );
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
  db.close();
  const target = resolve(temp);
  if (
    !target.startsWith(testRoot + sep) ||
    !basename(target).startsWith("e2e-test-")
  )
    throw new Error("Unsafe E2E cleanup target");
  await rm(target, { recursive: true, force: true });
}
