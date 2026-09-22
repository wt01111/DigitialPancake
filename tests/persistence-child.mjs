const { db, one, run } = await import("../server/db.js");

if (process.argv[2] === "write") {
  const review = one(
      "SELECT id FROM reviews WHERE source_type='workbook' LIMIT 1",
    ),
    withdrawnShop = one("SELECT id FROM shops WHERE status='approved' LIMIT 1"),
    problem = one("SELECT id FROM problems WHERE status='published' LIMIT 1"),
    created = new Date().toISOString();
  run("UPDATE reviews SET status='hidden' WHERE id=?", review.id);
  run("UPDATE shops SET status='draft' WHERE id=?", withdrawnShop.id);
  run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified,bio) VALUES('persist-user','persist@example.test','Persist','disabled','member','[]',1,1,?,1,'')",
    created,
  );
  run(
    `INSERT INTO articles(id,user_id,title,body,tags,status,created_at,updated_at,published_payload,published_visible)
     VALUES('persist-withdrawn-article','persist-user','Withdrawn','draft','[]','draft',?,?,?,0)`,
    created,
    created,
    JSON.stringify({ title: "previous public article", body: "old" }),
  );
  run(
    `INSERT INTO reviews(id,shop_id,user_id,source_type,rating,pros,cons,purchase_experience,status,created_at,updated_at,published_payload,published_visible)
     VALUES('persist-site-review',?,'persist-user','site',5,'live draft','','purchase','approved',?,?,NULL,0)`,
    one("SELECT id FROM shops WHERE status='approved' LIMIT 1").id,
    created,
    created,
  );
  run(
    `INSERT INTO reviews(id,shop_id,user_id,source_type,rating,pros,cons,purchase_experience,status,created_at,updated_at,published_payload,published_visible)
     VALUES('persist-hidden-site-review',?,'persist-user','site',1,'','hidden','purchase','hidden',?,?,?,0)`,
    one("SELECT id FROM shops WHERE status='approved' LIMIT 1").id,
    created,
    created,
    JSON.stringify({ rating: 5, pros: "previous public version" }),
  );
  run(
    "INSERT INTO comments VALUES('persist-comment','persist-user','problem',?,NULL,'','deleted',?)",
    problem.id,
    created,
  );
  process.stdout.write(
    JSON.stringify({ reviewId: review.id, shopId: withdrawnShop.id }),
  );
} else {
  const reviewId = process.argv[3];
  const shopId = process.argv[4];
  if (
    one("SELECT status FROM reviews WHERE id=?", reviewId)?.status !== "hidden"
  )
    throw new Error("seed restored a hidden review after restart");
  const comment = one(
    "SELECT status,body FROM comments WHERE id='persist-comment'",
  );
  if (comment?.status !== "deleted" || comment.body !== "")
    throw new Error("soft-deleted comment did not persist after restart");
  const siteReview = one(
    "SELECT published_payload,published_visible FROM reviews WHERE id='persist-site-review'",
  );
  if (siteReview?.published_payload !== null || siteReview.published_visible !== 0)
    throw new Error("one-time snapshot migration restored a deliberately private review");
  const hiddenSiteReview = one(
    "SELECT status,published_visible FROM reviews WHERE id='persist-hidden-site-review'",
  );
  if (hiddenSiteReview?.status !== "hidden" || hiddenSiteReview.published_visible !== 0)
    throw new Error("hidden site review became public after restart");
  if (one("SELECT status FROM shops WHERE id=?", shopId)?.status !== "draft")
    throw new Error("withdrawn seeded shop became public after restart");
  const article = one(
    "SELECT status,published_visible FROM articles WHERE id='persist-withdrawn-article'",
  );
  if (article?.status !== "draft" || article.published_visible !== 0)
    throw new Error("withdrawn article became public after restart");
}
db.close();
