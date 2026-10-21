import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = path.join(root, "scripts/promo-video/demo-assets");
const destination = path.join(root, "assets/screenshots");
const files = [];

for (const scene of ["topics", "topic", "reading"]) {
  for (const language of ["en", "zh-CN"]) {
    const name = `${scene}-${language}.png`;
    const pixels = await readFile(path.join(source, name));
    assert.equal(
      pixels.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      name,
    );
    assert.equal(pixels.toString("ascii", 12, 16), "IHDR", name);
    assert.equal(pixels.readUInt32BE(16), 2200, name);
    assert.equal(pixels.readUInt32BE(20), 1520, name);
    files.push({ name, pixels });
  }
}

await mkdir(destination, { recursive: true });
for (const { name, pixels } of files) {
  await writeFile(path.join(destination, name), pixels);
}
console.log("Synced six bilingual pixel-game captures to assets/screenshots");
