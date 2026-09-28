import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "./security.js";

export function normalizeOwnerEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email))
    throw new Error("OWNER_EMAIL must be a valid email address");
  return email;
}

export async function recoverOwnerAccount({ email, nickname }, store) {
  const normalizedEmail = normalizeOwnerEmail(email);
  const ownerCount = store.one(
    "SELECT count(*) count FROM users WHERE role='owner'",
  ).count;
  if (ownerCount > 1)
    throw new Error("Multiple owner accounts exist; recovery stopped");
  const owner = store.one("SELECT id FROM users WHERE role='owner' LIMIT 1");
  const conflict = store.one(
    "SELECT id FROM users WHERE email=? AND (? IS NULL OR id<>?)",
    normalizedEmail,
    owner?.id || null,
    owner?.id || null,
  );
  if (conflict)
    throw new Error("OWNER_EMAIL is already used by another account");

  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(password);
  const ownerId = owner?.id || `owner-${randomUUID()}`;
  const createdAt = new Date().toISOString();

  store.db.exec("BEGIN IMMEDIATE");
  try {
    if (owner) {
      store.run(
        "UPDATE users SET email=?,password_hash=?,email_verified=1,enabled=1,session_version=session_version+1 WHERE id=?",
        normalizedEmail,
        passwordHash,
        ownerId,
      );
      store.run("DELETE FROM sessions WHERE user_id=?", ownerId);
    } else {
      store.run(
        "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',1,1,?,1)",
        ownerId,
        normalizedEmail,
        String(nickname || "Admin").trim() || "Admin",
        passwordHash,
        createdAt,
      );
    }
    store.run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
      `audit-${randomUUID()}`,
      ownerId,
      owner ? "恢复最高管理员账号" : "创建最高管理员账号",
      "user",
      ownerId,
      owner
        ? "Owner email and password reset; existing sessions revoked"
        : "Owner account created by server recovery command",
      createdAt,
    );
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }

  return { email: normalizedEmail, password };
}
