const { db, one, run } = await import("../server/db.js");

if (process.argv[2] === "write") {
  const review = one(
      "SELECT id FROM reviews WHERE source_type='workbook' LIMIT 1",
    ),
    problem = one("SELECT id FROM problems WHERE status='published' LIMIT 1"),
    created = new Date().toISOString();
  run("UPDATE reviews SET status='hidden' WHERE id=?", review.id);
  run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified,bio) VALUES('persist-user','persist@example.test','Persist','disabled','member','[]',1,1,?,1,'')",
    created,
  );
  run(
    "INSERT INTO comments VALUES('persist-comment','persist-user','problem',?,NULL,'','deleted',?)",
    problem.id,
    created,
  );
  process.stdout.write(JSON.stringify({ reviewId: review.id }));
} else {
  const reviewId = process.argv[3];
  if (
    one("SELECT status FROM reviews WHERE id=?", reviewId)?.status !== "hidden"
  )
    throw new Error("seed restored a hidden review after restart");
  const comment = one(
    "SELECT status,body FROM comments WHERE id='persist-comment'",
  );
  if (comment?.status !== "deleted" || comment.body !== "")
    throw new Error("soft-deleted comment did not persist after restart");
}
db.close();
