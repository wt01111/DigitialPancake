import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = resolve(root, "work/nuedc-import");
const contentRoot = resolve(root, "server/seed/problems-official-files");
const seedPath = resolve(root, "server/seed/problems-official.json");
const retrievalStampPath = resolve(workRoot, "retrieved-at.txt");
const MAX_ARCHIVE_BYTES = 150 * 1024 ** 2;
const MAX_EXPANDED_ARCHIVE_BYTES = 300 * 1024 ** 2;
const MAX_TOTAL_EXPANDED_BYTES = 500 * 1024 ** 2;
const MAX_ENTRIES = 1000;
// Windows 10/11 ships bsdtar as `tar`; on Ubuntu install `libarchive-tools`
// and call `bsdtar`, because GNU tar does not extract the official RAR files.
const archiveTool = process.platform === "win32" ? "tar" : "bsdtar";

const sources = [
  {
    year: 2017,
    page: "https://nuedc.xidian.edu.cn/html/news/2017/0809/364.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/170809/2-1FPZK447.rar",
    name: "2-1FPZK447.rar",
    sha256: "af54353621cb5aca0725f0be7e6052fcf095bf4377a9cc3267ffdc61c536e6b0",
    size: 2672376,
  },
  {
    year: 2019,
    page: "https://nuedc.xidian.edu.cn/html/news/2019/0807/416.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/190807/2-1ZPFJ213.zip",
    name: "2-1ZPFJ213.zip",
    sha256: "df46dd3c7435c9927f0a7f69dfb4aa8ff7d28c112afb73acb7783198d644a1ff",
    size: 2662390,
    relatedNotices: [
      {
        url: "https://nuedc.xidian.edu.cn/html/news/2019/0808/418.html",
        note: "2019 年竞赛问题汇总；用于核对正式题目的统一说明。",
      },
    ],
  },
  {
    year: 2021,
    page: "https://nuedc.xidian.edu.cn/html/news/2021/1104/458.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/211104/2-2111040J048.rar",
    name: "2-2111040J048.rar",
    sha256: "733f07cfbf1969a04d8894237ad0b9b8b3aad679633234185a56af83d096f461",
    size: 5052530,
  },
  {
    year: 2021,
    page: "https://nuedc.xidian.edu.cn/html/news/2021/1104/458.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/211104/2-2111040J135.rar",
    name: "2-2111040J135.rar",
    sha256: "1e1568920108b9fb3dc80362d6c6f9abd6a89051199847c2731c5be7eee024eb",
    size: 1788006,
  },
  {
    year: 2023,
    page: "https://nuedc.xidian.edu.cn/html/news/2023/0802/487.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/230803/2-230P3094519.zip",
    name: "2-230P3094519.zip",
    sha256: "81dbad42dca2984526b1805e75b712d3eec1d0cb839e9b7a0562758590052d4e",
    size: 2645662,
  },
  {
    year: 2025,
    page: "https://nuedc.xidian.edu.cn/html/news/2025/0730/513.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/250730/2_0741338441.rar",
    name: "2_0741338441.rar",
    sha256: "bc68f44d5599ac25b9b0494e4fc97b8fdea0b2d56c919b0a3d6072740ddab847",
    size: 5829714,
  },
  {
    year: 2025,
    page: "https://nuedc.xidian.edu.cn/html/news/2025/0730/513.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/250730/2_0742232691.rar",
    name: "2_0742232691.rar",
    sha256: "321c7372afed64941e8d20864ebc76513b83e176bd3d1519ea2bd496f575ca38",
    size: 109367608,
  },
  {
    year: 2025,
    page: "https://nuedc.xidian.edu.cn/html/news/2025/0730/513.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/250730/2_0744507171.rar",
    name: "2_0744507171.rar",
    sha256: "a3958ca27be027efd2065a79642371e5c6f07426fa84f58134b6caced367c7dd",
    size: 2467363,
  },
  {
    year: 2025,
    page: "https://nuedc.xidian.edu.cn/html/news/2025/0730/513.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/250731/2_0929077871.rar",
    name: "2_0929077871.rar",
    sha256: "96949802ecf5e0283534905cca0e3cd5857c94d00d7943fb608829012b5349e2",
    size: 1812,
  },
  {
    year: 2018, competitionType: "provincial",
    competitionName: "2018年陕西省TI杯竞赛",
    page: "https://nuedc.xidian.edu.cn/html/news/2018/0720/390.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/180720/2-1PH00K610.zip",
    name: "2-1PH00K610.zip", sha256: "dfdc326f6f5691e0afb0c6b8cd77c865be748dc2edabefc91893f63723dc18c6", size: 1439495,
  },
  {
    year: 2020, competitionType: "provincial",
    competitionName: "2020年陕西省第七届TI杯模拟及模数混合电路应用设计竞赛",
    page: "https://nuedc.xidian.edu.cn/html/news/2020/1009/441.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/201009/2-201009221213.zip",
    name: "2-201009221213.zip", sha256: "7c7591b5e392c5a04f2df859907dab0b07dc970ca45d1052683afc672a64aa5f", size: 2184970,
  },
  {
    year: 2022, competitionType: "provincial",
    competitionName: "2022年陕西省TI杯大学生电子设计竞赛",
    page: "https://nuedc.xidian.edu.cn/html/news/2022/0727/476.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/220727/2-220HFJ458.zip",
    name: "2-220HFJ458.zip", sha256: "d77a09e64368fb06e9d8c07f7f7e2c7fa537dcf6e80f9c54c2e77e6cd69f30e1", size: 475872,
  },
  {
    year: 2024, competitionType: "provincial",
    competitionName: "陕西省第九届大学生（TI杯）模拟及模数混合电路应用设计竞赛",
    page: "https://nuedc.xidian.edu.cn/html/news/2024/0729/503.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/240729/2-240HZJ217.zip",
    name: "2-240HZJ217.zip", sha256: "688d78ed0ea1fa0498e0ec57593a1946cd5776c901180f44b71015604b9027ea", size: 2827087,
  },
  {
    year: 2026, competitionType: "provincial",
    competitionName: "陕西省第十届大学生（TI杯）模拟及模数混合电路应用设计竞赛",
    page: "https://nuedc.xidian.edu.cn/html/news/2026/0729/526.html",
    url: "https://nuedc.xidian.edu.cn/uploads/soft/260729/2_0713202601.rar",
    name: "2_0713202601.rar", sha256: "e02c3f703d07d6341e6161a078f7148f2cdfef5838a8824caf89cce1e1fa54a4", size: 3215223,
  },
];

