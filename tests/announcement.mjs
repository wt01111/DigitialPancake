import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

const testRoot = resolve("work");
await mkdir(testRoot, { recursive: true });
const temp = await mkdtemp(join(testRoot, "announcement-test-"));
const databasePath = join(temp, "test.sqlite");
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:5173";
process.env.SUBMIT_RATE_LIMIT = "100";
process.env.ICP_FILING_NUMBER = "";

const [{ app }, { db, one, run }, { hashPassword }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
  import("../server/security.js"),
]);
const created = new Date().toISOString();
for (const [id, email, role] of [
  ["announcement-admin", "announcement-admin@example.test", "admin"],
  ["announcement-member", "announcement-member@example.test", "member"],
])
  run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?,?,'[]',1,1,?,1)",
    id,
    email,
    id,
    await hashPassword("announcement-password"),
    role,
    created,
  );

const server = app.listen(0, "127.0.0.1");
const port = await new Promise((done) =>
  server.on("listening", () => done(server.address().port)),
);
const base = `http://127.0.0.1:${port}`;
async function request(path, { method = "GET", body, cookie } = {}) {
  return fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" ? { origin: process.env.PUBLIC_ORIGIN } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: "announcement-password" },
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

try {
  const admin = await login("announcement-admin@example.test"),
    member = await login("announcement-member@example.test");
  assert.equal((await request("/api/admin/announcement")).status, 401);
  assert.equal((await request("/api/admin/announcement", { cookie: member })).status, 403);
  assert.deepEqual(await (await request("/api/announcement")).json(), { announcement: null });

  let response = await request("/api/admin/announcement", {
    method: "PUT",
    cookie: admin,
    body: { title: "", body: "", expectedUpdatedAt: null },
  });
  assert.equal(response.status, 400);
  response = await request("/api/admin/announcement", {
    method: "PUT",
    cookie: member,
    body: { title: "越权", body: "不应保存", expectedUpdatedAt: null },
  });
  assert.equal(response.status, 403);

  response = await request("/api/admin/announcement", {
    method: "PUT",
    cookie: admin,
    body: {
      title: "维护通知",
      body: '<img src=x onerror="globalThis.xss=1">\n第二行',
      expectedUpdatedAt: null,
    },
  });
  assert.equal(response.status, 200);
  let adminView = await response.json();
  assert.equal(adminView.published, false);
  assert.deepEqual(await (await request("/api/announcement")).json(), { announcement: null });

  response = await request("/api/admin/announcement", {
    method: "PUT",
    cookie: admin,
    body: { title: "过期改动", body: "不应覆盖", expectedUpdatedAt: null },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "STALE_ANNOUNCEMENT");

  response = await request("/api/admin/announcement/publish", {
    method: "POST",
    cookie: admin,
    body: { expectedUpdatedAt: adminView.updatedAt },
  });
  assert.equal(response.status, 200);
  adminView = await response.json();
  let publicView = (await (await request("/api/announcement")).json()).announcement;
  assert.equal(publicView.title, "维护通知");
  assert.equal(publicView.body, '<img src=x onerror="globalThis.xss=1">\n第二行');
  assert.equal(publicView.format, "plain_text");

  response = await request("/api/admin/announcement", {
    method: "DELETE",
    cookie: admin,
    body: { expectedUpdatedAt: adminView.updatedAt },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await (await request("/api/announcement")).json(), { announcement: null });

  response = await request("/api/admin/announcement", {
    method: "PUT",
    cookie: admin,
    body: { title: "长期公告", body: "重启后仍应保留", expectedUpdatedAt: null },
  });
  adminView = await response.json();
  response = await request("/api/admin/announcement/publish", {
    method: "POST",
    cookie: admin,
    body: { expectedUpdatedAt: adminView.updatedAt },
  });
  adminView = await response.json();
  response = await request("/api/admin/announcement/unpublish", {
    method: "POST",
    cookie: admin,
    body: { expectedUpdatedAt: adminView.updatedAt },
  });
  assert.equal(response.status, 200);
  adminView = await response.json();
  assert.deepEqual(await (await request("/api/announcement")).json(), { announcement: null });
  response = await request("/api/admin/announcement/publish", {
    method: "POST",
    cookie: admin,
    body: { expectedUpdatedAt: adminView.updatedAt },
  });
  assert.equal(response.status, 200);
  assert.ok(one("SELECT COUNT(*) count FROM audit WHERE entity_type='announcement'").count >= 6);
} finally {
  await new Promise((done) => server.close(done));
  db.close();
}

const reopened = new DatabaseSync(databasePath);
try {
  const persisted = reopened
    .prepare("SELECT published_title,published_body,is_published FROM site_announcements WHERE id='home'")
    .get();
  assert.equal(persisted.published_title, "长期公告");
  assert.equal(persisted.published_body, "重启后仍应保留");
  assert.equal(persisted.is_published, 1);
  console.log("PASS: announcement authorization, lifecycle, concurrency, plain text and persistence");
} finally {
  reopened.close();
  const resolved = resolve(temp);
  if (!resolved.startsWith(testRoot + sep) || !basename(resolved).startsWith("announcement-test-"))
    throw new Error("Unsafe test cleanup target");
  await rm(resolved, { recursive: true, force: true });
}
