import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
let activeHashes = 0;
const hashWaiters = [];
async function limitedScrypt(...args) {
  if (activeHashes >= 2 && hashWaiters.length >= 20)
    throw new Error("Password hashing busy");
  if (activeHashes >= 2)
    await new Promise((resolve) => hashWaiters.push(resolve));
  activeHashes++;
  try {
    return await scrypt(...args);
  } finally {
    activeHashes--;
    hashWaiters.shift()?.();
  }
}
export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 200
  )
    throw Object.assign(new Error("密码长度须为 10 至 200 位"), {
      status: 400,
      code: "WEAK_PASSWORD",
    });
  const salt = randomBytes(16);
  const key = await limitedScrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$131072$8$1$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}
export async function verifyPassword(password, encoded) {
  try {
    if (
      typeof password !== "string" ||
      password.length > 200 ||
      typeof encoded !== "string"
    )
      return false;
    const [, n, r, p, saltText, keyText] = encoded.split("$");
    const expected = Buffer.from(keyText, "base64url");
    const actual = await limitedScrypt(
      password,
      Buffer.from(saltText, "base64url"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 },
    );
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
export function rateLimiter({ windowMs, limit, key = (req) => req.ip }) {
  const hits = new Map();
  let calls = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (++calls % 100 === 0 || hits.size > 10000) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      if (hits.size > 10000)
        for (const k of hits.keys()) {
          hits.delete(k);
          if (hits.size <= 8000) break;
        }
    }
    const id = key(req);
    let row = hits.get(id);
    if (!row || row.reset <= now) row = { count: 0, reset: now + windowMs };
    row.count++;
    hits.set(id, row);
    if (row.count > limit)
      return res
        .status(429)
        .json({
          error: "请求过于频繁，请稍后再试",
          code: "RATE_LIMITED",
          retryAfter: Math.max(1, Math.ceil((row.reset - now) / 1000)),
        });
    next();
  };
}
export const publicUser = (u, self = false) =>
  u
    ? {
        id: u.id,
        nickname: u.nickname,
        bio: u.bio || "",
        ...(self
          ? {
              email: u.email,
              emailVerified: Boolean(u.email_verified),
              role: u.role,
              permissions: JSON.parse(u.permissions || "[]"),
            }
          : {}),
      }
    : null;
