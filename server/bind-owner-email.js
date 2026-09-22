import { db, one, run } from "./db.js";

const email = String(process.env.OWNER_EMAIL || "")
  .trim()
  .toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email))
  throw new Error("OWNER_EMAIL must be a valid email address");

const owner = one("SELECT id,email FROM users WHERE role='owner' LIMIT 1");
if (!owner)
  throw new Error("Owner account does not exist; run init-owner first");
const conflict = one(
  "SELECT id FROM users WHERE email=? AND id<>?",
  email,
  owner.id,
);
if (conflict) throw new Error("OWNER_EMAIL is already used by another account");

db.exec("BEGIN IMMEDIATE");
try {
  run(
    "UPDATE users SET email=?,email_verified=1,session_version=session_version+1 WHERE id=?",
    email,
    owner.id,
  );
  run("DELETE FROM sessions WHERE user_id=?", owner.id);
  run(
    "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
    `audit-${crypto.randomUUID()}`,
    owner.id,
    "绑定最高管理员邮箱",
    "user",
    owner.id,
    "Owner email changed; existing sessions revoked",
    new Date().toISOString(),
  );
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
console.log("Owner email bound; existing sessions revoked.");
