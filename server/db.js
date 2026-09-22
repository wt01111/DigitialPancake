import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seedDir,
  officialManifestPath,
  officialRelativePath,
  validateOfficialManifest,
} from "./content-manifest.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(
  root,
  process.env.DATABASE_PATH || "server/data/site.sqlite",
);
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,nickname TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',permissions TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,session_version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,version INTEGER NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS verification_codes(id TEXT PRIMARY KEY,email TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shops(id TEXT PRIMARY KEY,name TEXT NOT NULL,aliases TEXT NOT NULL DEFAULT '[]',owner_ref TEXT,platform TEXT,url TEXT,condition_text TEXT,business_scope TEXT,source_rows TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL,submitter_id TEXT,decision_reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,user_id TEXT,source_type TEXT NOT NULL,rating INTEGER,pros TEXT,cons TEXT,purchase_experience TEXT,purchased_at TEXT,order_platform TEXT,sentiment TEXT,source_payload TEXT,proof_file_id TEXT,status TEXT NOT NULL,decision_reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(shop_id) REFERENCES shops(id),FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,category TEXT,tags TEXT NOT NULL DEFAULT '[]',excerpt TEXT,status TEXT NOT NULL,decision_reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS problems(id TEXT PRIMARY KEY,title TEXT NOT NULL,metadata TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'published',created_by TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS official_problem_files(id TEXT PRIMARY KEY,problem_id TEXT NOT NULL,relative_path TEXT NOT NULL,original_name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,source_url TEXT,FOREIGN KEY(problem_id) REFERENCES problems(id));
CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,parent_id TEXT,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'visible',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS comment_likes(comment_id TEXT NOT NULL,user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(comment_id,user_id),FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,comment_id TEXT NOT NULL,reason TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(comment_id) REFERENCES comments(id));
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT,stored_name TEXT NOT NULL,original_name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS bookmarks(user_id TEXT NOT NULL,item_type TEXT NOT NULL,item_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,item_type,item_id));
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,href TEXT,read_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,detail TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_shops_status_name ON shops(status,name); CREATE INDEX IF NOT EXISTS idx_reviews_shop_status ON reviews(shop_id,status); CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status); CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at); CREATE INDEX IF NOT EXISTS idx_comments_target_thread ON comments(target_type,target_id,parent_id,created_at);`);
for (const sql of [
  "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE articles ADD COLUMN published_payload TEXT",
  "ALTER TABLE articles ADD COLUMN published_version INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE articles ADD COLUMN published_visible INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(sql);
  } catch (error) {
    if (!String(error.message).includes("duplicate column")) throw error;
  }
}

export { seedDir };
const seedPath = resolve(seedDir, "shop-seed.json");
export function seedHistoricalShops() {
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  const insertShop = db.prepare(
    `INSERT OR IGNORE INTO shops(id,name,aliases,owner_ref,platform,url,condition_text,business_scope,source_rows,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'approved',?,?)`,
  );
  const insertReview = db.prepare(
    `INSERT OR IGNORE INTO reviews(id,shop_id,source_type,sentiment,source_payload,status,created_at,updated_at) VALUES(?,?,'workbook',?,?,'approved',?,?)`,
  );
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const shop of seed.shops || []) {
      insertShop.run(
        shop.id,
        shop.name,
        JSON.stringify(shop.aliases || []),
        shop.ownerId || null,
        shop.platform || null,
        shop.url || null,
        shop.condition || null,
        shop.businessScope || null,
        JSON.stringify(shop.sourceRows || []),
        now,
        now,
      );
      for (const review of shop.historicalReviews || [])
        insertReview.run(
          review.id,
          shop.id,
          review.sentiment || "neutral",
          JSON.stringify({ ...review, status: undefined }),
          now,
          now,
        );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
seedHistoricalShops();

export function seedOfficialProblems() {
  if (!officialManifestPath) return;
  const entries = validateOfficialManifest(),
    insertProblem = db.prepare(
      "INSERT OR IGNORE INTO problems(id,title,metadata,status,created_by,created_at) VALUES(?,?,?,'published',NULL,?)",
    ),
    insertFile = db.prepare(
      "INSERT OR IGNORE INTO official_problem_files VALUES(?,?,?,?,?,?,?,?)",
    ),
    allowedCategories = new Set(["signal", "control", "power", "other"]),
    allowedCompetitions = new Set(["national", "provincial"]);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of entries) {
      if (
        !allowedCategories.has(item.category) ||
        !allowedCompetitions.has(item.competitionType)
      )
        throw new Error(`Invalid official problem: ${item.id}`);
      const { files = [], title, id, ...metadata } = item;
      insertProblem.run(
        id,
        title,
        JSON.stringify(metadata),
        item.retrievedAt || new Date().toISOString(),
      );
      for (const [index, file] of files.entries()) {
        const relativePath = officialRelativePath(file.relativePath),
          absolutePath = resolve(seedDir, relativePath);
        insertFile.run(
          file.id || `${id}-file-${index + 1}`,
          id,
          relativePath,
          file.name || relativePath.split("/").at(-1),
          file.mime || "application/pdf",
          Number(file.size) || 0,
          String(file.sha256 || ""),
          file.sourceUrl || null,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
seedOfficialProblems();

export const one = (sql, ...params) => db.prepare(sql).get(...params);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);
export const json = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
