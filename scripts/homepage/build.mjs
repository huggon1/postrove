import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderHomepage } from "../../website/render.js";
import {
  renderHead,
  renderSitemap,
  languages,
} from "../../website/metadata.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const files = [
  ["website/styles.css", "styles.css"],
  ["website/main.js", "main.js"],
  ["website/routes.js", "routes.js"],
  ["website/content.js", "content.js"],
  ["website/videos.js", "videos.js"],
  ["website/cards.html", "cards.html"],
  ["website/cards.css", "cards.css"],
  ["website/cards.js", "cards.js"],
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

export async function buildHomepage({
  outputDirectory = path.join(repositoryRoot, "dist/homepage"),
} = {}) {
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

  await cp(
    path.join(repositoryRoot, "website/media"),
    path.join(outputDirectory, "media"),
    { recursive: true },
  );
  await cp(
    path.join(repositoryRoot, "website/exports"),
    path.join(outputDirectory, "exports"),
    { recursive: true },
  );
  const template = await readFile(
    path.join(repositoryRoot, "website/index.html"),
    "utf8",
  );
  for (const language of languages) {
    const assetPrefix = language === "en" ? "./" : "../";
    const directory =
      language === "en" ? outputDirectory : path.join(outputDirectory, "zh-CN");
    await mkdir(directory, { recursive: true });
    const replacements = {
      language,
      assetPrefix,
      head: renderHead(language, assetPrefix),
      body: renderHomepage(language, { assetPrefix }),
    };
    const html = template.replace(
      /\{\{(language|assetPrefix|head|body)\}\}/g,
      (_, key) => replacements[key],
    );
    await writeFile(path.join(directory, "index.html"), html);
  }
  await writeFile(path.join(outputDirectory, "sitemap.xml"), renderSitemap());
  return outputDirectory;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildHomepage();
  console.log("Built homepage at dist/homepage");
}
