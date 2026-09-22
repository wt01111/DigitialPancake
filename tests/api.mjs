import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join, resolve, sep, basename } from "node:path";
const testRoot = resolve("work");
await mkdir(testRoot, { recursive: true });
const temp = await mkdtemp(join(testRoot, "api-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = join(temp, "test.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:5173";
const [{ app }, { run, one, db }, { hashPassword }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
  import("../server/security.js"),
]);
const created = new Date().toISOString(),
  ownerId = "owner-test",
  memberId = "member-test",
  adminId = "admin-test",
  outsiderId = "outsider-test";
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',1,1,?,1)",
  ownerId,
  "owner@test.local",
  "Admin",
  await hashPassword("owner-test-password-123"),
  created,
);
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'member','[]',1,1,?,1)",
  memberId,
  "member@test.local",
  "Member",
  await hashPassword("member-test-password-123"),
  created,
);
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'admin','[\"content\",\"shop_reviews\"]',1,1,?,1)",
  adminId,
  "editor@test.local",
  "Editor",
  await hashPassword("editor-test-password-123"),
  created,
);
run(
  "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'member','[]',1,1,?,1)",
  outsiderId,
  "outsider@test.local",
  "Outsider",
  await hashPassword("outsider-test-password-123"),
  created,
);
const server = app.listen(0, "127.0.0.1"),
  port = await new Promise((resolve) =>
    server.on("listening", () => resolve(server.address().port)),
  ),
  base = `http://127.0.0.1:${port}`,
  origin = process.env.PUBLIC_ORIGIN;
