import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const workRoot = resolve("work");
await mkdir(workRoot, { recursive: true });
const temp = await mkdtemp(join(workRoot, "owner-recovery-"));
process.env.DATABASE_PATH = join(temp, "site.sqlite");

const database = await import("../server/db.js");
const security = await import("../server/security.js");
const { recoverOwnerAccount } = await import("../server/owner-recovery.js");

try {
  const created = await recoverOwnerAccount(
    { email: "created-owner@example.test", nickname: "Created Owner" },
    database,
  );
  const createdOwner = database.one(
    "SELECT * FROM users WHERE email='created-owner@example.test'",
  );
  assert.equal(createdOwner.role, "owner");
  assert.equal(createdOwner.email_verified, 1);
  assert.equal(
    await security.verifyPassword(created.password, createdOwner.password_hash),
    true,
  );
  database.run("DELETE FROM audit WHERE actor_id=?", createdOwner.id);
  database.run("DELETE FROM users WHERE id=?", createdOwner.id);

  const oldHash = await security.hashPassword("old-owner-password-123");
  const now = new Date().toISOString();
  database.run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'owner','[]',0,7,?,1)",
    "owner-recovery-test",
    "old-owner@example.test",
    "Admin",
    oldHash,
    now,
  );
  database.run(
    "INSERT INTO sessions VALUES(?,?,?,?,?)",
    "old-session",
    "owner-recovery-test",
    7,
    new Date(Date.now() + 60_000).toISOString(),
    now,
  );

  const result = await recoverOwnerAccount(
    { email: "NEW-OWNER@example.test", nickname: "ignored" },
    database,
  );
  const owner = database.one(
    "SELECT * FROM users WHERE id='owner-recovery-test'",
  );
  assert.equal(owner.email, "new-owner@example.test");
  assert.equal(owner.enabled, 1);
  assert.equal(owner.email_verified, 1);
  assert.equal(owner.session_version, 8);
  assert.equal(
    await security.verifyPassword(result.password, owner.password_hash),
    true,
  );
  assert.equal(await security.verifyPassword("old-owner-password-123", owner.password_hash), false);
  assert.equal(
    database.one("SELECT count(*) count FROM sessions").count,
    0,
  );
  assert.equal(
    database.one(
      "SELECT count(*) count FROM audit WHERE actor_id=? AND action='恢复最高管理员账号'",
      owner.id,
    ).count,
    1,
  );

  database.run(
    "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?, 'member','[]',1,1,?,1)",
    "member-conflict",
    "member@example.test",
    "Member",
    oldHash,
    now,
  );
  await assert.rejects(
    recoverOwnerAccount({ email: "member@example.test" }, database),
    /already used/,
  );
  assert.equal(
    database.one("SELECT email FROM users WHERE id=?", owner.id).email,
    "new-owner@example.test",
  );
  assert.equal(
    database.one("SELECT count(*) count FROM users WHERE role='owner'").count,
    1,
  );

  const repairScript = await readFile(
    resolve("deploy/one-click-repair.sh"),
    "utf8",
  );
  assert.match(
    repairScript,
    /default_owner_email="tong60536@qq\.com"/,
    "one-click repair must target the configured QQ owner without arguments",
  );
  assert.match(repairScript, /systemd-run[\s\S]*--pipe/);
  assert.match(repairScript, /mv -f -- "\$env_candidate" "\$env_file"/);
  assert.doesNotMatch(repairScript, /OWNER_PASSWORD/);
  console.log("Owner recovery tests passed.");
} finally {
  database.db.close();
  await rm(temp, { recursive: true, force: true });
}
