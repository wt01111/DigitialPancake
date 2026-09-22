import { stdin as input, stdout as output } from "node:process";
import { db, one, run } from "./db.js";
import { hashPassword } from "./security.js";
async function readSecret() {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD;
  if (!input.isTTY) {
    let value = "";
    for await (const chunk of input) value += chunk;
    return value.trimEnd();
  }
  output.write("Owner password: ");
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  return await new Promise((resolve, reject) => {
    let value = "";
    const onData = (char) => {
      if (char === "\r" || char === "\n") {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
        output.write("\n");
        resolve(value);
      } else if (char === "\u0003") reject(new Error("Cancelled"));
      else if (char === "\u007f") value = value.slice(0, -1);
      else value += char;
    };
    input.on("data", onData);
  });
}
const email = String(process.env.OWNER_EMAIL || "")
    .trim()
    .toLowerCase(),
  nickname = String(process.env.OWNER_NICKNAME || "Admin").trim();
if (!/^\S+@\S+\.\S+$/.test(email))
  throw new Error("OWNER_EMAIL must be a valid email address");
const passwordHash = await hashPassword(await readSecret()),
  createdAt = new Date().toISOString(),
  existing = one("SELECT id FROM users WHERE role='owner' LIMIT 1");
db.exec("BEGIN IMMEDIATE");
try {
  if (existing) {
    run(
      "UPDATE users SET email=?,nickname=?,password_hash=?,enabled=1,session_version=session_version+1 WHERE id=?",
      email,
      nickname,
      passwordHash,
      existing.id,
    );
    run("DELETE FROM sessions WHERE user_id=?", existing.id);
  } else
    run(
      "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',1,1,?,1)",
      `owner-${crypto.randomUUID()}`,
      email,
      nickname,
      passwordHash,
      createdAt,
    );
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log("Owner account initialized.");
