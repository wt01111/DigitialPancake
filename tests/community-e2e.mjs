import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join, resolve, sep } from "node:path";
const work = resolve("work");
await mkdir(work, { recursive: true });
const temp = await mkdtemp(join(work, "community-e2e-")),
  reservation = createServer();
await new Promise((ok, fail) =>
  reservation.once("error", fail).listen(0, "127.0.0.1", ok),
);
const port = reservation.address().port;
await new Promise((ok) => reservation.close(ok));
const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  PUBLIC_ORIGIN: base,
  DATABASE_PATH: join(temp, "site.sqlite"),
  UPLOAD_DIR: join(temp, "uploads"),
  MIN_FREE_BYTES: "0",
});
const [{ app }, { run, one, all, db }, { hashPassword }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
  import("../server/security.js"),
]);
const created = new Date().toISOString();
for (const u of [
  [
    "community-owner",
    "owner@community.test",
    "Admin",
    "owner",
    await hashPassword("owner-community-password-123"),
  ],
  [
    "community-member",
    "member@community.test",
    "社区成员",
    "member",
    await hashPassword("member-community-password-123"),
  ],
])
  run(
    "INSERT INTO users(id,email,nickname,role,password_hash,permissions,enabled,session_version,created_at,email_verified,bio) VALUES(?,?,?,?,?,'[]',1,1,?,1,'社区测试')",
    ...u.slice(0, 4),
    u[4],
    created,
  );
const server = app.listen(port, "127.0.0.1");
await new Promise((ok) => server.once("listening", ok));
async function api(path, { method = "GET", body, cookie, form } = {}) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" ? { origin: base } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
}
async function apiLogin(email, password) {
  const r = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
const memberCookie = await apiLogin(
    "member@community.test",
    "member-community-password-123",
  ),
  ownerCookie = await apiLogin(
    "owner@community.test",
    "owner-community-password-123",
  );
let r = await api("/articles/drafts", {
  method: "POST",
  cookie: memberCookie,
  body: { title: "社区端到端文章", body: "正文" },
});
const articleId = (await r.json()).id;
const form = new FormData();
form.set(
  "image",
  new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  ),
  "正文示意图.png",
);
r = await api(`/articles/drafts/${articleId}/images`, {
  method: "POST",
  cookie: memberCookie,
  form,
});
assert.equal(r.status, 201);
const image = await r.json();
await api(`/articles/drafts/${articleId}`, {
  method: "PATCH",
  cookie: memberCookie,
  body: { body: `正文图片\n\n${image.markdown}` },
});
await api(`/articles/drafts/${articleId}/submit`, {
  method: "POST",
  cookie: memberCookie,
  body: {},
});
await api(`/admin/articles/${articleId}/decision`, {
  method: "POST",
  cookie: ownerCookie,
  body: {
    decision: "approved",
    expectedUpdatedAt: one(
      "SELECT updated_at FROM articles WHERE id=?",
      articleId,
    ).updated_at,
  },
});
const shop = one("SELECT id FROM shops WHERE status='approved' LIMIT 1"),
  [pdf, pdf2] = all(
    "SELECT problem_id problemId,MIN(original_name) name FROM official_problem_files GROUP BY problem_id LIMIT 2",
  );
