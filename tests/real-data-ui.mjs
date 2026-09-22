import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.PREVIEW_BASE || "http://127.0.0.1:5173";
const outputDir = "test-results/real-data-ui";
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch(
  process.platform === "win32"
    ? { channel: "msedge", headless: true }
    : { headless: true },
);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "zh-CN",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${base}/problems`);
await expect(page.getByText("共 91 道")).toBeVisible();
await expect(page.locator(".problem-row")).toHaveCount(24);
await page.screenshot({
  path: `${outputDir}/problems-real-desktop.png`,
  fullPage: true,
});
await page.getByRole("button", { name: "下一页" }).click();
await expect(page).toHaveURL(/page=2/);
await expect(page.locator(".problem-row").first()).toBeVisible();

for (const year of ["2018", "2026"]) {
  await page.goto(`${base}/problems`);
  await page.getByLabel("竞赛").selectOption("provincial");
  await page.getByLabel("年份").selectOption(year);
  await expect(page.locator(".problem-row")).toHaveCount(8);
  await expect(page.getByText("共 8 道")).toBeVisible();
}
await page.getByLabel("类型").selectOption("signal");
await expect(page).toHaveURL(/type=signal/);
assert.ok((await page.locator(".problem-row").count()) > 0);

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: `${outputDir}/problems-2026-provincial-mobile.png`,
  fullPage: true,
});
await page.goto(`${base}/problems/nuedc-national-2025-undergraduate-h`);
await expect(
  page.getByRole("heading", { name: "野生动物巡查系统" }),
).toBeVisible();
await expect(page.getByText("题号：H", { exact: true })).toBeVisible();
await expect(page.getByText("其他", { exact: true }).first()).toBeVisible();
await expect(page.getByText("官网原始文件")).toBeVisible();
await expect(page.locator(".external-file")).toHaveCount(2);
await expect(
  page
    .locator(".external-file")
    .first()
    .getByRole("link", { name: "下载官方 H 题附图原包" }),
).toHaveAttribute("href", /^https:\/\//);
await expect(
  page
    .locator(".external-file")
    .nth(1)
    .getByRole("link", { name: "下载官方 H 题附图原包" }),
).toHaveAttribute("href", /^https:\/\//);
await expect(page.getByText(/动物体态.*原图大小/)).toBeVisible();
await expect(page.getByText(/地貌图.*原图大小/)).toBeVisible();
await expect(
  page.getByRole("link", { name: /登录后下载 H题_野生动物巡查系统\.pdf/ }),
).toHaveAttribute("href", /\/auth\?next=/);
await expect(page.getByText("登录后参与讨论。")).toBeVisible();
await expect(page.locator(".state")).toHaveCount(0);
await page.screenshot({
  path: `${outputDir}/problem-2025-h-mobile.png`,
  fullPage: true,
});

await page.goto(`${base}/admin`);
await expect(page).toHaveURL(/\/auth/);
await expect(page.getByRole("heading", { name: "登录电子煎饼" })).toBeVisible();
await page.screenshot({
  path: `${outputDir}/admin-auth-guard.png`,
  fullPage: true,
});
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Real data UI checks passed: 91 problems, pagination, 2018/2026 provincial filters, combined type filter, official external files, authenticated attachment prompt, and admin auth guard.",
);
