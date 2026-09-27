import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

const testRoot = resolve("work");
const temp = await mkdtemp(join(testRoot, "profile-community-test-"));
process.env.DATABASE_PATH = join(temp, "site.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:5173";
process.env.SESSION_SECRET = "profile-community-test-secret-32-bytes-minimum";
process.env.SESSION_DAYS = "90";
process.env.MIN_FREE_BYTES = "0";

const { hashPassword } = await import("../server/security.js");
const password = "profile-community-password";
const passwordHash = await hashPassword(password);
const createdAt = new Date().toISOString();
const setupDb = new DatabaseSync(process.env.DATABASE_PATH);
setupDb.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,nickname TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',permissions TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,session_version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE site_announcements(id TEXT PRIMARY KEY CHECK(id='home'),draft_title TEXT NOT NULL,draft_body TEXT NOT NULL,published_title TEXT,published_body TEXT,is_published INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,published_at TEXT,updated_by TEXT,FOREIGN KEY(updated_by) REFERENCES users(id));`);
setupDb.prepare(
  `INSERT INTO users
   (id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at)
   VALUES(?,?,?,?, 'owner','[]',1,1,?)`,
).run("owner-1", "owner@example.test", "站长", passwordHash, createdAt);
setupDb.prepare(
  `INSERT INTO site_announcements
   (id,draft_title,draft_body,published_title,published_body,is_published,updated_at,published_at,updated_by)
   VALUES('home',?,?,?,?,1,?,?,?)`,
).run(
  "旧公告的新草稿",
  "尚未重新发布",
  "旧公告的公开标题",
  "旧公告的公开正文",
  createdAt,
  "2025-01-01T00:00:00.000Z",
  "owner-1",
);
setupDb.close();
const [{ app }, { db }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
]);

const server = app.listen(0, "127.0.0.1");
await new Promise((resolveReady) => server.once("listening", resolveReady));
const base = `http://127.0.0.1:${server.address().port}`;
const origin = process.env.PUBLIC_ORIGIN;
let cookie = "";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("cookie", cookie);
  if (!headers.has("content-type") && options.body && !(options.body instanceof FormData))
    headers.set("content-type", "application/json");
  if (!['GET', 'HEAD'].includes(options.method || 'GET')) headers.set("origin", origin);
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  return response;
}

const avatarBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function pausedAvatarUpload(name) {
  const boundary = `avatar-race-${crypto.randomUUID()}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  let finish;
  const response = new Promise((resolveResponse, rejectResponse) => {
    const uploadRequest = httpRequest(
      `${base}/api/me/avatar`,
      {
        method: "POST",
        headers: {
          cookie,
          origin,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": prefix.length + avatarBytes.length + suffix.length,
        },
      },
      (uploadResponse) => {
        const chunks = [];
        uploadResponse.on("data", (chunk) => chunks.push(chunk));
        uploadResponse.on("end", () =>
          resolveResponse({
            status: uploadResponse.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );
    uploadRequest.on("error", rejectResponse);
    uploadRequest.write(Buffer.concat([prefix, avatarBytes]));
    finish = () => uploadRequest.end(suffix);
  });
  return { finish: () => finish(), response };
}

try {
  let response = await request("/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.test", password },
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /Max-Age=7776000/i, "session should persist for 90 days");
  cookie = setCookie.split(";")[0];
  db.prepare("UPDATE sessions SET expires_at=?").run(
    new Date(Date.now() + 7 * 864e5).toISOString(),
  );
  response = await request("/api/bootstrap");
  assert.match(
    response.headers.get("set-cookie") || "",
    /Max-Age=7776000/i,
    "an existing seven-day session should be extended without another login",
  );
  const migratedAnnouncements = await (
    await request("/api/admin/announcements")
  ).json();
  const migratedLegacy = migratedAnnouncements.items.find(
    (item) => item.id === "announcement-legacy-home",
  );
  assert.equal(migratedLegacy.status, "published");
  assert.equal(migratedLegacy.title, "旧公告的新草稿");
  assert.equal(migratedLegacy.publishedTitle, "旧公告的公开标题");
  response = await request(
    "/api/admin/announcements/announcement-legacy-home/unpublish",
    {
      method: "POST",
      body: { expectedUpdatedAt: migratedLegacy.updatedAt },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await (await request("/api/announcement")).json(), {
    announcement: null,
  });

  const avatar = new FormData();
  avatar.set(
    "avatar",
    new Blob([avatarBytes], { type: "image/png" }),
    "avatar.png",
  );
  response = await request("/api/me/avatar", { method: "POST", body: avatar });
  assert.equal(response.status, 201);
  const uploadedAvatar = await response.json();
  assert.match(uploadedAvatar.avatarUrl, /^\/api\/avatars\/file-/);
  response = await request(uploadedAvatar.avatarUrl);
  assert.equal(response.status, 200);
  assert.equal((await request("/api/me")).status, 200);

  const concurrentUploads = [
    pausedAvatarUpload("concurrent-a.png"),
    pausedAvatarUpload("concurrent-b.png"),
  ];
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await readdir(process.env.UPLOAD_DIR)).length === 3) break;
    await delay(10);
  }
  assert.equal(
    (await readdir(process.env.UPLOAD_DIR)).length,
    3,
    "both requests should reach avatar storage before either transaction starts",
  );
  concurrentUploads.forEach((upload) => upload.finish());
  const concurrentResponses = await Promise.all(
    concurrentUploads.map((upload) => upload.response),
  );
  assert.deepEqual(
    concurrentResponses.map((result) => result.status),
    [201, 201],
  );
  const currentAvatarId = db
    .prepare("SELECT avatar_file_id FROM users WHERE id=?")
    .get("owner-1").avatar_file_id;
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM files WHERE kind='avatar'").get().count,
    1,
    "overlapping avatar uploads must not leave an orphan file record",
  );
  assert.equal(
    (await readdir(process.env.UPLOAD_DIR)).length,
    1,
    "overlapping avatar uploads must not leave an orphan file on disk",
  );
  assert.equal((await request(`/api/avatars/${currentAvatarId}`)).status, 200);

  const tooLarge = new FormData();
  tooLarge.set(
    "avatar",
    new Blob([new Uint8Array(512 * 1024 + 1)], { type: "image/png" }),
    "large.png",
  );
  response = await request("/api/me/avatar", { method: "POST", body: tooLarge });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "LIMIT_FILE_SIZE");

  const truncated = new FormData();
  truncated.set(
    "avatar",
    new Blob([
      Uint8Array.from([
        137, 80, 78, 71, 13, 10, 26, 10,
        0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1,
      ]),
    ], { type: "image/png" }),
    "truncated.png",
  );
  response = await request("/api/me/avatar", { method: "POST", body: truncated });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_AVATAR");

  for (const [name, type, bytes] of [
    [
      "truncated.jpg",
      "image/jpeg",
      Uint8Array.from([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00,
        0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      ]),
    ],
    [
      "truncated.webp",
      "image/webp",
      Uint8Array.from([
        82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80,
        86, 80, 56, 88, 20, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
      ]),
    ],
  ]) {
    const broken = new FormData();
    broken.set("avatar", new Blob([bytes], { type }), name);
    response = await request("/api/me/avatar", { method: "POST", body: broken });
    assert.equal(response.status, 400, `${name} should be rejected`);
    assert.equal((await response.json()).code, "INVALID_AVATAR");
  }

  const oversizedDimensions = new FormData();
  oversizedDimensions.set(
    "avatar",
    new Blob([
      Uint8Array.from([
        137, 80, 78, 71, 13, 10, 26, 10,
        0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 8, 1, 0, 0, 0, 1,
      ]),
    ], { type: "image/png" }),
    "wide.png",
  );
  response = await request("/api/me/avatar", {
    method: "POST",
    body: oversizedDimensions,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_AVATAR");

  const articleInsert = db.prepare(
    `INSERT INTO articles
     (id,user_id,title,body,tags,status,created_at,updated_at,published_at,published_payload,published_visible)
     VALUES(?,?,?,?,?,'approved',?,?,?,?,1)`,
  );
  for (const [articleId, title, publishedAt] of [
    ["article-old", "较早文章", "2026-01-01T00:00:00.000Z"],
    ["article-new", "最新文章", "2026-02-01T00:00:00.000Z"],
  ])
    articleInsert.run(
      articleId,
      "owner-1",
      title,
      "正文",
      "[]",
      publishedAt,
      publishedAt,
      publishedAt,
      JSON.stringify({
        title,
        body: "正文",
        tags: [],
        author: { id: "owner-1", nickname: "站长" },
      }),
    );

  response = await request("/api/articles/article-old/star", { method: "POST" });
  assert.deepEqual(await response.json(), { starred: true, starCount: 1 });
  let articles = await (await request("/api/articles?sort=stars")).json();
  assert.equal(articles.items[0].id, "article-old");
  assert.equal(articles.items[0].starred, true);

  response = await request("/api/admin/articles/article-old/pin", {
    method: "POST",
    body: { pinned: true },
  });
  assert.equal(response.status, 200);
  articles = await (await request("/api/articles?home=1")).json();
  assert.equal(articles.items[0].id, "article-old");
  assert.equal(articles.items[0].pinned, true);

  response = await request("/api/articles/article-old/star", { method: "DELETE" });
  assert.deepEqual(await response.json(), { starred: false, starCount: 0 });

  response = await request("/api/admin/announcements", {
    method: "POST",
    body: { title: "第一条公告", body: "公告正文" },
  });
  assert.equal(response.status, 201);
  let announcement = await response.json();
  response = await request(`/api/admin/announcements/${announcement.id}/publish`, {
    method: "POST",
    body: { expectedUpdatedAt: announcement.updatedAt },
  });
  assert.equal(response.status, 200);
  announcement = await response.json();
  assert.equal(announcement.published, true);
  const announcements = await (await request("/api/announcements?limit=3")).json();
  assert.equal(announcements.items.length, 1);
  assert.equal(announcements.items[0].title, "第一条公告");
  const latest = await (await request("/api/announcement")).json();
  assert.equal(latest.announcement.id, announcement.id);

  response = await request("/api/me/avatar", { method: "DELETE" });
  assert.deepEqual(await response.json(), { avatarUrl: null });
  console.log("PASS: avatar, persistent session, article stars/pinning, announcement history");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  db.close();
  const resolved = resolve(temp);
  if (
    !resolved.startsWith(testRoot + sep) ||
    !resolved.split(sep).at(-1).startsWith("profile-community-test-")
  )
    throw new Error(`Refusing to remove unexpected test path: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
}
