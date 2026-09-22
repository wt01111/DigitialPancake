import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const root = resolve("work");
await mkdir(root, { recursive: true });
const temp = await mkdtemp(join(root, "persistence-test-")),
  database = join(temp, "site.sqlite");
function child(args) {
  return new Promise((resolvePromise, reject) => {
    const processChild = spawn(
      process.execPath,
      ["tests/persistence-child.mjs", ...args],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test", DATABASE_PATH: database },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "";
    processChild.stdout.on("data", (chunk) => (stdout += chunk));
    processChild.stderr.on("data", (chunk) => (stderr += chunk));
    processChild.on("error", reject);
    processChild.on("exit", (code) =>
      code === 0
        ? resolvePromise(stdout)
        : reject(new Error(`persistence child failed (${code}): ${stderr}`)),
    );
  });
}
try {
  const { reviewId, shopId } = JSON.parse(await child(["write"]));
  await child(["check", reviewId, shopId]);
  console.log(
    "PASS: hidden seed records and soft-deleted comments persist across restart",
  );
} finally {
  const target = resolve(temp);
  assert.ok(target.startsWith(root + sep));
  assert.ok(basename(target).startsWith("persistence-test-"));
  await rm(target, { recursive: true, force: true });
}