const browser = await chromium.launch({
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  headless: true,
});
const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    locale: "zh-CN",
  }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function login(email, password) {
  await page.goto(`${base}/auth`);
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).last().click();
  await page.waitForURL((url) => !url.pathname.endsWith("/auth"));
}
async function logout() {
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("link", { name: "登录 / 注册" })).toBeVisible();
}
try {
  let anonymousPdfRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/official-files/")) anonymousPdfRequests++;
  });
  await page.goto(`${base}/problems/${pdf.problemId}`);
  await page.waitForTimeout(600);
  assert.equal(anonymousPdfRequests, 0);
  await expect(page.locator(".pdf-inline-reader")).toHaveCount(0);
  await page.goto(`${base}/articles/${articleId}`);
  await expect(page.locator(`img[src="${image.markdownUrl}"]`)).toBeVisible();
  await login("member@community.test", "member-community-password-123");
  await page.goto(`${base}/articles/${articleId}`);
  await page.getByLabel("参与讨论").fill("成员主评论");
  await page.getByRole("button", { name: "发表评论" }).click();
  await expect(page.getByText("成员主评论")).toBeVisible();
  await logout();
  await login("owner@community.test", "owner-community-password-123");
  await page.goto(`${base}/articles/${articleId}`);
  const comment = page
    .locator("article.comment")
    .filter({ hasText: "成员主评论" });
  await comment.getByRole("button", { name: "赞 0" }).click();
  await expect(comment.getByRole("button", { name: "赞 1" })).toBeVisible();
  await comment.getByRole("button", { name: "回复" }).click();
  await comment.getByLabel("回复 社区成员").fill("Owner 的真实回复");
  await comment.getByRole("button", { name: "提交" }).click();
  await expect(page.getByText("Owner 的真实回复")).toBeVisible();
  await comment.getByRole("button", { name: "举报" }).click();
  await comment.getByLabel("举报原因").fill("真实举报链路核查");
  await comment.getByRole("button", { name: "提交" }).click();
  await expect(page.getByText("举报已提交审核")).toBeVisible();
  await page.goto(`${base}/admin`);
  await page.getByRole("button", { name: "举报", exact: true }).click();
  await expect(page.getByText("真实举报链路核查")).toBeVisible();
  await logout();
  await login("member@community.test", "member-community-password-123");
  await page.goto(`${base}/account?tab=notifications`);
  await page.getByRole("button", { name: "标为已读并查看" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/articles/${articleId}#comment-`));
  await expect(page.getByText("Owner 的真实回复")).toBeVisible();
  const own = page.locator("article.comment").filter({ hasText: "成员主评论" });
  await own.getByRole("button", { name: "删除" }).click();
  await own.getByRole("button", { name: "确认删除" }).click();
  await page.reload();
  await expect(page.getByText("该评论已删除，后续回复保留。")).toBeVisible();
  await expect(page.getByText("Owner 的真实回复")).toBeVisible();
  await page.goto(`${base}/shops/${shop.id}`);
  await page.getByRole("button", { name: "收藏" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "取消收藏" })).toBeVisible();
  await page.goto(`${base}/problems/${pdf.problemId}`);
  await expect(page.locator(".pdf-inline-reader")).toBeVisible();
  await expect(page.getByText("第 1 页 · 已显示")).toBeVisible({
    timeout: 20000,
  });
  const canvas = page.locator('.pdf-page[data-page="1"] canvas');
  await expect
    .poll(() =>
      canvas.evaluate(
        (c) =>
          c.width > 0 &&
          c.height > 0 &&
          c
            .getContext("2d")
            .getImageData(0, 0, Math.min(32, c.width), Math.min(32, c.height))
            .data.some((v, i) => i % 4 === 3 && v > 0),
      ),
    )
    .toBeTruthy();
  await page.locator(".pdf-continuous").hover();
  await page.mouse.wheel(0, 1400);
  await page.mouse.wheel(0, 1400);
  await expect(page.locator('.pdf-page[data-page="2"] canvas')).toHaveAttribute(
    "width",
    /[1-9]/,
    { timeout: 20000 },
  );
  await page.goto(`${base}/problems/${pdf2.problemId}`);
  await expect(page.locator(".pdf-inline-reader")).toBeVisible();
  await expect(page.locator(".pdf-toolbar > strong")).toContainText(pdf2.name);
  await expect(page.getByText(pdf.name, { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("PASS: real community UI + Express flows");
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
  db.close();
  const target = resolve(temp);
  assert.ok(
    target.startsWith(work + sep) &&
      basename(target).startsWith("community-e2e-"),
  );
  await rm(target, { recursive: true, force: true });
}
