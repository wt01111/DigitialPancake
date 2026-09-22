import {
  officialManifestPath,
  validateOfficialManifest,
} from "./content-manifest.js";

const entries = validateOfficialManifest();
if (!entries) throw new Error("Official problem manifest is missing");
console.log(
  `Official content validated: ${entries.length} problems (${officialManifestPath})`,
);
