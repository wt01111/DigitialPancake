import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

const testRoot = resolve("work");
await mkdir(testRoot, { recursive: true });
const temp = await mkdtemp(join(testRoot, "review-limit-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = join(temp, "test.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:5173";
process.env.SUBMIT_RATE_LIMIT = "100";

const [{ app }, { db, one, run }, { hashPassword }] = await Promise.all([
  import("../server/app.js"),
  import("../server/db.js"),
  import("../server/security.js"),
]);
const created = new Date().toISOString();
for (const [id, email] of [
  ["limit-user", "limit-user@example.test"],
  ["other-user", "other-user@example.test"],
]) {
  run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'member','[]',1,1,?,1)",
    id,
    email,
    id,
    await hashPassword("review-limit-password"),
    created,
  );
}
for (const shopId of ["limit-shop", "other-shop"])
  run(
    "INSERT INTO shops(id,name,status,created_at,updated_at) VALUES(?,?,'approved',?,?)",
    shopId,
    shopId,
    created,
    created,
  );

const server = app.listen(0, "127.0.0.1");
const port = await new Promise((resolveListening) =>
  server.on("listening", () => resolveListening(server.address().port)),
);
const base = `http://127.0.0.1:${port}`;
async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.PUBLIC_ORIGIN },
    body: JSON.stringify({ email, password: "review-limit-password" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}
async function submit(shopId, cookie, sentiment = "positive", withProof = false) {
  const body = new FormData();
  body.set("sentiment", sentiment);
  body.set("content", `评价 ${sentiment}`);
  if (withProof)
    body.set(
      "proof",
      new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }),
      "should-not-upload.pdf",
    );
  return fetch(`${base}/api/shops/${shopId}/reviews`, {
    method: "POST",
    headers: { origin: process.env.PUBLIC_ORIGIN, cookie },
    body,
  });
}

try {
  const member = await login("limit-user@example.test");
  const other = await login("other-user@example.test");
  for (const sentiment of ["positive", "neutral", "negative", "positive", "negative"])
    assert.equal((await submit("limit-shop", member, sentiment)).status, 201);

  let detail = await (await fetch(`${base}/api/shops/limit-shop`, { headers: { cookie: member } })).json();
  assert.equal(detail.reviewLimit, 5);
  assert.equal(detail.myReviewCount, 5);
  assert.equal(detail.myReviewRemaining, 0);

  const sixth = await submit("limit-shop", member, "neutral", true);
  assert.equal(sixth.status, 409);
  assert.equal((await sixth.json()).code, "REVIEW_LIMIT_REACHED");
  assert.equal((await readdir(process.env.UPLOAD_DIR)).length, 0, "limit must reject before proof upload");

  const firstReview = one(
    "SELECT id FROM reviews WHERE user_id=? AND shop_id=? AND source_type='site' ORDER BY created_at LIMIT 1",
    "limit-user",
    "limit-shop",
  );
  let existingAction = await fetch(`${base}/api/reviews/${firstReview.id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: process.env.PUBLIC_ORIGIN,
      cookie: member,
    },
    body: JSON.stringify({ sentiment: "neutral", content: "满额后仍可编辑已有评价" }),
  });
  assert.equal(existingAction.status, 200, "the limit must not block editing an existing review");
  existingAction = await fetch(`${base}/api/reviews/${firstReview.id}/submit`, {
    method: "POST",
    headers: { origin: process.env.PUBLIC_ORIGIN, cookie: member },
  });
  assert.equal(existingAction.status, 200, "the limit must not block resubmitting an existing review");
  assert.equal(
    (
      await fetch(`${base}/api/reviews/${firstReview.id}/withdraw`, {
        method: "POST",
        headers: { origin: process.env.PUBLIC_ORIGIN, cookie: member },
      })
    ).status,
    200,
  );
  assert.equal((await submit("limit-shop", member)).status, 409, "withdrawn reviews still use a slot");
  assert.equal((await submit("other-shop", member)).status, 201, "limit is per shop");
  assert.equal((await submit("limit-shop", other)).status, 201, "limit is per user");

  assert.throws(
    () =>
      run(
        "INSERT INTO reviews(id,shop_id,user_id,source_type,status,created_at,updated_at) VALUES(?,?,?,'site','draft',?,?)",
        "direct-sixth",
        "limit-shop",
        "limit-user",
        created,
        created,
      ),
    /REVIEW_LIMIT_REACHED/,
    "database trigger must provide the final concurrency-safe guard",
  );
  assert.equal(
    one("SELECT COUNT(*) count FROM reviews WHERE user_id=? AND shop_id=? AND source_type='site'", "limit-user", "limit-shop").count,
    5,
  );
  console.log("PASS: shop review five-item limit and pre-upload guard");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  db.close();
  const resolved = resolve(temp);
  if (!resolved.startsWith(testRoot + sep) || !basename(resolved).startsWith("review-limit-test-"))
    throw new Error("Unsafe test cleanup target");
  await rm(resolved, { recursive: true, force: true });
}
