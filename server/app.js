import express from "express";
import multer from "multer";
import nodemailer from "nodemailer";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  unlinkSync,
  statfsSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { createHmac, randomInt } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, all, one, run, json, seedDir } from "./db.js";
import {
  hashPassword,
  publicUser,
  randomToken,
  rateLimiter,
  sha256,
  verifyPassword,
} from "./security.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.env.NODE_ENV === "production";
const origin =
  process.env.PUBLIC_ORIGIN || (production ? "" : "http://127.0.0.1:5173");
if (production && (!origin || (process.env.SESSION_SECRET || "").length < 32))
  throw new Error(
    "Production requires PUBLIC_ORIGIN and SESSION_SECRET (32+ chars)",
  );
if (
  production &&
  /replace|example|change.?me/i.test(process.env.SESSION_SECRET || "")
)
  throw new Error("SESSION_SECRET is still a placeholder");
const secret =
  process.env.SESSION_SECRET ||
  "development-only-session-secret-not-for-production";
const uploadDir = resolve(
  root,
  process.env.UPLOAD_DIR || "server/private-uploads",
);
mkdirSync(uploadDir, { recursive: true });
const allowedMime = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/zip",
]);
function uploadFileName(name) {
  if (![...name].every((character) => character.codePointAt(0) <= 255))
    return name;
  const bytes = Buffer.from(name, "latin1");
  const decoded = bytes.toString("utf8");
  return !decoded.includes("\uFFFD") && Buffer.from(decoded).equals(bytes)
    ? decoded
    : name;
}
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_r, _f, cb) => cb(null, randomToken(24)),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => {
    f.originalname = uploadFileName(f.originalname);
    allowedMime.has(f.mimetype)
      ? cb(null, true)
      : cb(
          Object.assign(new Error("不支持的文件类型"), {
            status: 400,
            code: "FILE_TYPE",
          }),
        );
  },
});
const smtpEnabled = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
const mailer = smtpEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(";")
      .map((v) => v.trim().split(/=(.*)/s))
      .filter((x) => x[0])
      .map(([k, v]) => [k, decodeURIComponent(v || "")]),
  );
const fail = (status, error, code) =>
  Object.assign(new Error(error), { status, code });
const permissions = (u) => json(u?.permissions, "[]");
const can = (u, p) =>
  u?.role === "owner" || (u?.role === "admin" && permissions(u).includes(p));
const audit = (actor, action, type, entity, detail = "") =>
  run(
    "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
    id("audit"),
    actor?.id || null,
    action,
    type || null,
    entity || null,
    detail,
    now(),
  );

