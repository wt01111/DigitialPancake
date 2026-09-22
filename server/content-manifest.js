import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const seedDir = resolve(dirname(fileURLToPath(import.meta.url)), "seed");
export const officialManifestPath = [
  resolve(seedDir, "problems-official.json"),
  resolve(seedDir, "problems-national.json"),
].find(existsSync);

export function readOfficialManifest() {
  if (!officialManifestPath) return null;
  const value = JSON.parse(readFileSync(officialManifestPath, "utf8"));
  return Array.isArray(value) ? value : value.problems;
}

export function officialRelativePath(value) {
  const path = String(value || "").replaceAll("\\", "/");
  return path.startsWith("server/seed/")
    ? path.slice("server/seed/".length)
    : path;
}

export function validateOfficialManifest(entries = readOfficialManifest()) {
  if (entries === null) return null;
  if (!Array.isArray(entries) || entries.length < 91)
    throw new Error(
      "Official problem manifest is incomplete (expected at least 91 problems)",
    );
  const ids = new Set(),
    categories = new Set(["signal", "control", "power", "other"]),
    competitions = new Set(["national", "provincial"]);
  for (const item of entries) {
    if (!item.id || ids.has(item.id))
      throw new Error(`Invalid or duplicate official problem id: ${item.id}`);
    ids.add(item.id);
    if (
      !item.title ||
      !Number.isInteger(Number(item.year)) ||
      Number(item.year) < 2017 ||
      !categories.has(item.category) ||
      !competitions.has(item.competitionType) ||
      !item.competitionName
    )
      throw new Error(`Invalid official problem metadata: ${item.id}`);
    if (!Array.isArray(item.files) || item.files.length === 0)
      throw new Error(`Official problem has no attachment: ${item.id}`);
    for (const file of item.files) {
      const relativePath = officialRelativePath(file.relativePath),
        path = resolve(seedDir, relativePath),
        back = relative(seedDir, path);
      if (
        !relativePath ||
        back.startsWith("..") ||
        isAbsolute(back) ||
        !existsSync(path)
      )
        throw new Error(
          `Official attachment path is invalid: ${item.id}/${relativePath}`,
        );
      const size = statSync(path).size;
      if (size !== Number(file.size))
        throw new Error(
          `Official attachment size mismatch: ${item.id}/${relativePath}`,
        );
      const digest = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      if (
        !/^[a-f0-9]{64}$/i.test(file.sha256 || "") ||
        digest !== String(file.sha256).toLowerCase()
      )
        throw new Error(
          `Official attachment checksum mismatch: ${item.id}/${relativePath}`,
        );
    }
  }
  const national = entries.filter(
      (item) => item.competitionType === "national",
    ).length,
    provincial = entries.filter(
      (item) => item.competitionType === "provincial",
    ).length;
  if (national < 56 || provincial < 35)
    throw new Error(
      "Official problem manifest is incomplete (expected 56 national and 35 provincial problems)",
    );
  const nationalYears = [
    ...new Set(
      entries
        .filter((item) => item.competitionType === "national")
        .map((item) => Number(item.year)),
    ),
  ];
  for (const year of nationalYears) {
    const groups = new Set(
      entries
        .filter(
          (item) =>
            item.competitionType === "national" && Number(item.year) === year,
        )
        .map((item) => item.group),
    );
    if (!groups.has("undergraduate") || !groups.has("vocational"))
      throw new Error(
        `National problem grouping is incomplete for ${year} (expected undergraduate and vocational)`,
      );
  }
  const representative = (year, problemCode) =>
    entries.find(
      (item) =>
        item.competitionType === "national" &&
        Number(item.year) === year &&
        item.problemCode === problemCode,
    );
  if (representative(2017, "A")?.group !== "undergraduate")
    throw new Error(
      "2017 national problem A must be classified as undergraduate",
    );
  if (representative(2025, "K")?.group !== "vocational")
    throw new Error("2025 national problem K must be classified as vocational");
  return entries;
}