for (const source of sources) {
  source.competitionType ||= "national";
  source.competitionName ||= `${source.year}年全国大学生电子设计竞赛`;
}

const categories = {
  "2017-A": "power", "2017-B": "control", "2017-C": "control",
  "2017-E": "signal", "2017-F": "signal", "2017-H": "signal",
  "2017-I": "signal", "2017-K": "power", "2017-L": "control",
  "2017-M": "control", "2017-O": "control", "2017-P": "other",
  "2019-A": "power", "2019-B": "control", "2019-C": "power",
  "2019-D": "signal", "2019-E": "signal", "2019-F": "other",
  "2019-G": "signal", "2019-H": "control", "2019-I": "other",
  "2019-J": "control", "2019-K": "control",
  "2021-A": "signal", "2021-B": "power", "2021-C": "power",
  "2021-D": "signal", "2021-E": "signal", "2021-F": "control",
  "2021-G": "control", "2021-H": "power", "2021-I": "power",
  "2021-J": "signal", "2021-K": "control",
  "2023-A": "power", "2023-B": "signal", "2023-C": "signal",
  "2023-D": "signal", "2023-E": "control", "2023-F": "signal",
  "2023-G": "control", "2023-H": "signal", "2023-I": "control",
  "2023-J": "signal", "2023-K": "signal",
  "2025-A": "power", "2025-B": "power", "2025-C": "signal",
  "2025-D": "signal", "2025-E": "control", "2025-F": "signal",
  "2025-G": "signal", "2025-H": "other", "2025-I": "control",
  "2025-J": "signal", "2025-K": "control",
};
const provincialCategories = {
  "2018-A": "signal", "2018-B": "control", "2018-C": "power", "2018-D": "signal",
  "2018-E": "power", "2018-F": "signal", "2018-G": "signal", "2018-H": "power",
  "2020-A": "signal", "2020-B": "power", "2020-C": "control", "2020-D": "control", "2020-E": "signal",
  "2022-A": "power", "2022-B": "control", "2022-C": "control", "2022-D": "signal", "2022-E": "signal", "2022-F": "signal",
  "2024-A": "power", "2024-B": "power", "2024-C": "signal", "2024-D": "control",
  "2024-E": "control", "2024-F": "control", "2024-G": "signal", "2024-H": "control",
  "2026-A": "power", "2026-B": "power", "2026-C": "signal", "2026-D": "control",
  "2026-E": "control", "2026-F": "signal", "2026-G": "signal", "2026-H": "control",
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${path}`);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Special file rejected: ${path}`);
  }
  return result;
}
function sourceForPath(path) {
  const segment = relative(resolve(workRoot, "extracted"), path).split(sep)[0];
  const source = sources.find((item) => item.name.replace(/\.(rar|zip)$/i, "") === segment);
  if (!source) throw new Error(`No source archive for ${path}`);
  return source;
}
async function download(source, destination) {
  if (source.size > MAX_ARCHIVE_BYTES) throw new Error(`Archive too large: ${source.name}`);
  if (!existsSync(destination)) {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok || !response.body) throw new Error(`Download ${response.status}: ${source.url}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared && declared !== source.size) throw new Error(`Size changed: ${source.name}`);
    let received = 0;
    const limitedBody = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > source.size || received > MAX_ARCHIVE_BYTES)
          throw new Error(`Download byte limit exceeded: ${source.name}`);
        controller.enqueue(chunk);
      },
    }));
    try {
      await pipeline(limitedBody, createWriteStream(destination, { flags: "wx" }));
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    }
  }
  const data = await readFile(destination);
  if (data.length !== source.size || sha256(data) !== source.sha256)
    throw new Error(`Hash/size mismatch: ${source.name}`);
}
function inspectArchive(archive) {
  const listing = execFileSync(archiveTool, ["-tvf", archive], { encoding: "utf8", maxBuffer: 10 * 1024 ** 2 });
  const lines = listing.split(/\r?\n/).filter(Boolean);
  if (lines.length > MAX_ENTRIES) throw new Error(`Too many archive entries: ${archive}`);
  let expanded = 0;
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+\S+\s+\S+\s+(\d+)\s+.*?\s([^\s].*)$/);
    if (!match) throw new Error(`Unparseable archive listing: ${line}`);
    const [permissions, sizeText, name] = [match[1], match[2], match[3]];
    if (!["-", "d"].includes(permissions[0])) throw new Error(`Link/special entry rejected: ${name}`);
    const normalized = name.replaceAll("\\", "/");
    if (/^(\/|[A-Za-z]:)|(^|\/)\.\.($|\/)/.test(normalized))
      throw new Error(`Unsafe archive path: ${name}`);
    expanded += Number(sizeText);
  }
  if (expanded > MAX_EXPANDED_ARCHIVE_BYTES) throw new Error(`Expanded archive too large: ${archive}`);
  return expanded;
}
async function fetchAndExtract() {
  const downloadRoot = resolve(workRoot, "downloads");
  const extractedRoot = resolve(workRoot, "extracted");
  await mkdir(downloadRoot, { recursive: true });
  await mkdir(extractedRoot, { recursive: true });
  let totalExpanded = 0;
  for (const source of sources) {
    if (basename(source.name) !== source.name || !/^[A-Za-z0-9_.-]+$/.test(source.name))
      throw new Error(`Unsafe source archive name: ${source.name}`);
    const archive = join(downloadRoot, source.name);
    await download(source, archive);
    totalExpanded += inspectArchive(archive);
    if (totalExpanded > MAX_TOTAL_EXPANDED_BYTES) throw new Error("Total expanded data limit exceeded");
    const destination = resolve(extractedRoot, source.name.replace(/\.(rar|zip)$/i, ""));
    if (dirname(destination) !== extractedRoot)
      throw new Error(`Extraction destination escapes work directory: ${destination}`);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    execFileSync(archiveTool, ["-xf", archive, "-C", destination], { stdio: "inherit" });
    for (const nested of (await walk(destination)).filter((file) => /\.(?:zip|rar)$/i.test(file))) {
      totalExpanded += inspectArchive(nested);
      if (totalExpanded > MAX_TOTAL_EXPANDED_BYTES) throw new Error("Total expanded data limit exceeded");
      const nestedDestination = resolve(`${nested}.extracted`);
      if (!nestedDestination.startsWith(`${destination}${sep}`))
        throw new Error(`Nested extraction destination escapes source directory: ${nestedDestination}`);
      await rm(nestedDestination, { recursive: true, force: true });
      await mkdir(nestedDestination, { recursive: true });
      execFileSync(archiveTool, ["-xf", nested, "-C", nestedDestination], { stdio: "inherit" });
    }
    const files = await walk(destination);
    let actual = 0;
    for (const file of files) actual += (await stat(file)).size;
    if (actual > MAX_EXPANDED_ARCHIVE_BYTES) throw new Error(`Extracted archive too large: ${source.name}`);
  }
  await writeFile(retrievalStampPath, `${new Date().toISOString()}\n`, "utf8");
}
function parseProblemName(path) {
  const filename = basename(path, extname(path));
  const code = filename.match(/^([A-K])题[_-]/)?.[1] || filename.match(/[（(]([A-P])题[）)]/)?.[1];
  if (!code) return null;
  const title = filename
    .replace(/^[A-P]题[_-]/, "")
    .replace(/[（(][A-P]题[）)]$/, "")
    .trim();
  return { code, title };
}
function parseProvincialName(path, text = "") {
  const filename = basename(path, extname(path));
  let match = filename.match(/题([A-H])-/) || filename.match(/^([A-H])题[-_]/);
  if (match) {
    return {
      code: match[1],
      title: filename.replace(/^.*?题[A-H]-/, "").replace(/^[A-H]题[-_]/, "").trim(),
    };
  }
  match = text.match(/(?:（|\()([A-H])\s*题(?:）|\))|([A-H])\s*题[：:]/);
  const code = match?.[1] || match?.[2];
  if (!code) return null;
  const titleLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.includes(`${code} 题`) || line.includes(`${code}题`));
  const title = (titleLine || filename).replace(/^.*?[：:]\s*/, "").replace(/[（(][A-H]\s*题[）)]/, "").trim();
  return { code, title };
}
function reason(category, title) {
  const basis = {
    power: "电能变换、供电、储能或用电特性",
    signal: "信号产生、传输、检测、测量或处理",
    control: "执行机构、运动对象或闭环自动控制",
    other: "综合感知、显示或场景化电子系统",
  }[category];
  return `依据官方题目正文的设计任务与指标，“${title}”以${basis}为核心，归入 ${category}。`;
}
function relatedNotices(year, code, source) {
  const notices = [...(source.relatedNotices || [])];
  if (year === 2017 && code === "H")
    notices.push({
      url: "https://nuedc.xidian.edu.cn/html/news/2017/0811/365.html",
      note: "H 题补充说明：发挥部分要求使用 5V 单电源，且不得使用 DC-DC 模块。",
    });
  return notices;
}
async function copyAttachment(sourcePath, relativePath, sourceUrl) {
  const data = await readFile(sourcePath);
  const seedDir = dirname(seedPath);
  const destination = resolve(seedDir, relativePath);
  if (destination !== contentRoot && !destination.startsWith(`${contentRoot}${sep}`))
    throw new Error(`Attachment destination escapes official content root: ${relativePath}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(sourcePath, destination);
  return {
    relativePath: relative(seedDir, destination).replaceAll(sep, "/"),
    name: basename(sourcePath),
    sourceUrl,
    sha256: sha256(data),
    size: data.length,
    mime: ({ ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation" })[extname(sourcePath).toLowerCase()],
  };
}
async function buildSeed() {
  const retrievedAt = existsSync(retrievalStampPath)
    ? (await readFile(retrievalStampPath, "utf8")).trim()
    : new Date().toISOString();
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error("Invalid retrieval timestamp");
  const extractedRoot = resolve(workRoot, "extracted");
  if (contentRoot !== resolve(root, "server/seed/problems-official-files"))
    throw new Error("Refusing to clean an unexpected official content directory");
  await rm(contentRoot, { recursive: true, force: true });
  await mkdir(contentRoot, { recursive: true });
  const allFiles = await walk(extractedRoot);
  const problems = [];
  for (const pdf of allFiles.filter((path) => extname(path).toLowerCase() === ".pdf" && sourceForPath(path).competitionType === "national")) {
    if (/数字字模/.test(pdf)) continue;
    const parsed = parseProblemName(pdf);
    if (!parsed) continue;
    const source = sourceForPath(pdf);
    const textPath = join(workRoot, "text-current.txt");
    execFileSync("pdftotext", ["-enc", "UTF-8", "-f", "1", "-l", "3", pdf, textPath]);
    const text = await readFile(textPath, "utf8");
    const year = Number(text.match(/(2017|2019|2021|2023|2025)\s*年全国大学生电子设计竞赛试题/)?.[1]);
    const titleMarker = new RegExp(`[（(]${parsed.code}\\s*题[）)]`);
    const titlePosition = text.search(titleMarker);
    const groupMarker = titlePosition >= 0
      ? text.slice(titlePosition, titlePosition + 300).match(/【(本科组|高职高专组)】/)?.[1]
      : null;
    const group = groupMarker === "本科组" ? "undergraduate" : groupMarker === "高职高专组" ? "vocational" : null;
    if (!year || !group || year !== source.year) throw new Error(`Cannot verify year/group from PDF: ${pdf}`);
    const category = categories[`${year}-${parsed.code}`];
    if (!category) throw new Error(`Missing classification: ${year}-${parsed.code}`);
    const pdfRelative = `problems-official-files/${year}/${group}/${parsed.code}.pdf`;
    const files = [await copyAttachment(pdf, pdfRelative, source.url)];
    problems.push({
      id: `nuedc-national-${year}-${group}-${parsed.code.toLowerCase()}`,
      title: parsed.title,
      year,
      group,
      problemCode: parsed.code,
      category,
      sourcePage: source.page,
      sourceUrl: source.url,
      retrievedAt,
      classificationReason: reason(category, parsed.title),
      competitionType: "national",
      competitionName: source.competitionName,
      relatedNotices: relatedNotices(year, parsed.code, source),
      files,
    });
  }
  const byKey = new Map(problems.map((problem) => [`${problem.year}-${problem.problemCode}`, problem]));
  const supportRules = [
    { root: "2-1ZPFJ213", code: "B", match: /附图.*\.(jpg)$/i, names: ["diagram-1.jpg", "diagram-2.jpg"] },
    { root: "2-2111040J048", code: "F", match: /数字字模\.pdf$/i, names: ["font-template.pdf"] },
    { root: "2_0742232691", code: "H", match: /\.png$/i, names: ["animal-posture.png", "terrain-map.png"], externalOnly: true },
    { root: "2_0929077871", code: "J", match: /\.svg$/i, names: ["diagram.svg"] },
  ];
  for (const rule of supportRules) {
    const candidates = allFiles.filter((path) => relative(extractedRoot, path).split(sep)[0] === rule.root && rule.match.test(path) && !basename(path).startsWith("._"));
    candidates.sort();
    if (candidates.length !== rule.names.length) throw new Error(`Support attachment count mismatch: ${rule.root}/${rule.code}`);
    const source = sourceForPath(candidates[0]);
    const problem = byKey.get(`${source.year}-${rule.code}`);
    for (let index = 0; index < candidates.length; index += 1) {
      const relativePath = `problems-official-files/${source.year}/${problem.group}/${rule.code}-${rule.names[index]}`;
      const candidateSize = (await stat(candidates[index])).size;
      if (rule.externalOnly || candidateSize > 50 * 1024 ** 2) {
        const data = await readFile(candidates[index]);
        problem.externalFiles ||= [];
        problem.externalFiles.push({
          originalName: basename(candidates[index]), sourceUrl: source.url,
          sha256: sha256(data), size: data.length,
          mime: ".png" === extname(candidates[index]).toLowerCase() ? "image/png" : "application/octet-stream",
          note: rule.externalOnly
            ? "按站点容量策略未收入本站；请从官方 H 题附图原包下载并核对 SHA-256。"
            : "官方原包内单文件超过 50 MiB，未收入仓库；请从官方题包下载并核对 SHA-256。",
        });
      } else problem.files.push(await copyAttachment(candidates[index], relativePath, source.url));
    }
  }
  for (const file of allFiles.filter((path) => [".pdf", ".doc", ".docx"].includes(extname(path).toLowerCase()) && sourceForPath(path).competitionType === "provincial")) {
    const source = sourceForPath(file);
    let text = "";
    if (extname(file).toLowerCase() === ".pdf") {
      const textPath = join(workRoot, "text-current.txt");
      execFileSync("pdftotext", ["-enc", "UTF-8", "-f", "1", "-l", "3", file, textPath]);
      text = await readFile(textPath, "utf8");
    }
    const parsed = parseProvincialName(file, text);
    if (!parsed) throw new Error(`Cannot parse provincial problem: ${file}`);
    const category = provincialCategories[`${source.year}-${parsed.code}`];
    if (!category) throw new Error(`Missing provincial classification: ${source.year}-${parsed.code}`);
    const extension = extname(file).toLowerCase();
    const fileRelative = `problems-official-files/${source.year}/all/${parsed.code}${extension}`;
    problems.push({
      id: `nuedc-shaanxi-ti-${source.year}-all-${parsed.code.toLowerCase()}`,
      title: parsed.title, year: source.year, group: "all", problemCode: parsed.code,
      category, competitionType: "provincial", competitionName: source.competitionName,
      sourcePage: source.page, sourceUrl: source.url, retrievedAt,
      classificationReason: reason(category, parsed.title), relatedNotices: [],
      files: [await copyAttachment(file, fileRelative, source.url)],
    });
  }
  for (const year of [2024, 2026]) {
    const problem = problems.find((item) => item.year === year && item.competitionType === "provincial" && item.problemCode === "D");
    const support = allFiles.filter((path) => {
      const source = sourceForPath(path);
      return source.year === year && source.competitionType === "provincial" && /\.extracted(?:\\|\/)/.test(path) && [".png", ".pptx"].includes(extname(path).toLowerCase());
    }).sort();
    if (!problem || support.length !== (year === 2024 ? 25 : 4))
      throw new Error(`Provincial D support attachment count mismatch: ${year} (${support.length})`);
    for (let index = 0; index < support.length; index += 1) {
      const extension = extname(support[index]).toLowerCase();
      const attachment = await copyAttachment(
        support[index],
        `problems-official-files/${year}/all/D-support-${String(index + 1).padStart(2, "0")}${extension}`,
        sourceForPath(support[index]).url,
      );
      attachment.name = `${year} D题 ${problem.title} 附件 ${String(index + 1).padStart(2, "0")}${extension}`;
      problem.files.push(attachment);
    }
  }
  problems.sort((a, b) => a.year - b.year || a.problemCode.localeCompare(b.problemCode));
  if (problems.length !== 91) throw new Error(`Expected 91 problems, found ${problems.length}`);
  await mkdir(dirname(seedPath), { recursive: true });
  await writeFile(seedPath, `${JSON.stringify({ schemaVersion: 1, retrievedAt, sources, problems }, null, 2)}\n`, "utf8");
  await writeFile(resolve(contentRoot, "README.md"), `# 官方赛题附件\n\n来源为全国大学生电子设计竞赛陕西赛区官方网站：2017、2019、2021、2023、2025 年全国正式赛题，以及 2018、2020、2022、2024、2026 年陕西省 TI 杯正式赛题。文件保持官方原始内容，SHA-256、来源页和下载地址见 \`server/seed/problems-official.json\`。官方资料的权利与许可仍归原权利人；收入本站不表示重新授权。\n`, "utf8");
  await rm(join(workRoot, "text-current.txt"), { force: true });
  console.log(`Built ${problems.length} problems at ${seedPath}`);
}

if (process.argv.includes("--fetch")) await fetchAndExtract();
await buildSeed();