export const app = express();
if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!origin || req.get("origin") !== origin)
      return res
        .status(403)
        .json({ error: "请求来源校验失败", code: "ORIGIN_REQUIRED" });
  }
  next();
});
app.use((req, _res, next) => {
  const token = parseCookies(req.headers.cookie).ep_session;
  if (token) {
    const s = one(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.version=u.session_version AND u.enabled=1`,
      sha256(token),
      now(),
    );
    req.user = s || null;
  }
  next();
});
const auth = (req, _res, next) =>
  req.user ? next() : next(fail(401, "请先登录", "AUTH_REQUIRED"));
const permit = (p) => (req, _res, next) =>
  can(req.user, p)
    ? next()
    : next(fail(403, "没有执行此操作的权限", "FORBIDDEN"));
const owner = (req, _res, next) =>
  req.user?.role === "owner"
    ? next()
    : next(fail(403, "只有最高管理员可执行此操作", "OWNER_REQUIRED"));
const loginLimit = rateLimiter({
  windowMs: 15 * 60e3,
  limit: 10,
  key: (r) => `${r.ip}:${String(r.body?.email || "").toLowerCase()}`,
});
const codeLimit = rateLimiter({
  windowMs: 60 * 60e3,
  limit: 5,
  key: (r) => `${r.ip}:${String(r.body?.email || "").toLowerCase()}`,
});
const codeEmailLimit = rateLimiter({
  windowMs: 60 * 60e3,
  limit: 5,
  key: (r) =>
    String(r.body?.email || "")
      .trim()
      .toLowerCase(),
});
const authEmailLimit = rateLimiter({
  windowMs: 15 * 60e3,
  limit: 12,
  key: (r) =>
    String(r.body?.email || "")
      .trim()
      .toLowerCase(),
});
const submitLimit = rateLimiter({
  windowMs: 60 * 60e3,
  limit: 30,
  key: (r) => r.user?.id || r.ip,
});
const authIpLimit = rateLimiter({
  windowMs: 15 * 60e3,
  limit: 40,
  key: (r) => r.ip,
});
const codeIpLimit = rateLimiter({
  windowMs: 60 * 60e3,
  limit: 20,
  key: (r) => r.ip,
});
const codeDigest = (email, purpose, code) =>
  createHmac("sha256", secret)
    .update(`${email}\0${purpose}\0${code}`)
    .digest("hex");
function uploadCapacity(req, _res, next) {
  try {
    const fs = statfsSync(uploadDir),
      free = Number(fs.bavail) * Number(fs.bsize);
    if (free < Number(process.env.MIN_FREE_BYTES || 2 * 1024 ** 3))
      throw fail(507, "服务器存储空间不足", "STORAGE_LOW");
    const used = one(
      "SELECT COALESCE(SUM(size),0) size FROM files WHERE owner_id=?",
      req.user.id,
    );
    if (Number(used.size) > 500 * 1024 ** 2)
      throw fail(413, "当前账号附件总量已达上限", "USER_STORAGE_LIMIT");
    if (
      req.params.id &&
      Number(
        one(
          "SELECT COUNT(*) count FROM files WHERE owner_id=? AND entity_id=?",
          req.user.id,
          req.params.id,
        )?.count || 0,
      ) >= 8
    )
      throw fail(413, "每条内容最多上传 8 个附件", "FILE_COUNT_LIMIT");
    next();
  } catch (e) {
    next(e);
  }
}
function uploadedCapacity(req, _res, next) {
  try {
    if (!req.file) return next();
    const used = Number(
      one(
        "SELECT COALESCE(SUM(size),0) size FROM files WHERE owner_id=?",
        req.user.id,
      )?.size || 0,
    );
    if (used + Number(req.file.size) > 500 * 1024 ** 2) {
      unlinkSync(req.file.path);
      req.file = null;
      throw fail(413, "本次上传将超过账号附件总量上限", "USER_STORAGE_LIMIT");
    }
    next();
  } catch (e) {
    next(e);
  }
}
function validProof(file) {
  const b = Buffer.alloc(12);
  const fd = openSync(file.path, "r");
  let bytesRead;
  try {
    bytesRead = readSync(fd, b, 0, b.length, 0);
  } finally {
    closeSync(fd);
  }
  if (bytesRead < 2) return false;
  return file.mimetype === "application/pdf"
    ? b.subarray(0, 5).toString() === "%PDF-"
    : file.mimetype === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === "image/jpeg"
        ? b[0] === 255 && b[1] === 216
        : file.mimetype === "image/webp"
          ? b.subarray(0, 4).toString() === "RIFF" &&
            b.subarray(8, 12).toString() === "WEBP"
          : false;
}

app.get("/healthz", (_req, res) => {
  one("SELECT 1 ok");
  res.json({ ok: true });
});
app.get("/api/bootstrap", (req, res) =>
  res.json({
    user: publicUser(req.user, true),
    config: {
      registrationEnabled: smtpEnabled,
      maxUploadBytes: 50 * 1024 * 1024,
      problemCategories: [
        { value: "signal", label: "信号类" },
        { value: "control", label: "控制类" },
        { value: "power", label: "电源类" },
        { value: "other", label: "其他" },
      ],
      problemCompetitionTypes: [
        { value: "national", label: "全国赛" },
        { value: "provincial", label: "省级赛" },
      ],
    },
  }),
);
async function issueSession(user, res) {
  const token = randomToken();
  run(
    "INSERT INTO sessions VALUES(?,?,?,?,?)",
    sha256(token),
    user.id,
    user.session_version,
    new Date(Date.now() + 7 * 864e5).toISOString(),
    now(),
  );
  res.cookie("ep_session", token, {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 864e5,
  });
}
async function consumeCode(email, purpose, code) {
  const row = one(
    "SELECT * FROM verification_codes WHERE email=? AND purpose=? ORDER BY created_at DESC LIMIT 1",
    email,
    purpose,
  );
  if (!row || row.used_at || row.expires_at <= now() || row.attempts >= 5)
    throw fail(400, "验证码无效或已过期", "INVALID_CODE");
  run("UPDATE verification_codes SET attempts=attempts+1 WHERE id=?", row.id);
  if (codeDigest(email, purpose, code) !== row.code_hash)
    throw fail(400, "验证码无效或已过期", "INVALID_CODE");
  run("UPDATE verification_codes SET used_at=? WHERE id=?", now(), row.id);
}
app.post(
  "/api/auth/request-code",
  codeIpLimit,
  codeLimit,
  codeEmailLimit,
  async (req, res, next) => {
    let createdCodeId;
    try {
      if (!smtpEnabled)
        throw fail(
          503,
          "邮件服务尚未配置，注册与重置密码暂不可用",
          "SMTP_DISABLED",
        );
      const email = String(req.body.email || "")
          .trim()
          .toLowerCase(),
        purpose = req.body.purpose;
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        !["register", "reset"].includes(purpose)
      )
        throw fail(400, "邮箱或用途无效", "INVALID_INPUT");
      if (
        purpose === "register" &&
        one("SELECT id FROM users WHERE email=?", email)
      )
        throw fail(409, "该邮箱已注册", "EMAIL_EXISTS");
      const code = String(randomInt(100000, 1000000));
      run(
        "UPDATE verification_codes SET used_at=? WHERE email=? AND purpose=? AND used_at IS NULL",
        now(),
        email,
        purpose,
      );
      createdCodeId = id("code");
      run(
        "INSERT INTO verification_codes VALUES(?,?,?,?,?,?,?,?)",
        createdCodeId,
        email,
        purpose,
        codeDigest(email, purpose, code),
        new Date(Date.now() + 10 * 60e3).toISOString(),
        0,
        null,
        now(),
      );
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject:
          purpose === "register"
            ? "电子煎饼注册验证码"
            : "电子煎饼密码重置验证码",
        text: `验证码：${code}\n10 分钟内有效，请勿转发。`,
      });
      res.json({ ok: true });
    } catch (e) {
      if (createdCodeId)
        run(
          "UPDATE verification_codes SET used_at=? WHERE id=?",
          now(),
          createdCodeId,
        );
      next(e);
    }
  },
);
app.post(
  "/api/auth/register",
  authIpLimit,
  authEmailLimit,
  loginLimit,
  async (req, res, next) => {
    try {
      if (!smtpEnabled) throw fail(503, "注册暂不可用", "SMTP_DISABLED");
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      const nickname = String(req.body.nickname || "")
        .trim()
        .slice(0, 30);
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        !nickname ||
        typeof req.body.password !== "string" ||
        req.body.password.length < 10 ||
        req.body.password.length > 200
      )
        throw fail(400, "请检查邮箱、昵称和密码格式", "INVALID_INPUT");
      await consumeCode(email, "register", String(req.body.code || ""));
      const hash = await hashPassword(req.body.password),
        user = {
          id: id("user"),
          email,
          nickname,
          role: "member",
          permissions: "[]",
          session_version: 1,
        };
      run(
        "INSERT INTO users(id,email,nickname,password_hash,role,permissions,enabled,session_version,created_at,email_verified) VALUES(?,?,?,?,?,?,1,1,?,1)",
        user.id,
        email,
        user.nickname,
        hash,
        user.role,
        user.permissions,
        now(),
      );
      await issueSession(user, res);
      res.status(201).json(publicUser(user, true));
    } catch (e) {
      next(e);
    }
  },
);
app.post("/api/auth/login", authIpLimit, loginLimit, async (req, res, next) => {
  try {
    const key = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const user = one("SELECT * FROM users WHERE email=?", key);
    if (
      !user ||
      !user.enabled ||
      !(await verifyPassword(req.body.password || "", user.password_hash))
    )
      throw fail(401, "账号或密码错误", "INVALID_CREDENTIALS");
    await issueSession(user, res);
    res.json(publicUser(user, true));
  } catch (e) {
    next(e);
  }
});
app.post("/api/auth/logout", auth, (req, res) => {
  const token = parseCookies(req.headers.cookie).ep_session;
  if (token) run("DELETE FROM sessions WHERE token_hash=?", sha256(token));
  res.clearCookie("ep_session", { path: "/" });
  res.json({ ok: true });
});
app.post(
  "/api/auth/reset-password",
  authIpLimit,
  authEmailLimit,
  loginLimit,
  async (req, res, next) => {
    try {
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        typeof req.body.newPassword !== "string" ||
        req.body.newPassword.length < 10 ||
        req.body.newPassword.length > 200
      )
        throw fail(400, "邮箱或新密码格式无效", "INVALID_INPUT");
      await consumeCode(email, "reset", String(req.body.code || ""));
      const hash = await hashPassword(req.body.newPassword);
      const result = run(
        "UPDATE users SET password_hash=?,email_verified=1,session_version=session_version+1 WHERE email=?",
        hash,
        email,
      );
      if (!result.changes) throw fail(404, "账号不存在", "NOT_FOUND");
      run(
        "DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)",
        email,
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
app.post("/api/auth/change-password", auth, async (req, res, next) => {
  try {
    if (
      !(await verifyPassword(
        req.body.currentPassword || "",
        req.user.password_hash,
      ))
    )
      throw fail(400, "当前密码错误", "INVALID_PASSWORD");
    const hash = await hashPassword(req.body.newPassword);
    run(
      "UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?",
      hash,
      req.user.id,
    );
    run("DELETE FROM sessions WHERE user_id=?", req.user.id);
    res.clearCookie("ep_session", { path: "/" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/me", auth, (req, res) => res.json(publicUser(req.user, true)));
app.patch("/api/me", auth, (req, res, next) => {
  try {
    const nickname = String(req.body.nickname || "")
      .trim()
      .slice(0, 30);
    if (!nickname) throw fail(400, "昵称不能为空", "INVALID_INPUT");
    run("UPDATE users SET nickname=? WHERE id=?", nickname, req.user.id);
    res.json({ ...publicUser(req.user, true), nickname });
  } catch (e) {
    next(e);
  }
});
app.get("/api/me/reviews", auth, (req, res) =>
  res.json({
    items: all(
      "SELECT r.*,s.name shop_name,f.original_name proof_name,f.mime proof_mime FROM reviews r JOIN shops s ON s.id=r.shop_id LEFT JOIN files f ON f.id=r.proof_file_id WHERE r.user_id=? ORDER BY r.created_at DESC",
      req.user.id,
    ).map(reviewOut),
  }),
);
app.get("/api/me/shops", auth, (req, res) =>
  res.json({
    items: all(
      "SELECT id,name,platform,url,status,decision_reason decisionReason,created_at createdAt FROM shops WHERE submitter_id=? ORDER BY created_at DESC",
      req.user.id,
    ),
  }),
);
app.get("/api/me/submissions", auth, (req, res) =>
  res.json({
    items: all(
      "SELECT * FROM articles WHERE user_id=? AND status!='draft' ORDER BY updated_at DESC",
      req.user.id,
    ).map(articleOut),
  }),
);
app.get("/api/me/drafts", auth, (req, res) =>
  res.json({
    items: all(
      "SELECT * FROM articles WHERE user_id=? AND status='draft' ORDER BY updated_at DESC",
      req.user.id,
    ).map(articleOut),
  }),
);
app.get("/api/me/notifications", auth, (req, res) =>
  res.json({
    items: all(
      "SELECT id,title,href,read_at readAt,created_at createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
      req.user.id,
    ),
  }),
);
app.post("/api/me/notifications/read", auth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length)
    for (const x of ids)
      run(
        "UPDATE notifications SET read_at=? WHERE id=? AND user_id=?",
        now(),
        x,
        req.user.id,
      );
  else
    run(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
      now(),
      req.user.id,
    );
  res.json({ ok: true });
});
function bookmarkTarget(type, targetId) {
  if (type === "shop")
    return one(
      "SELECT name title FROM shops WHERE id=? AND status='approved'",
      targetId,
    );
  if (type === "problem")
    return one(
      "SELECT title FROM problems WHERE id=? AND status='published'",
      targetId,
    );
  if (type === "article") {
    const a = one(
      "SELECT published_payload FROM articles WHERE id=? AND published_payload IS NOT NULL AND published_visible=1",
      targetId,
    );
    return a ? { title: json(a.published_payload, {}).title } : null;
  }
  return null;
}
app.get("/api/me/bookmarks", auth, (req, res) => {
  const items = all(
    "SELECT item_type type,item_id id,created_at createdAt FROM bookmarks WHERE user_id=?",
    req.user.id,
  )
    .map((b) => {
      const target = bookmarkTarget(b.type, b.id);
      return target
        ? {
            ...b,
            ...target,
            href: `/${b.type === "shop" ? "shops" : b.type === "article" ? "articles" : "problems"}/${b.id}`,
          }
        : null;
    })
    .filter(Boolean);
  res.json({ items });
});
app.post("/api/me/bookmarks/:type/:id", auth, (req, res, next) => {
  if (!bookmarkTarget(req.params.type, req.params.id))
    return next(fail(404, "收藏目标不存在", "NOT_FOUND"));
  run(
    "INSERT OR IGNORE INTO bookmarks VALUES(?,?,?,?)",
    req.user.id,
    req.params.type,
    req.params.id,
    now(),
  );
  res.json({ ok: true });
});
app.delete("/api/me/bookmarks/:type/:id", auth, (req, res) => {
  run(
    "DELETE FROM bookmarks WHERE user_id=? AND item_type=? AND item_id=?",
    req.user.id,
    req.params.type,
    req.params.id,
  );
  res.json({ ok: true });
});

function reviewOut(r) {
  const source = json(r.source_payload, {});
  return r.source_type === "workbook"
    ? {
        id: r.id,
        sourceType: "workbook",
        sentiment: r.sentiment,
        status: r.status,
        ...source,
      }
    : {
        id: r.id,
        sourceType: "site",
        shopId: r.shop_id,
        shopName: r.shop_name,
        author: r.nickname
          ? publicUser({ id: r.user_id, nickname: r.nickname })
          : undefined,
        rating: r.rating,
        sentiment:
          r.sentiment ||
          (r.rating >= 4 ? "positive" : r.rating <= 2 ? "negative" : "neutral"),
        pros: r.pros,
        cons: r.cons,
        purchaseExperience: r.purchase_experience,
        purchasedAt: r.purchased_at,
        orderPlatform: r.order_platform,
        status: r.status,
        decisionReason: r.decision_reason,
        date: r.created_at,
        proofFileId: r.proof_file_id,
        proofName: r.proof_name,
        proofMime: r.proof_mime,
      };
}
function shopOut(s) {
  return {
    id: s.id,
    name: s.name,
    aliases: json(s.aliases),
    ownerId: s.owner_ref,
    platform: s.platform,
    url: s.url,
    condition: s.condition_text,
    businessScope: s.business_scope,
    status: s.status,
    positiveCount: Number(s.positive_count || 0),
    negativeCount: Number(s.negative_count || 0),
    neutralCount: Number(s.neutral_count || 0),
    siteAverage: s.site_average == null ? null : Number(s.site_average),
    siteReviewCount: Number(s.site_review_count || 0),
  };
}
const shopStats = `SELECT s.*,(SELECT COUNT(*) FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND (r.sentiment='positive' OR r.source_type='site' AND r.rating>=4)) positive_count,(SELECT COUNT(*) FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND (r.sentiment='negative' OR r.source_type='site' AND r.rating<=2)) negative_count,(SELECT COUNT(*) FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND (r.sentiment='neutral' OR r.source_type='site' AND r.rating=3)) neutral_count,(SELECT AVG(r.rating) FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND r.source_type='site') site_average,(SELECT COUNT(*) FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND r.source_type='site') site_review_count FROM shops s`;
app.get("/api/shops", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ items: [], total: 0 });
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = all(
    `${shopStats} WHERE s.status='approved' AND (s.name LIKE ? ESCAPE '\\' OR s.aliases LIKE ? ESCAPE '\\' OR COALESCE(s.owner_ref,'') LIKE ? ESCAPE '\\' OR COALESCE(s.platform,'') LIKE ? ESCAPE '\\' OR COALESCE(s.business_scope,'') LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM reviews r WHERE r.shop_id=s.id AND r.status='approved' AND (COALESCE(r.source_payload,'') LIKE ? ESCAPE '\\' OR COALESCE(r.pros,'') LIKE ? ESCAPE '\\' OR COALESCE(r.cons,'') LIKE ? ESCAPE '\\' OR COALESCE(r.purchase_experience,'') LIKE ? ESCAPE '\\'))) ORDER BY s.name LIMIT 100`,
    ...Array(9).fill(like),
  );
  res.json({ items: rows.map(shopOut), total: rows.length });
});
app.get("/api/shops/:id", (req, res, next) => {
  const s = one(
    `${shopStats} WHERE s.id=? AND s.status='approved'`,
    req.params.id,
  );
  if (!s) return next(fail(404, "店铺不存在", "NOT_FOUND"));
  const reviews = all(
    "SELECT r.*,u.nickname FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.shop_id=? AND r.status='approved' ORDER BY r.created_at DESC",
    s.id,
  ).map((r) => {
    const o = reviewOut(r);
    delete o.proofFileId;
    delete o.proofName;
    delete o.proofMime;
    return o;
  });
  res.json({ ...shopOut(s), reviews });
});
app.post("/api/shops", auth, submitLimit, (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim(),
      url = String(req.body.url || "").trim() || null;
    if (!name || name.length > 120)
      throw fail(400, "请填写有效的店铺名称", "INVALID_INPUT");
    if (url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw fail(400, "店铺链接格式无效", "INVALID_URL");
      }
      if (!["http:", "https:"].includes(parsed.protocol))
        throw fail(400, "店铺链接仅支持 HTTP 或 HTTPS", "INVALID_URL");
    }
    const duplicate = one(
      "SELECT id,status FROM shops WHERE lower(name)=lower(?) OR (? IS NOT NULL AND url=?)",
      name,
      url,
      url,
    );
    if (duplicate?.status === "rejected") {
      const own = one(
        "SELECT id FROM shops WHERE id=? AND submitter_id=?",
        duplicate.id,
        req.user.id,
      );
      if (own) {
        run(
          "UPDATE shops SET name=?,aliases=?,owner_ref=?,platform=?,url=?,condition_text=?,business_scope=?,status='pending',decision_reason=NULL,updated_at=? WHERE id=?",
          name,
          JSON.stringify(req.body.aliases || []),
          req.body.ownerId || null,
          req.body.platform || null,
          url,
          req.body.condition || null,
          req.body.businessScope || null,
          now(),
          duplicate.id,
        );
        audit(req.user, "重新提交店铺", "shop", duplicate.id);
        return res.json({ id: duplicate.id, status: "pending" });
      }
    }
    if (duplicate)
      return res.status(409).json({
        error:
          duplicate.status === "approved"
            ? "该店铺已存在"
            : "相同店铺已在审核中",
        code: "SHOP_EXISTS",
        shopId: duplicate.status === "approved" ? duplicate.id : undefined,
      });
    const sid = id("shop"),
      t = now();
    run(
      "INSERT INTO shops VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      sid,
      name,
      JSON.stringify(req.body.aliases || []),
      req.body.ownerId || null,
      req.body.platform || null,
      url,
      req.body.condition || null,
      req.body.businessScope || null,
      "[]",
      "pending",
      req.user.id,
      null,
      t,
      t,
    );
    audit(req.user, "提交店铺", "shop", sid);
    res.status(201).json({ id: sid, status: "pending" });
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/shops/:id/reviews",
  auth,
  submitLimit,
  (req, _res, next) =>
    one("SELECT id FROM shops WHERE id=? AND status='approved'", req.params.id)
      ? next()
      : next(fail(404, "店铺不存在", "NOT_FOUND")),
  uploadCapacity,
  upload.single("proof"),
  uploadedCapacity,
  (req, res, next) => {
    try {
      const shop = one(
        "SELECT id FROM shops WHERE id=? AND status='approved'",
        req.params.id,
      );
      if (!shop) throw fail(404, "店铺不存在", "NOT_FOUND");
      const rating = Number(req.body.rating),
        pros = String(req.body.pros || "").trim(),
        cons = String(req.body.cons || "").trim(),
        experience = String(req.body.purchaseExperience || "").trim();
      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        (!pros && !cons) ||
        !experience
      )
        throw fail(
          400,
          "请完整填写评分、优点或缺点及购买经历",
          "INVALID_INPUT",
        );
      const rid = id("review"),
        t = now();
      let fid = null;
      if (req.file) {
        if (
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/pdf",
          ].includes(req.file.mimetype) ||
          !validProof(req.file)
        ) {
          unlinkSync(req.file.path);
          req.file = null;
          throw fail(400, "购买凭证文件内容或类型无效", "INVALID_PROOF");
        }
        fid = id("file");
        run(
          "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
          fid,
          req.user.id,
          "review-proof",
          rid,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          t,
        );
      }
      run(
        "INSERT INTO reviews(id,shop_id,user_id,source_type,rating,pros,cons,purchase_experience,purchased_at,order_platform,proof_file_id,status,created_at,updated_at) VALUES(?,?,?,'site',?,?,?,?,?,?,?,'pending',?,?)",
        rid,
        shop.id,
        req.user.id,
        rating,
        pros,
        cons,
        experience,
        req.body.purchasedAt || null,
        req.body.orderPlatform || null,
        fid,
        t,
        t,
      );
      audit(req.user, "提交店铺评价", "review", rid);
      res.status(201).json({ id: rid, status: "pending" });
    } catch (e) {
      if (req.file?.path && existsSync(req.file.path))
        unlinkSync(req.file.path);
      next(e);
    }
  },
);

function articleOut(a, published = false) {
  const p =
    published && a.published_payload ? json(a.published_payload, {}) : null;
  return p
    ? { ...p, id: a.id, status: "published", date: a.published_at }
    : {
        id: a.id,
        title: a.title,
        body: a.body,
        category: a.category,
        tags: json(a.tags),
        excerpt: a.excerpt,
        status: a.status,
        decisionReason: a.decision_reason,
        updatedAt: a.updated_at,
        attachments: all(
          "SELECT id,original_name name,original_name originalName,size,mime FROM files WHERE entity_id=? AND kind IN ('article-draft','article-published') ORDER BY created_at",
          a.id,
        ).map((f) => ({ ...f, url: `/api/files/${f.id}` })),
      };
}
app.get("/api/articles", (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`,
    cat = String(req.query.category || "").trim();
  const rows = all(
    "SELECT * FROM articles WHERE published_payload IS NOT NULL AND published_visible=1 AND (?='' OR published_payload LIKE ?) AND (?='' OR json_extract(published_payload,'$.category')=?) ORDER BY published_at DESC LIMIT 50",
    String(req.query.q || "").trim(),
    q,
    cat,
    cat,
  );
  res.json({
    items: rows.map((a) => {
      const item = articleOut(a, true);
      delete item.body;
      delete item.attachments;
      return item;
    }),
    total: rows.length,
  });
});
app.get("/api/articles/:id", (req, res, next) => {
  const a = one(
    "SELECT * FROM articles WHERE id=? AND published_payload IS NOT NULL AND published_visible=1",
    req.params.id,
  );
  a
    ? res.json(articleOut(a, true))
    : next(fail(404, "文章不存在", "NOT_FOUND"));
});
app.post("/api/articles/drafts", auth, submitLimit, (req, res, next) => {
  try {
    const aid = id("article"),
      t = now();
    run(
      "INSERT INTO articles(id,user_id,title,body,category,tags,excerpt,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?)",
      aid,
      req.user.id,
      String(req.body.title || ""),
      String(req.body.body || ""),
      req.body.category || null,
      JSON.stringify(req.body.tags || []),
      req.body.excerpt || null,
      t,
      t,
    );
    res.status(201).json({ id: aid, status: "draft" });
  } catch (e) {
    next(e);
  }
});
app.get("/api/articles/drafts/:id", auth, (req, res, next) => {
  const a = one("SELECT * FROM articles WHERE id=?", req.params.id);
  if (!a || (a.user_id !== req.user.id && !can(req.user, "content")))
    return next(fail(404, "草稿不存在", "NOT_FOUND"));
  res.json(articleOut(a));
});
app.patch("/api/articles/drafts/:id", auth, (req, res, next) => {
  const a = one(
    "SELECT * FROM articles WHERE id=? AND user_id=?",
    req.params.id,
    req.user.id,
  );
  if (!a) return next(fail(404, "草稿不存在", "NOT_FOUND"));
  run(
    "UPDATE articles SET title=?,body=?,category=?,tags=?,excerpt=?,status='draft',updated_at=? WHERE id=?",
    req.body.title ?? a.title,
    req.body.body ?? a.body,
    req.body.category ?? a.category,
    JSON.stringify(req.body.tags ?? json(a.tags)),
    req.body.excerpt ?? a.excerpt,
    now(),
    a.id,
  );
  res.json({ ok: true });
});
app.post(
  "/api/articles/drafts/:id/attachments",
  auth,
  submitLimit,
  (req, _res, next) =>
    one(
      "SELECT id FROM articles WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    )
      ? next()
      : next(fail(404, "草稿不存在", "NOT_FOUND")),
  uploadCapacity,
  upload.single("file"),
  uploadedCapacity,
  (req, res, next) => {
    try {
      const a = one(
        "SELECT id FROM articles WHERE id=? AND user_id=?",
        req.params.id,
        req.user.id,
      );
      if (!a || !req.file)
        return next(fail(400, "文章或附件无效", "INVALID_INPUT"));
      const fid = id("file");
      run(
        "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
        fid,
        req.user.id,
        "article-draft",
        a.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        now(),
      );
      res.status(201).json({ id: fid, name: req.file.originalname });
    } catch (e) {
      if (req.file?.path && existsSync(req.file.path))
        unlinkSync(req.file.path);
      next(e);
    }
  },
);
app.post(
  "/api/articles/drafts/:id/submit",
  auth,
  submitLimit,
  (req, res, next) => {
    const a = one(
      "SELECT * FROM articles WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!a || !a.title.trim() || !a.body.trim())
      return next(fail(400, "文章标题与正文不能为空", "INVALID_INPUT"));
    run(
      "UPDATE articles SET status='pending',decision_reason=NULL,updated_at=? WHERE id=?",
      now(),
      a.id,
    );
    audit(req.user, "提交文章", "article", a.id);
    res.json({ ok: true, status: "pending" });
  },
);
const problemCategories = new Set(["signal", "control", "power", "other"]);
const problemCompetitionTypes = new Set(["national", "provincial"]);
function problemFields(input, current = {}) {
  const title = String(input.title ?? current.title ?? "").trim(),
    year = Number(input.year ?? current.year),
    category = String(
      input.category ?? input.type ?? current.category ?? "",
    ).trim(),
    group = String(input.group ?? current.group ?? "").trim(),
    sourceUrl = String(input.sourceUrl ?? current.sourceUrl ?? "").trim(),
    competitionType = String(
      input.competitionType ?? current.competitionType ?? "",
    ).trim(),
    competitionName = String(
      input.competitionName ?? current.competitionName ?? "",
    ).trim();
  if (!title) throw fail(400, "赛题名称不能为空", "INVALID_INPUT");
  if (!Number.isInteger(year) || year < 1980 || year > 2100)
    throw fail(400, "赛题年份无效", "INVALID_INPUT");
  if (!problemCategories.has(category))
    throw fail(400, "赛题分类无效", "INVALID_INPUT");
  if (!problemCompetitionTypes.has(competitionType))
    throw fail(400, "竞赛类型无效", "INVALID_INPUT");
  if (!competitionName || competitionName.length > 150)
    throw fail(400, "竞赛名称无效", "INVALID_INPUT");
  if (group.length > 100) throw fail(400, "赛题组别过长", "INVALID_INPUT");
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl))
    throw fail(400, "来源链接仅支持 HTTP 或 HTTPS", "INVALID_INPUT");
  return {
    title,
    metadata: {
      ...current,
      year,
      category,
      competitionType,
      competitionName,
      group: group || null,
      problemCode:
        String(input.problemCode ?? current.problemCode ?? "").trim() || null,
      body: String(input.body ?? current.body ?? ""),
      sourcePage:
        String(input.sourcePage ?? current.sourcePage ?? "").trim() || null,
      sourceUrl: sourceUrl || null,
      letter: String(input.letter ?? current.letter ?? "").trim() || null,
    },
  };
}
app.get("/api/problems", (req, res) => {
  const q = String(req.query.q || "").trim(),
    like = `%${q.replace(/[\\%_]/g, "\\$&")}%`,
    year = String(req.query.year || "").trim(),
    category = String(req.query.category || req.query.type || "").trim(),
    group = String(req.query.group || "").trim(),
    competitionType = String(req.query.competitionType || "").trim(),
    page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    pageSize = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20),
    ),
    where = `status='published'
      AND (?='' OR title LIKE ? ESCAPE '\\' OR metadata LIKE ? ESCAPE '\\')
      AND (?='' OR CAST(json_extract(metadata,'$.year') AS TEXT)=?)
      AND (?='' OR json_extract(metadata,'$.category')=?)
      AND (?='' OR json_extract(metadata,'$.group')=? OR (? IN ('undergraduate','vocational') AND json_extract(metadata,'$.group')='all'))
      AND (?='' OR json_extract(metadata,'$.competitionType')=?)`,
    params = [
      q,
      like,
      like,
      year,
      year,
      category,
      category,
      group,
      group,
      group,
      competitionType,
      competitionType,
    ],
    total = Number(
      one(`SELECT COUNT(*) count FROM problems WHERE ${where}`, ...params)
        .count,
    ),
    items = all(
      `SELECT * FROM problems WHERE ${where}
      ORDER BY CAST(json_extract(metadata,'$.year') AS INTEGER) DESC,created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ).map((p) => {
      const item = { id: p.id, title: p.title, ...json(p.metadata, {}) };
      delete item.body;
      delete item.files;
      return item;
    }),
    facetRows = all(
      "SELECT metadata FROM problems WHERE status='published'",
    ).map((p) => json(p.metadata, {})),
    facets = {
      years: [...new Set(facetRows.map((p) => p.year).filter(Boolean))].sort(
        (a, b) => b - a,
      ),
      groups: [
        ...new Set(facetRows.map((p) => p.group).filter(Boolean)),
      ].sort(),
      categories: [
        ...new Set(facetRows.map((p) => p.category).filter(Boolean)),
      ].sort(),
      competitionTypes: [
        ...new Set(facetRows.map((p) => p.competitionType).filter(Boolean)),
      ].sort(),
    };
  res.json({ items, total, page, pageSize, facets });
});
app.get("/api/problems/:id", (req, res, next) => {
  const p = one(
    "SELECT * FROM problems WHERE id=? AND status='published'",
    req.params.id,
  );
  p
    ? res.json({
        id: p.id,
        title: p.title,
        ...json(p.metadata, {}),
        attachments: [
          ...all(
            "SELECT id,original_name name,size FROM files WHERE entity_id=? AND kind='problem-published'",
            p.id,
          ).map((f) => ({ ...f, url: `/api/files/${f.id}` })),
          ...all(
            "SELECT id,original_name name,size,mime FROM official_problem_files WHERE problem_id=?",
            p.id,
          ).map((f) => ({ ...f, url: `/api/official-files/${f.id}` })),
        ],
      })
    : next(fail(404, "赛题不存在", "NOT_FOUND"));
});
app.get("/api/comments", (req, res, next) => {
  const visible =
    req.query.targetType === "article"
      ? one(
          "SELECT 1 FROM articles WHERE id=? AND published_payload IS NOT NULL AND published_visible=1",
          req.query.targetId,
        )
      : req.query.targetType === "problem"
        ? one(
            "SELECT 1 FROM problems WHERE id=? AND status='published'",
            req.query.targetId,
          )
        : null;
  if (!visible) return next(fail(404, "内容不存在", "NOT_FOUND"));
  res.json({
    items: all(
      "SELECT c.id,c.body,c.parent_id parentId,c.created_at createdAt,u.id userId,u.nickname FROM comments c JOIN users u ON u.id=c.user_id WHERE c.target_type=? AND c.target_id=? AND c.status='visible' ORDER BY c.created_at LIMIT 200",
      req.query.targetType,
      req.query.targetId,
    ).map((c) => ({
      ...c,
      author: { id: c.userId, nickname: c.nickname },
      userId: undefined,
      nickname: undefined,
    })),
  });
});
app.post("/api/comments", auth, submitLimit, (req, res, next) => {
  try {
    if (
      !["article", "problem"].includes(req.body.targetType) ||
      !String(req.body.body || "").trim()
    )
      throw fail(400, "评论内容无效", "INVALID_INPUT");
    const targetExists =
      req.body.targetType === "article"
        ? one(
            "SELECT 1 FROM articles WHERE id=? AND published_payload IS NOT NULL AND published_visible=1",
            req.body.targetId,
          )
        : one(
            "SELECT 1 FROM problems WHERE id=? AND status='published'",
            req.body.targetId,
          );
    if (!targetExists) throw fail(404, "内容不存在", "NOT_FOUND");
    let parent = null;
    if (req.body.parentId) {
      parent = one(
        "SELECT * FROM comments WHERE id=? AND target_type=? AND target_id=? AND status='visible'",
        req.body.parentId,
        req.body.targetType,
        req.body.targetId,
      );
      if (!parent) throw fail(400, "回复目标无效", "INVALID_PARENT");
    }
    const cid = id("comment");
    run(
      "INSERT INTO comments VALUES(?,?,?,?,?,?, 'visible',?)",
      cid,
      req.user.id,
      req.body.targetType,
      req.body.targetId,
      req.body.parentId || null,
      String(req.body.body).trim().slice(0, 2000),
      now(),
    );
    if (parent && parent.user_id !== req.user.id)
      run(
        "INSERT INTO notifications VALUES(?,?,?,?,?,?)",
        id("notification"),
        parent.user_id,
        "有人回复了你的评论",
        `/${req.body.targetType}s/${req.body.targetId}`,
        null,
        now(),
      );
    res.status(201).json({ id: cid });
  } catch (e) {
    next(e);
  }
});
app.post("/api/comments/:id/report", auth, (req, res, next) => {
  if (
    !one(
      "SELECT 1 FROM comments WHERE id=? AND status='visible'",
      req.params.id,
    )
  )
    return next(fail(404, "评论不存在", "NOT_FOUND"));
  run(
    "INSERT INTO reports VALUES(?,?,?,?, 'pending',?)",
    id("report"),
    req.user.id,
    req.params.id,
    String(req.body.reason || "").slice(0, 500),
    now(),
  );
  res.status(201).json({ ok: true });
});

app.get("/api/files/:id", auth, (req, res, next) => {
  const f = one("SELECT * FROM files WHERE id=?", req.params.id);
  if (!f) return next(fail(404, "文件不存在", "NOT_FOUND"));
  let allowed = f.owner_id === req.user.id;
  if (!allowed && f.kind === "review-proof")
    allowed = can(req.user, "shop_reviews");
  if (!allowed && f.kind.startsWith("article"))
    allowed =
      can(req.user, "content") ||
      (f.kind === "article-published" &&
        one(
          "SELECT 1 FROM articles WHERE id=? AND published_payload IS NOT NULL AND published_visible=1",
          f.entity_id,
        ));
  if (!allowed && f.kind === "problem-published")
    allowed = Boolean(
      one(
        "SELECT 1 FROM problems WHERE id=? AND status='published'",
        f.entity_id,
      ),
    );
  if (!allowed) return next(fail(403, "无权访问该文件", "FORBIDDEN"));
  res.type(f.mime).download(resolve(uploadDir, f.stored_name), f.original_name);
});
app.get("/api/official-files/:id", auth, (req, res, next) => {
  const f = one(
    `SELECT f.* FROM official_problem_files f JOIN problems p ON p.id=f.problem_id
     WHERE f.id=? AND p.status='published'`,
    req.params.id,
  );
  if (!f) return next(fail(404, "文件不存在", "NOT_FOUND"));
  const path = resolve(seedDir, f.relative_path),
    inside = path.startsWith(`${seedDir}\\`) || path.startsWith(`${seedDir}/`);
  if (!inside || !existsSync(path))
    return next(fail(404, "文件不存在", "NOT_FOUND"));
  res.type(f.mime).download(path, f.original_name);
});

app.get("/api/admin/queue", auth, (req, res, next) => {
  const type = req.query.type;
  const status = ["pending", "approved", "rejected", "hidden", "all"].includes(
    req.query.status,
  )
    ? req.query.status
    : "pending";
  const clause = status === "all" ? "1=1" : "status=?",
    params = status === "all" ? [] : [status],
    where = (alias) => (status === "all" ? "1=1" : `${alias}.status=?`);
  if (type === "shops" && can(req.user, "shop_reviews"))
    return res.json({
      items: all(
        `SELECT * FROM shops WHERE ${clause} ORDER BY created_at`,
        ...params,
      ).map((s) => ({
        ...shopOut(s),
        decisionReason: s.decision_reason,
        submitterId: s.submitter_id,
        createdAt: s.created_at,
      })),
    });
  if (type === "reviews" && can(req.user, "shop_reviews"))
    return res.json({
      items: all(
        `SELECT r.*,s.name shop_name,u.nickname,f.original_name proof_name,f.mime proof_mime FROM reviews r JOIN shops s ON s.id=r.shop_id LEFT JOIN users u ON u.id=r.user_id LEFT JOIN files f ON f.id=r.proof_file_id WHERE ${where("r")} ORDER BY r.created_at`,
        ...params,
      ).map((r) => ({ ...reviewOut(r), shopName: r.shop_name })),
    });
  if (type === "articles" && can(req.user, "content"))
    return res.json({
      items: all(
        `SELECT a.*,u.nickname FROM articles a JOIN users u ON u.id=a.user_id WHERE ${where("a")} ORDER BY a.updated_at`,
        ...params,
      ).map((a) => ({
        ...articleOut(a),
        author: { id: a.user_id, nickname: a.nickname },
      })),
    });
  if (type === "reports" && can(req.user, "reports"))
    return res.json({
      items: all(
        `SELECT rp.*,c.body commentBody,c.target_type targetType,c.target_id targetId,u.nickname commentAuthor FROM reports rp JOIN comments c ON c.id=rp.comment_id JOIN users u ON u.id=c.user_id WHERE ${where("rp")} ORDER BY rp.created_at`,
        ...params,
      ).map((r) => ({ ...r, body: r.commentBody })),
    });
  next(fail(403, "没有相应审核权限", "FORBIDDEN"));
});
function decisionRoute(table, permission) {
  return [
    auth,
    permit(permission),
    (req, res, next) => {
      try {
        const decision = req.body.decision;
        if (!["approved", "rejected", "hidden"].includes(decision))
          throw fail(400, "审核决定无效", "INVALID_INPUT");
        if (decision === "rejected" && !String(req.body.reason || "").trim())
          throw fail(400, "退回时必须填写原因", "REASON_REQUIRED");
        const row = one(`SELECT * FROM ${table} WHERE id=?`, req.params.id);
        if (!row) throw fail(404, "记录不存在", "NOT_FOUND");
        if (table === "articles" && decision === "approved") {
          const author = one(
            "SELECT id,nickname FROM users WHERE id=?",
            row.user_id,
          );
          const attachments = all(
            "SELECT id,original_name name,size FROM files WHERE entity_id=? AND kind IN ('article-draft','article-published')",
            row.id,
          ).map((f) => ({ ...f, url: `/api/files/${f.id}` }));
          const payload = JSON.stringify({
            title: row.title,
            body: row.body,
            category: row.category,
            tags: json(row.tags),
            excerpt: row.excerpt,
            author: publicUser(author),
            attachments,
          });
          run(
            "UPDATE articles SET status='approved',published_payload=?,published_visible=1,published_version=published_version+1,published_at=?,decision_reason=NULL,updated_at=? WHERE id=?",
            payload,
            now(),
            now(),
            row.id,
          );
          run(
            "UPDATE files SET kind='article-published' WHERE entity_id=? AND kind='article-draft'",
            row.id,
          );
        } else {
          run(
            `UPDATE ${table} SET status=?,decision_reason=?,updated_at=? WHERE id=?`,
            decision,
            req.body.reason || null,
            now(),
            row.id,
          );
          if (table === "articles" && decision === "hidden")
            run("UPDATE articles SET published_visible=0 WHERE id=?", row.id);
        }
        audit(
          req.user,
          `审核${decision}`,
          table,
          row.id,
          req.body.reason || "",
        );
        const recipient = row.user_id || row.submitter_id;
        if (recipient)
          run(
            "INSERT INTO notifications VALUES(?,?,?,?,?,?)",
            id("notification"),
            recipient,
            decision === "approved"
              ? "你的内容已审核通过"
              : "你的内容审核状态已更新",
            table === "articles" ? `/articles/${row.id}` : "/account",
            null,
            now(),
          );
        res.json({ ok: true, status: decision });
      } catch (e) {
        next(e);
      }
    },
  ];
}
app.post(
  "/api/admin/shops/:id/decision",
  ...decisionRoute("shops", "shop_reviews"),
);
app.post(
  "/api/admin/reviews/:id/decision",
  ...decisionRoute("reviews", "shop_reviews"),
);
app.post(
  "/api/admin/articles/:id/decision",
  ...decisionRoute("articles", "content"),
);
app.post(
  "/api/admin/reports/:id/decision",
  auth,
  permit("reports"),
  (req, res, next) => {
    try {
      if (!["dismissed", "removed"].includes(req.body.decision))
        throw fail(400, "处理决定无效", "INVALID_INPUT");
      const r = one("SELECT * FROM reports WHERE id=?", req.params.id);
      if (!r) throw fail(404, "举报不存在", "NOT_FOUND");
      run("UPDATE reports SET status=? WHERE id=?", req.body.decision, r.id);
      if (req.body.decision === "removed")
        run("UPDATE comments SET status='removed' WHERE id=?", r.comment_id);
      audit(req.user, "处理举报", "report", r.id, req.body.decision);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
app.post("/api/admin/problems", auth, permit("content"), (req, res, next) => {
  try {
    const value = problemFields(req.body);
    const pid = id("problem"),
      meta = value.metadata;
    run(
      "INSERT INTO problems VALUES(?,?,?,'published',?,?)",
      pid,
      value.title,
      JSON.stringify(meta),
      req.user.id,
      now(),
    );
    audit(req.user, "发布赛题", "problem", pid);
    res.status(201).json({ id: pid });
  } catch (e) {
    next(e);
  }
});
app.get("/api/admin/problems", auth, permit("content"), (req, res) => {
  const q = String(req.query.q || "").trim(),
    like = `%${q.replace(/[\\%_]/g, "\\$&")}%`,
    status = String(req.query.status || "all"),
    year = String(req.query.year || "").trim(),
    category = String(req.query.category || "").trim(),
    group = String(req.query.group || "").trim(),
    competitionType = String(req.query.competitionType || "").trim(),
    page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20),
    ),
    where = `(?='all' OR status=?) AND (?='' OR title LIKE ? ESCAPE '\\' OR metadata LIKE ? ESCAPE '\\')
      AND (?='' OR CAST(json_extract(metadata,'$.year') AS TEXT)=?)
      AND (?='' OR json_extract(metadata,'$.category')=?)
      AND (?='' OR json_extract(metadata,'$.group')=? OR (? IN ('undergraduate','vocational') AND json_extract(metadata,'$.group')='all'))
      AND (?='' OR json_extract(metadata,'$.competitionType')=?)`,
    total = Number(
      one(
        `SELECT COUNT(*) count FROM problems WHERE ${where}`,
        status,
        status,
        q,
        like,
        like,
        year,
        year,
        category,
        category,
        group,
        group,
        group,
        competitionType,
        competitionType,
      ).count,
    ),
    items = all(
      `SELECT * FROM problems WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      status,
      status,
      q,
      like,
      like,
      year,
      year,
      category,
      category,
      group,
      group,
      group,
      competitionType,
      competitionType,
      pageSize,
      (page - 1) * pageSize,
    ).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      ...json(p.metadata, {}),
    }));
  res.json({ items, total, page, pageSize });
});
app.patch(
  "/api/admin/problems/:id",
  auth,
  permit("content"),
  (req, res, next) => {
    try {
      const row = one("SELECT * FROM problems WHERE id=?", req.params.id);
      if (!row) throw fail(404, "赛题不存在", "NOT_FOUND");
      const value = problemFields(req.body, {
          title: row.title,
          ...json(row.metadata, {}),
        }),
        status = req.body.status ?? row.status;
      if (!["published", "hidden"].includes(status))
        throw fail(400, "发布状态无效", "INVALID_INPUT");
      run(
        "UPDATE problems SET title=?,metadata=?,status=? WHERE id=?",
        value.title,
        JSON.stringify(value.metadata),
        status,
        row.id,
      );
      audit(req.user, "更新赛题", "problem", row.id, status);
      res.json({ id: row.id, title: value.title, status, ...value.metadata });
    } catch (e) {
      next(e);
    }
  },
);
app.post(
  "/api/admin/problems/:id/attachments",
  auth,
  permit("content"),
  submitLimit,
  (req, _res, next) =>
    one("SELECT 1 FROM problems WHERE id=?", req.params.id)
      ? next()
      : next(fail(404, "赛题不存在", "NOT_FOUND")),
  uploadCapacity,
  upload.single("file"),
  uploadedCapacity,
  (req, res, next) => {
    try {
      if (!req.file) throw fail(400, "请选择附件", "INVALID_INPUT");
      const fid = id("file");
      run(
        "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
        fid,
        req.user.id,
        "problem-published",
        req.params.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        now(),
      );
      res.status(201).json({
        id: fid,
        name: req.file.originalname,
        url: `/api/files/${fid}`,
      });
    } catch (e) {
      if (req.file?.path && existsSync(req.file.path))
        unlinkSync(req.file.path);
      next(e);
    }
  },
);
app.get("/api/admin/accounts", auth, owner, (req, res) => {
  const q = String(req.query.q || "").trim(),
    like = `%${q.replace(/[\\%_]/g, "\\$&")}%`,
    page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20),
    ),
    where = "(?='' OR email LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\')",
    total = Number(
      one(`SELECT COUNT(*) count FROM users WHERE ${where}`, q, like, like)
        .count,
    ),
    items = all(
      `SELECT id,email,nickname,role,permissions,enabled,email_verified emailVerified,created_at createdAt
       FROM users WHERE ${where} ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,created_at DESC LIMIT ? OFFSET ?`,
      q,
      like,
      like,
      pageSize,
      (page - 1) * pageSize,
    ).map((u) => ({
      ...u,
      permissions: json(u.permissions),
      enabled: Boolean(u.enabled),
      emailVerified: Boolean(u.emailVerified),
    }));
  res.json({ items, total, page, pageSize });
});
app.post("/api/admin/accounts", auth, owner, (_req, _res, next) =>
  next(
    fail(
      405,
      "请从已验证邮箱用户中选择并授予管理员权限",
      "PROMOTE_EXISTING_USER",
    ),
  ),
);
app.patch("/api/admin/accounts/:id", auth, owner, (req, res, next) => {
  try {
    const u = one("SELECT * FROM users WHERE id=?", req.params.id);
    if (!u) throw fail(404, "用户不存在", "NOT_FOUND");
    if (u.role === "owner")
      throw fail(403, "最高管理员账户不可修改", "OWNER_IMMUTABLE");
    const role = req.body.role === undefined ? u.role : req.body.role;
    if (!["member", "admin"].includes(role))
      throw fail(400, "用户角色无效", "INVALID_INPUT");
    if (role === "admin" && !u.email_verified)
      throw fail(400, "仅可提升已验证邮箱用户", "EMAIL_NOT_VERIFIED");
    if (req.body.enabled !== undefined && typeof req.body.enabled !== "boolean")
      throw fail(400, "启用状态必须为布尔值", "INVALID_INPUT");
    if (
      req.body.permissions !== undefined &&
      !Array.isArray(req.body.permissions)
    )
      throw fail(400, "权限必须为数组", "INVALID_INPUT");
    const enabled =
        req.body.enabled === undefined ? u.enabled : req.body.enabled ? 1 : 0,
      perms =
        role === "member"
          ? []
          : req.body.permissions === undefined
            ? json(u.permissions)
            : (req.body.permissions || []).filter((p) =>
                ["content", "shop_reviews", "reports"].includes(p),
              );
    run(
      "UPDATE users SET role=?,enabled=?,permissions=?,session_version=session_version+1 WHERE id=?",
      role,
      enabled,
      JSON.stringify(perms),
      u.id,
    );
    run("DELETE FROM sessions WHERE user_id=?", u.id);
    audit(
      req.user,
      "更新用户角色权限",
      "user",
      u.id,
      JSON.stringify({ role, enabled: Boolean(enabled), permissions: perms }),
    );
    res.json({ ok: true, role, enabled: Boolean(enabled), permissions: perms });
  } catch (e) {
    next(e);
  }
});
app.get("/api/admin/audit", auth, (req, res, next) => {
  if (
    req.user.role !== "owner" &&
    !can(req.user, "content") &&
    !can(req.user, "shop_reviews") &&
    !can(req.user, "reports")
  )
    return next(fail(403, "无权查看审计记录", "FORBIDDEN"));
  res.json({
    items: all(
      "SELECT id,actor_id actorId,action,entity_type entityType,entity_id entityId,detail,created_at createdAt FROM audit ORDER BY created_at DESC LIMIT 500",
    ),
  });
});

if (existsSync(resolve(root, "dist/index.html"))) {
  app.use(
    express.static(resolve(root, "dist"), {
      index: false,
      maxAge: production ? "1h" : 0,
    }),
  );
  app.get(/^(?!\/api\/|\/healthz$).*/, (req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
}
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE" ? "文件不能超过 50 MiB" : "文件上传失败",
      code: err.code,
    });
  if (!err.status)
    console.error("Unhandled server error:", err?.name || "Error");
  res.status(err.status || 500).json({
    error: err.status ? err.message : "服务器内部错误",
    code: err.code || "INTERNAL_ERROR",
  });
});
