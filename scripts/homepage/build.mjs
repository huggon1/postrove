import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputDirectory = path.join(repositoryRoot, "dist/homepage");
const files = [
  ["website/index.html", "index.html"],
  ["website/styles.css", "styles.css"],
  ["website/main.js", "main.js"],
  ...["postrove-mark.svg", "postrove-icon.svg"].map((name) => [
    `assets/${name}`,
    `assets/${name}`,
  ]),
  ...["topics", "topic", "reading"].flatMap((scene) =>
    ["en", "zh-CN"].map((language) => {
      const asset = `assets/screenshots/${scene}-${language}.png`;
      return [asset, asset];
    }),
  ),
];

for (const [source] of files) {
  const details = await stat(path.join(repositoryRoot, source));
  if (!details.isFile())
    throw new Error(`Homepage source is not a file: ${source}`);
}

await rm(outputDirectory, { recursive: true, force: true });
for (const [source, destination] of files) {
  const outputFile = path.join(outputDirectory, destination);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await copyFile(path.join(repositoryRoot, source), outputFile);
}

console.log("Built homepage at dist/homepage");