async function request(
  path,
  { method = "GET", body, cookie, headers = {} } = {},
) {
  return fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function login(email, password) {
  const r = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
try {
  assert.equal((await request("/healthz")).status, 200);
  assert.deepEqual((await (await request("/api/shops?q=")).json()).items, []);
  assert.equal(one("SELECT COUNT(*) count FROM shops").count, 76);
  assert.equal(
    one("SELECT COUNT(*) count FROM reviews WHERE source_type='workbook'")
      .count,
    82,
  );
  assert.equal(one("SELECT COUNT(*) count FROM problems").count, 91);
  assert.equal(
    JSON.parse(
      one(
        "SELECT metadata FROM problems WHERE json_extract(metadata,'$.competitionType')='national' AND json_extract(metadata,'$.year')=2017 AND json_extract(metadata,'$.problemCode')='A'",
      ).metadata,
    ).group,
    "undergraduate",
  );
  assert.equal(
    JSON.parse(
      one(
        "SELECT metadata FROM problems WHERE json_extract(metadata,'$.competitionType')='national' AND json_extract(metadata,'$.year')=2025 AND json_extract(metadata,'$.problemCode')='K'",
      ).metadata,
    ).group,
    "vocational",
  );
  assert.deepEqual(
    (await (await request("/api/shops?q=%25不存在_%25")).json()).items,
    [],
  );
  const mixed = one(
    "SELECT s.id,s.name FROM shops s JOIN reviews r ON r.shop_id=s.id AND r.status='approved' GROUP BY s.id HAVING SUM(r.sentiment='positive')>0 AND SUM(r.sentiment='negative')>0 LIMIT 1",
  );
  assert.ok(mixed);
  const mixedResult = (
    await (
      await request(`/api/shops?q=${encodeURIComponent(mixed.name)}`)
    ).json()
  ).items.find((x) => x.id === mixed.id);
  assert.ok(mixedResult.positiveCount > 0 && mixedResult.negativeCount > 0);
  const owner = await login("owner@test.local", "owner-test-password-123"),
    member = await login("member@test.local", "member-test-password-123"),
    admin = await login("editor@test.local", "editor-test-password-123"),
    outsider = await login("outsider@test.local", "outsider-test-password-123");
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "Admin", password: "owner-test-password-123" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/admin/accounts", { cookie: member })).status,
    403,
  );
  assert.equal(
    (await request("/api/admin/accounts", { cookie: admin })).status,
    403,
  );
  let accounts = await (
    await request("/api/admin/accounts?q=outsider&page=1&pageSize=1", {
      cookie: owner,
    })
  ).json();
  assert.equal(accounts.total, 1);
  assert.equal(accounts.items[0].emailVerified, true);
  let r = await fetch(base + "/api/shops", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: member },
    body: JSON.stringify({ name: "bad csrf" }),
  });
  assert.equal(r.status, 403);
  r = await request("/api/shops", {
    method: "POST",
    cookie: member,
    body: { name: "API Test Shop", url: "https://example.test/store" },
  });
  assert.equal(r.status, 201);
  const shopId = (await r.json()).id;
  assert.equal(
    (await (await request("/api/shops?q=API Test")).json()).items.length,
    0,
  );
  r = await request(`/api/admin/shops/${shopId}/decision`, {
    method: "POST",
    cookie: owner,
    body: { decision: "approved" },
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await (await request("/api/shops?q=API Test")).json()).items.length,
    1,
  );
  const seeded = (await (await request("/api/shops?q=汕头华扬")).json())
      .items[0],
    form = new FormData();
  form.set("rating", "5");
  form.set("pros", "authentic");
  form.set("purchaseExperience", "private proof test");
  form.set(
    "proof",
    new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
    "proof.pdf",
  );
  r = await fetch(`${base}/api/shops/${seeded.id}/reviews`, {
    method: "POST",
    headers: { origin, cookie: member },
    body: form,
  });
  assert.equal(r.status, 201);
  const ownReviews = await (
      await request("/api/me/reviews", { cookie: member })
    ).json(),
    proofId = ownReviews.items[0].proofFileId;
  assert.ok(proofId);
  assert.equal(
    (await request(`/api/files/${proofId}`, { cookie: member })).status,
    200,
  );
  assert.equal((await request(`/api/files/${proofId}`)).status, 401);
  assert.equal(
    (await request(`/api/files/${proofId}`, { cookie: admin })).status,
    200,
  );
  assert.equal(
    (await request(`/api/files/${proofId}`, { cookie: outsider })).status,
    403,
  );
  r = await request("/api/articles/drafts", {
    method: "POST",
    cookie: member,
    body: { title: "Versioned article", body: "version one", tags: ["api"] },
  });
  const articleId = (await r.json()).id;
  await request(`/api/articles/drafts/${articleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  r = await request(`/api/admin/articles/${articleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: { decision: "approved" },
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await (await request(`/api/articles/${articleId}`)).json()).body,
    "version one",
  );
  await request(`/api/articles/drafts/${articleId}`, {
    method: "PATCH",
    cookie: member,
    body: { body: "unapproved version two" },
  });
  assert.equal(
    (await (await request(`/api/articles/${articleId}`)).json()).body,
    "version one",
  );
  await request(`/api/admin/articles/${articleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: { decision: "hidden" },
  });
  assert.equal((await request(`/api/articles/${articleId}`)).status, 404);
  r = await request("/api/admin/problems", {
    method: "POST",
    cookie: owner,
    body: {
      title: "滤波器赛题",
      year: 2025,
      category: "signal",
      competitionType: "national",
      competitionName: "全国大学生电子设计竞赛",
      group: "本科组",
      problemCode: "A",
      body: "赛题正文",
    },
  });
  assert.equal(r.status, 201);
  const problemId = (await r.json()).id;
  assert.equal(
    (
      await (
        await request(
          "/api/problems?year=2025&category=signal&group=本科组&competitionType=national",
        )
      ).json()
    ).items.some((x) => x.id === problemId),
    true,
  );
  r = await request(`/api/admin/problems/${problemId}`, {
    method: "PATCH",
    cookie: owner,
    body: { category: "control", status: "hidden" },
  });
  assert.equal(r.status, 200);
  assert.equal((await request(`/api/problems/${problemId}`)).status, 404);
  assert.equal(
    (
      await (
        await request("/api/admin/problems?status=hidden", { cookie: owner })
      ).json()
    ).items.some((x) => x.id === problemId),
    true,
  );
  assert.equal(
    (
      await request(`/api/admin/accounts/${ownerId}`, {
        method: "PATCH",
        cookie: owner,
        body: { role: "member", enabled: false },
      })
    ).status,
    403,
  );
  r = await request(`/api/admin/accounts/${outsiderId}`, {
    method: "PATCH",
    cookie: owner,
    body: { role: "admin", permissions: ["reports"] },
  });
  assert.equal(r.status, 200);
  assert.equal(
    one("SELECT role FROM users WHERE id=?", outsiderId).role,
    "admin",
  );
  assert.equal((await request("/api/me", { cookie: outsider })).status, 401);
  assert.equal(
    (
      await request(`/api/admin/accounts/${memberId}`, {
        method: "PATCH",
        cookie: owner,
        body: { permissions: "content" },
      })
    ).status,
    400,
  );
  for (let index = 0; index < 24; index++)
    run(
      "INSERT INTO problems VALUES(?,?,?,'published',?,?)",
      `page-problem-${index}`,
      `分页赛题 ${index}`,
      JSON.stringify({
        year: 2024,
        category: "signal",
        group: "all",
        competitionType: "provincial",
        competitionName: "陕西省大学生电子设计竞赛（TI杯）",
      }),
      ownerId,
      created,
    );
  const problemPage = await (
    await request("/api/problems?competitionType=provincial&page=2&pageSize=10")
  ).json();
  assert.equal(problemPage.items.length, 10);
  assert.ok(problemPage.total >= 24);
  assert.ok(problemPage.facets.years.includes(2024));
  assert.ok(problemPage.facets.groups.includes("all"));
  const officialFile = one("SELECT id FROM official_problem_files LIMIT 1");
  assert.ok(officialFile);
  assert.equal(
    (await request(`/api/official-files/${officialFile.id}`)).status,
    401,
  );
  assert.equal(
    (
      await request(`/api/official-files/${officialFile.id}`, {
        cookie: member,
      })
    ).status,
    200,
  );
  await request(`/api/articles/drafts/${articleId}`, {
    method: "PATCH",
    cookie: member,
    body: { body: "hidden edit must stay hidden" },
  });
  assert.equal((await request(`/api/articles/${articleId}`)).status, 404);
  await request(`/api/admin/accounts/${adminId}`, {
    method: "PATCH",
    cookie: owner,
    body: { enabled: false },
  });
  assert.equal((await request("/api/me", { cookie: admin })).status, 401);
  assert.equal(one("SELECT COUNT(*) count FROM audit").count > 0, true);
  console.log(
    "PASS: API auth, CSRF, visibility, versioned publishing, RBAC invalidation",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  const resolved = resolve(temp);
  if (
    !resolved.startsWith(testRoot + sep) ||
    !basename(resolved).startsWith("api-test-")
  )
    throw new Error("Unsafe test cleanup target");
  await rm(resolved, { recursive: true, force: true });
}
