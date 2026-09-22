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
process.env.SUBMIT_RATE_LIMIT = "200";
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
function decisionBody(table, id, decision, extra = {}) {
  return {
    decision,
    ...(decision === "hidden"
      ? {}
      : { expectedUpdatedAt: one(`SELECT updated_at FROM ${table} WHERE id=?`, id).updated_at }),
    ...extra,
  };
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
    body: decisionBody("shops", shopId, "approved"),
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await (await request("/api/shops?q=API Test")).json()).items.length,
    1,
  );
  const seeded = (await (await request("/api/shops?q=汕头华扬")).json())
      .items[0],
    form = new FormData();
  form.set("sentiment", "positive");
  form.set("content", "authentic components and a smooth purchase");
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
    body: decisionBody("articles", articleId, "approved"),
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
  r = await request("/api/articles/drafts", {
    method: "POST",
    cookie: member,
    body: { title: "Image article", body: "image draft" },
  });
  const imageArticleId = (await r.json()).id;
  async function uploadImage(name) {
    const data = new FormData();
    data.set(
      "image",
      new Blob(
        [
          Buffer.from([
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68,
          ]),
        ],
        { type: "image/png" },
      ),
      name,
    );
    const response = await fetch(
      `${base}/api/articles/drafts/${imageArticleId}/images`,
      { method: "POST", headers: { origin, cookie: member }, body: data },
    );
    if (response.status !== 201)
      assert.fail(
        `image upload failed: ${response.status} ${await response.text()}`,
      );
    return response.json();
  }
  const firstImage = await uploadImage("首版示意图.png");
  assert.equal((await request(firstImage.markdownUrl)).status, 404);
  assert.equal(
    (await request(firstImage.markdownUrl, { cookie: admin })).status,
    200,
  );
  await request(`/api/articles/drafts/${imageArticleId}`, {
    method: "PATCH",
    cookie: member,
    body: {
      body: `首版正文\n\n${firstImage.markdown}`,
      coverImageId: firstImage.id,
    },
  });
  assert.equal(
    (await (await request(`/api/articles/drafts/${imageArticleId}`, { cookie: member })).json()).cover.id,
    firstImage.id,
  );
  await request(`/api/articles/drafts/${imageArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${imageArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", imageArticleId, "approved"),
  });
  assert.equal((await request(firstImage.markdownUrl)).status, 200);
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover.id,
    firstImage.id,
  );
  await request(`/api/articles/drafts/${imageArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  const beforeAttachmentUpload = one(
    "SELECT updated_at FROM articles WHERE id=?",
    imageArticleId,
  ).updated_at;
  const secondImage = await uploadImage("改稿示意图.png");
  assert.equal(
    (
      await request(`/api/admin/articles/${imageArticleId}/decision`, {
        method: "POST",
        cookie: owner,
        body: {
          decision: "approved",
          expectedUpdatedAt: beforeAttachmentUpload,
        },
      })
    ).status,
    409,
  );
  await request(`/api/articles/drafts/${imageArticleId}`, {
    method: "PATCH",
    cookie: member,
    body: {
      body: `改稿正文\n\n${secondImage.markdown}`,
      coverImageId: secondImage.id,
    },
  });
  assert.equal((await request(firstImage.markdownUrl)).status, 200);
  assert.equal((await request(secondImage.markdownUrl)).status, 404);
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover.id,
    firstImage.id,
  );
  assert.equal(
    (
      await request(`/api/admin/articles/${imageArticleId}/decision`, {
        method: "POST",
        cookie: owner,
        body: decisionBody("articles", imageArticleId, "approved"),
      })
    ).status,
    409,
  );

  async function comment(cookie, body, parentId) {
    const response = await request("/api/comments", {
      method: "POST",
      cookie,
      body: {
        targetType: "article",
        targetId: imageArticleId,
        body,
        ...(parentId ? { parentId } : {}),
      },
    });
    if (response.status !== 201)
      assert.fail(
        `comment failed: ${response.status} ${await response.text()}`,
      );
    return (await response.json()).id;
  }
  const memberRoot = await comment(member, "member root"),
    outsiderRoot = await comment(outsider, "outsider root"),
    outsiderReply = await comment(outsider, "reply to member", memberRoot);
  await comment(member, "reply to outsider", outsiderRoot);
  const emptyDeletedRoot = await comment(member, "delete without replies");
  await request(`/api/comments/${emptyDeletedRoot}`, {
    method: "DELETE",
    cookie: member,
    body: {},
  });
  r = await request(`/api/comments/${memberRoot}/like`, {
    method: "POST",
    cookie: outsider,
    body: {},
  });
  assert.deepEqual(await r.json(), { liked: true, likeCount: 1 });
  r = await request(`/api/comments/${memberRoot}/like`, {
    method: "POST",
    cookie: outsider,
    body: {},
  });
  assert.deepEqual(await r.json(), { liked: false, likeCount: 0 });
  await request(`/api/comments/${memberRoot}/like`, {
    method: "POST",
    cookie: outsider,
    body: {},
  });
  let comments = await (
    await request(
      `/api/comments?targetType=article&targetId=${imageArticleId}&sort=popular&page=1&pageSize=1`,
      { cookie: outsider },
    )
  ).json();
  assert.equal(comments.items[0].id, memberRoot);
  assert.ok(comments.items.some((x) => x.id === outsiderReply));
  assert.equal(comments.total, 2);
  r = await request(`/api/comments/${memberRoot}/report`, {
    method: "POST",
    cookie: outsider,
    body: { reason: "内容需要审核" },
  });
  assert.equal(r.status, 201);
  assert.equal(
    (
      await request(`/api/comments/${memberRoot}/report`, {
        method: "POST",
        cookie: outsider,
        body: { reason: "重复举报" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/comments/${memberRoot}`, {
        method: "DELETE",
        cookie: outsider,
        body: {},
      })
    ).status,
    403,
  );
  await request(`/api/comments/${memberRoot}`, {
    method: "DELETE",
    cookie: member,
    body: {},
  });
  comments = await (
    await request(
      `/api/comments?targetType=article&targetId=${imageArticleId}&focus=${outsiderReply}`,
      { cookie: outsider },
    )
  ).json();
  assert.equal(comments.focused, true);
  assert.equal(comments.items[0].deleted, true);
  assert.equal(comments.items[0].body, null);
  assert.ok(comments.items.some((x) => x.id === outsiderReply));
  const memberNotifications = await (
    await request("/api/me/notifications", { cookie: member })
  ).json();
  assert.ok(memberNotifications.unreadCount > 0);
  assert.ok(
    memberNotifications.items.some((x) =>
      x.href?.includes(`#comment-${outsiderRoot}`),
    ),
  );
  await request("/api/me/notifications/read", {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal(
    (await (await request("/api/me/notifications", { cookie: member })).json())
      .unreadCount,
    0,
  );
  await request(`/api/admin/reviews/${ownReviews.items[0].id}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("reviews", ownReviews.items[0].id, "approved"),
  });
  const reviewId = ownReviews.items[0].id;
  let publicShop = await (await request(`/api/shops/${seeded.id}`)).json();
  const publicBefore = publicShop.reviews.find((x) => x.id === reviewId);
  assert.equal(publicBefore.pros, "authentic");
  assert.equal(publicBefore.proofFileId, undefined);
  r = await request(`/api/reviews/${reviewId}`, {
    method: "PATCH",
    cookie: member,
    body: {
      sentiment: "negative",
      content: "revision pending",
      pros: "",
      cons: "revision pending",
      purchaseExperience: "updated private experience",
    },
  });
  assert.equal(r.status, 200);
  await request(`/api/reviews/${reviewId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  publicShop = await (await request(`/api/shops/${seeded.id}`)).json();
  assert.equal(
    publicShop.reviews.find((x) => x.id === reviewId).pros,
    "authentic",
  );
  assert.equal(
    (await (await request(`/api/reviews/${reviewId}/edit`, { cookie: member })).json()).proofFileId,
    proofId,
  );
  assert.equal(
    (await request(`/api/reviews/${reviewId}/edit`, { cookie: outsider })).status,
    404,
  );
  await request(`/api/admin/reviews/${reviewId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("reviews", reviewId, "rejected", {
      reason: "仅审核员可见的退回原因",
    }),
  });
  publicShop = await (await request(`/api/shops/${seeded.id}`)).json();
  assert.equal(
    publicShop.reviews.find((x) => x.id === reviewId).pros,
    "authentic",
  );
  assert.equal(
    publicShop.reviews.find((x) => x.id === reviewId).decisionReason,
    undefined,
  );
  await request(`/api/reviews/${reviewId}`, {
    method: "PATCH",
    cookie: member,
    body: {
      sentiment: "negative",
      content: "revision pending",
      pros: "",
      cons: "revision pending",
      purchaseExperience: "updated private experience",
    },
  });
  await request(`/api/reviews/${reviewId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/reviews/${reviewId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("reviews", reviewId, "approved"),
  });
  publicShop = await (await request(`/api/shops/${seeded.id}`)).json();
  assert.equal(publicShop.reviews.filter((x) => x.id === reviewId).length, 1);
  assert.equal(
    publicShop.reviews.find((x) => x.id === reviewId).cons,
    "revision pending",
  );
  await request("/api/me", {
    method: "PATCH",
    cookie: member,
    body: { nickname: "Member", bio: "嵌入式与电源方向" },
  });
  const profile = await (await request(`/api/users/${memberId}`)).json();
  assert.equal(profile.email, undefined);
  assert.equal(profile.role, undefined);
  assert.equal(profile.bio, "嵌入式与电源方向");
  assert.ok(profile.articles.some((x) => x.id === imageArticleId));
  assert.ok(profile.comments.every((x) => x.body !== "member root"));
  assert.ok(profile.reviews.length > 0);
  assert.ok(profile.reviews.every((x) => !x.proofFileId));
  await request(`/api/me/bookmarks/shop/${seeded.id}`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.ok(
    (
      await (await request("/api/me/bookmarks", { cookie: member })).json()
    ).items.some((x) => x.type === "shop" && x.id === seeded.id),
  );
  for (const [type, targetId] of [
    ["article", imageArticleId],
    [
      "problem",
      one("SELECT problem_id FROM official_problem_files LIMIT 1").problem_id,
    ],
  ]) {
    await request(`/api/me/bookmarks/${type}/${targetId}`, {
      method: "POST",
      cookie: member,
      body: {},
    });
    assert.equal(
      (
        await (
          await request(`/api/${type}s/${targetId}`, { cookie: member })
        ).json()
      ).bookmarked,
      true,
    );
    await request(`/api/me/bookmarks/${type}/${targetId}`, {
      method: "DELETE",
      cookie: member,
      body: {},
    });
    assert.equal(
      (
        await (
          await request(`/api/${type}s/${targetId}`, { cookie: member })
        ).json()
      ).bookmarked,
      false,
    );
  }
  await request(`/api/articles/drafts/${imageArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${imageArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", imageArticleId, "approved"),
  });
  assert.equal((await request(secondImage.markdownUrl)).status, 200);
  assert.equal((await request(firstImage.markdownUrl)).status, 404);
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover.id,
    secondImage.id,
  );
  const coverOnlyImage = await uploadImage("仅封面图片.png");
  await request(`/api/articles/drafts/${imageArticleId}`, {
    method: "PATCH",
    cookie: member,
    body: { coverImageId: coverOnlyImage.id },
  });
  assert.equal((await request(coverOnlyImage.markdownUrl)).status, 404);
  await request(`/api/articles/drafts/${imageArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${imageArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", imageArticleId, "approved"),
  });
  assert.equal((await request(coverOnlyImage.markdownUrl)).status, 200);
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover.id,
    coverOnlyImage.id,
  );
  await request(`/api/articles/drafts/${imageArticleId}`, {
    method: "PATCH",
    cookie: member,
    body: { coverImageId: null },
  });
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover.id,
    coverOnlyImage.id,
  );
  await request(`/api/articles/drafts/${imageArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${imageArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", imageArticleId, "approved"),
  });
  assert.equal(
    (await (await request(`/api/articles/${imageArticleId}`)).json()).cover,
    null,
  );
  assert.equal((await request(coverOnlyImage.markdownUrl)).status, 404);
  await request(`/api/admin/articles/${imageArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: { decision: "hidden" },
  });
  assert.equal((await request(secondImage.markdownUrl)).status, 404);
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

  // Owners can withdraw any of their three submission types. Withdrawal is
  // immediately private, invalidates stale moderation state, and keeps the
  // same identifier for resubmission.
  assert.equal(
    (
      await request(`/api/reviews/${reviewId}/withdraw`, {
        method: "POST",
        cookie: outsider,
        body: {},
      })
    ).status,
    404,
  );
  await request(`/api/reviews/${reviewId}/withdraw`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal(
    (await (await request(`/api/shops/${seeded.id}`)).json()).reviews.some(
      (item) => item.id === reviewId,
    ),
    false,
  );
  await request(`/api/reviews/${reviewId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  const staleReviewTime = one(
    "SELECT updated_at FROM reviews WHERE id=?",
    reviewId,
  ).updated_at;
  await request(`/api/reviews/${reviewId}/withdraw`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal(
    (
      await request(`/api/admin/reviews/${reviewId}/decision`, {
        method: "POST",
        cookie: owner,
        body: { decision: "approved", expectedUpdatedAt: staleReviewTime },
      })
    ).status,
    409,
  );
  await request(`/api/reviews/${reviewId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/reviews/${reviewId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("reviews", reviewId, "approved"),
  });

  assert.equal(
    (
      await request(`/api/shops/${shopId}/withdraw`, {
        method: "POST",
        cookie: outsider,
        body: {},
      })
    ).status,
    404,
  );
  await request(`/api/shops/${shopId}/withdraw`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal(
    (await (await request("/api/shops?q=API Test Shop")).json()).items.length,
    0,
  );
  r = await request(`/api/shops/${shopId}`, {
    method: "PATCH",
    cookie: member,
    body: { name: "API Test Shop Revised" },
  });
  assert.equal(r.status, 200, await r.text());
  await request(`/api/shops/${shopId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  const staleShopTime = one(
    "SELECT updated_at FROM shops WHERE id=?",
    shopId,
  ).updated_at;
  await request(`/api/shops/${shopId}/withdraw`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal(
    (
      await request(`/api/admin/shops/${shopId}/decision`, {
        method: "POST",
        cookie: owner,
        body: { decision: "approved", expectedUpdatedAt: staleShopTime },
      })
    ).status,
    409,
  );
  await request(`/api/shops/${shopId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/shops/${shopId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("shops", shopId, "approved"),
  });

  r = await request("/api/articles/drafts", {
    method: "POST",
    cookie: member,
    body: {
      title: "Withdraw searchable article",
      body: "published searchable body",
    },
  });
  const withdrawArticleId = (await r.json()).id;
  await request(`/api/articles/drafts/${withdrawArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${withdrawArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", withdrawArticleId, "approved"),
  });
  await request(`/api/articles/drafts/${withdrawArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  const staleArticleTime = one(
    "SELECT updated_at FROM articles WHERE id=?",
    withdrawArticleId,
  ).updated_at;
  await request(`/api/articles/drafts/${withdrawArticleId}/withdraw`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  assert.equal((await request(`/api/articles/${withdrawArticleId}`)).status, 404);
  assert.equal(
    (
      await request(`/api/admin/articles/${withdrawArticleId}/decision`, {
        method: "POST",
        cookie: owner,
        body: { decision: "approved", expectedUpdatedAt: staleArticleTime },
      })
    ).status,
    409,
  );
  await request(`/api/articles/drafts/${withdrawArticleId}/submit`, {
    method: "POST",
    cookie: member,
    body: {},
  });
  await request(`/api/admin/articles/${withdrawArticleId}/decision`, {
    method: "POST",
    cookie: owner,
    body: decisionBody("articles", withdrawArticleId, "approved"),
  });

  r = await request(`/api/admin/accounts/${outsiderId}`, {
    method: "PATCH",
    cookie: owner,
    body: { role: "admin", permissions: [] },
  });
  assert.equal(r.status, 200);
  assert.equal(
    one("SELECT role FROM users WHERE id=?", outsiderId).role,
    "admin",
  );
  assert.equal((await request("/api/me", { cookie: outsider })).status, 401);
  const unrestrictedAdmin = await login(
    "outsider@test.local",
    "outsider-test-password-123",
  );
  const articleSearch = await (
    await request(
      "/api/admin/queue?type=articles&status=all&q=published%20searchable&page=1&pageSize=5",
      { cookie: unrestrictedAdmin },
    )
  ).json();
  assert.equal(articleSearch.total, 1);
  assert.equal(articleSearch.items[0].id, withdrawArticleId);
  assert.equal(
    (await request("/api/admin/accounts", { cookie: unrestrictedAdmin })).status,
    403,
  );
  r = await request("/api/comments", {
    method: "POST",
    cookie: owner,
    body: {
      targetType: "article",
      targetId: withdrawArticleId,
      body: "admin removes this comment",
    },
  });
  const moderatedCommentPayload = await r.json();
  assert.equal(r.status, 201, JSON.stringify(moderatedCommentPayload));
  const moderatedComment = moderatedCommentPayload.id;
  comments = await (
    await request(
      `/api/comments?targetType=article&targetId=${withdrawArticleId}&sort=latest`,
      { cookie: unrestrictedAdmin },
    )
  ).json();
  assert.equal(
    comments.items.find((item) => item.id === moderatedComment)
      .canModerateDelete,
    true,
  );
  assert.equal(
    (
      await request(`/api/comments/${moderatedComment}`, {
        method: "DELETE",
        cookie: unrestrictedAdmin,
        body: {},
      })
    ).status,
    200,
  );
  await request(`/api/admin/articles/${withdrawArticleId}/decision`, {
    method: "POST",
    cookie: unrestrictedAdmin,
    body: { decision: "hidden" },
  });
  assert.equal((await request(`/api/articles/${withdrawArticleId}`)).status, 404);
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
  const officialFile = one(
    "SELECT id,problem_id FROM official_problem_files LIMIT 1",
  );
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
  const rangedPdf = await request(`/api/official-files/${officialFile.id}`, {
    cookie: member,
    headers: { range: "bytes=0-15" },
  });
  assert.equal(rangedPdf.status, 206);
  assert.match(rangedPdf.headers.get("content-range") || "", /^bytes 0-15\//);
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
