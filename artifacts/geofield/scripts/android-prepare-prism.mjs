import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

// AAPT transparently expands .gz assets and removes their extension. Prepare the
// native files and manifest together so the WebView requests the packaged names.
const base = new URL("../android/app/src/main/assets/public/prism/", import.meta.url);
const manifestUrl = new URL("manifest.json", base);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
for (const variable of Object.values(manifest.variables)) {
  if (!variable.file.endsWith(".gz")) continue;
  const original = new URL(variable.file, base);
  const bytes = gunzipSync(readFileSync(original));
  variable.file = variable.file.slice(0, -3);
  writeFileSync(new URL(variable.file, base), bytes);
  variable.bytes = bytes.length;
  variable.sha256 = createHash("sha256").update(bytes).digest("hex");
  unlinkSync(original);
}
writeFileSync(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
