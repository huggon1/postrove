import { copyFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../..");
await mkdir(path.join(root, "public"), { recursive: true });
await mkdir(path.join(root, "output"), { recursive: true });
for (const name of ["postrove-icon.svg", "postrove-mark.svg"]) {
  await copyFile(
    path.join(repo, "assets", name),
    path.join(root, "public", name),
  );
}
for (const lang of ["zh-CN", "en"]) {
  for (const scene of [
    "topics",
    "topic",
    "topic-source",
    "library",
    "reading",
    "reading-original",
    "reading-code",
    "reading-focus",
    "reading-focus-original",
    "reading-blue",
    "reading-blue-original",
    "reading-blue-code",
    "reading-blue-focus",
    "reading-blue-focus-original",
  ]) {
    const name = `${scene}-${lang}.png`;
    await copyFile(
      path.join(root, "demo-assets", name),
      path.join(root, "public", `demo-${name}`),
    );
  }
}
for (const tone of ["yellow", "blue"]) {
  await copyFile(
    path.join(root, "demo-assets", `cover-${tone}.png`),
    path.join(root, "public", `demo-cover-${tone}.png`),
  );
}
try {
  await access(path.join(root, "output/mix-en.wav"));
  await access(path.join(root, "output/mix-zh-CN.wav"));
} catch {
  execFileSync(process.execPath, [path.join(root, "audio.mjs")], {
    stdio: "inherit",
  });
  execFileSync(process.execPath, [path.join(root, "narration.mjs")], {
    stdio: "inherit",
  });
}
for (const name of ["soundtrack.wav", "mix-zh-CN.wav", "mix-en.wav"]) {
  await copyFile(
    path.join(root, "output", name),
    path.join(root, "public", name),
  );
}
console.log(
  "Prepared current application captures, Postrove artwork, and bilingual story mixes.",
);
