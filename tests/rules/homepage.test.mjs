import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import { buildHomepage } from "../../scripts/homepage/build.mjs";
import { copy } from "../../website/content.js";
import {
  languageFromPath,
  languageURL,
  legacyLanguageURL,
} from "../../website/routes.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = "https://huggon1.github.io/postrove/";
let outputDirectory;
let preview;
let port;

function nodes(root, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(root);
  return result;
}

function attribute(node, name) {
  return node.attrs?.find((entry) => entry.name === name)?.value;
}

function text(node) {
  if (node.nodeName === "#text") return node.value;
  if (["script", "style"].includes(node.tagName)) return "";
  return (node.childNodes ?? [])
    .map(text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function elements(document, tagName) {
  return nodes(document, (node) => node.tagName === tagName);
}

function link(document, rel, language) {
  return elements(document, "link").find(
    (node) =>
      attribute(node, "rel") === rel &&
      (language === undefined || attribute(node, "hreflang") === language),
  );
}

async function page(relativePath) {
  return parse(
    await readFile(path.join(outputDirectory, relativePath), "utf8"),
  );
}

function http(pathname, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path: pathname, method },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  outputDirectory = await mkdtemp(path.join(os.tmpdir(), "postrove-homepage-"));
  await buildHomepage({ outputDirectory });
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  port = probe.address().port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  preview = spawn(
    process.execPath,
    [
      "scripts/homepage/serve.mjs",
      "--dir",
      outputDirectory,
      "--port",
      String(port),
    ],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise((resolve, reject) => {
    let logs = "";
    const timeout = setTimeout(
      () => reject(new Error(`Homepage preview startup timed out: ${logs}`)),
      10_000,
    );
    preview.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    preview.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    preview.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Homepage preview exited ${code}: ${logs}`));
    });
    preview.stdout.on("data", (chunk) => {
      logs += chunk;
      if (logs.includes("Homepage preview:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (preview && preview.exitCode === null) {
    preview.kill();
    await once(preview, "exit");
  }
  if (outputDirectory)
    await rm(outputDirectory, { recursive: true, force: true });
});

test("each generated language page contains the existing product content before scripts run", async () => {
  for (const [language, relativePath] of [
    ["en", "index.html"],
    ["zh-CN", "zh-CN/index.html"],
  ]) {
    const document = await page(relativePath);
    const app = nodes(document, (node) => attribute(node, "id") === "app")[0];
    assert.ok(app, `${language}: application container`);
    assert.equal(attribute(elements(document, "html")[0], "lang"), language);
    assert.equal(elements(app, "main").length, 1);
    assert.equal(elements(app, "h1").length, 1);
    const body = text(app);
    assert.ok(
      body.includes(copy[language].intro),
      `${language}: product introduction`,
    );
    for (const scene of copy[language].scenes.filter(
      (scene) => scene.id !== "cover",
    )) {
      assert.ok(
        body.includes(scene.description),
        `${language}: ${scene.id} content`,
      );
    }
    const languageControl = nodes(
      app,
      (node) => attribute(node, "id") === "language-toggle",
    )[0];
    assert.equal(
      languageControl?.tagName,
      "a",
      `${language}: native language navigation`,
    );
    const otherLanguage = language === "en" ? "zh-CN" : "en";
    const expected = new URL(
      otherLanguage === "en" ? "./" : "zh-CN/",
      publicRoot,
    );
    assert.equal(
      new URL(
        attribute(languageControl, "href"),
        new URL(relativePath, publicRoot),
      ).href,
      expected.href,
    );
  }
});

test("initial heads describe their own language URL and its reciprocal alternate", async () => {
  for (const [language, relativePath] of [
    ["en", "index.html"],
    ["zh-CN", "zh-CN/index.html"],
  ]) {
    const document = await page(relativePath);
    const expectedURL = new URL(language === "en" ? "./" : "zh-CN/", publicRoot)
      .href;
    assert.equal(text(elements(document, "title")[0]), copy[language].title);
    const description = elements(document, "meta").find(
      (node) => attribute(node, "name") === "description",
    );
    assert.equal(attribute(description, "content"), copy[language].description);
    assert.equal(attribute(link(document, "canonical"), "href"), expectedURL);
    assert.equal(
      elements(document, "link").filter(
        (node) => attribute(node, "rel") === "canonical",
      ).length,
      1,
    );
    for (const alternate of ["en", "zh-CN", "x-default"]) {
      const target = new URL(
        alternate === "zh-CN" ? "zh-CN/" : "./",
        publicRoot,
      ).href;
      assert.equal(
        attribute(link(document, "alternate", alternate), "href"),
        target,
      );
    }
    const ogURL = elements(document, "meta").find(
      (node) => attribute(node, "property") === "og:url",
    );
    assert.equal(attribute(ogURL, "content"), expectedURL);
    const ogImage = elements(document, "meta").find(
      (node) => attribute(node, "property") === "og:image",
    );
    assert.ok(
      attribute(ogImage, "content").endsWith(`/reading-${language}.png`),
    );
    const structured = elements(document, "script").filter(
      (node) => attribute(node, "type") === "application/ld+json",
    );
    assert.ok(structured.length > 0, `${language}: structured data`);
    const graph = structured.flatMap((node) => {
      const value = JSON.parse(
        (node.childNodes ?? []).map((child) => child.value ?? "").join(""),
      );
      return value["@graph"] ?? [value];
    });
    const application = graph.find(
      (entry) => entry["@type"] === "SoftwareApplication",
    );
    assert.equal(application?.name, "Postrove");
    assert.equal(application.url, expectedURL);
    assert.equal(application.description, copy[language].description);
    assert.equal(
      application.downloadUrl,
      "https://github.com/huggon1/postrove/releases/latest",
    );
    assert.equal(application.aggregateRating, undefined);
    assert.equal(application.review, undefined);
    assert.equal(application.offers, undefined);
    assert.ok(
      graph.some(
        (entry) => entry["@type"] === "WebSite" && entry.url === publicRoot,
      ),
    );
  }
});

test("setup answers expose requirements and distinguish local storage from model processing", async () => {
  for (const [language, relativePath] of [
    ["en", "index.html"],
    ["zh-CN", "zh-CN/index.html"],
  ]) {
    const document = await page(relativePath);
    const section = nodes(
      document,
      (node) => attribute(node, "id") === "getting-started",
    )[0];
    assert.ok(section, `${language}: setup section`);
    const answers = elements(section, "details");
    assert.equal(answers.length, 3);
    for (const answer of answers) assert.equal(attribute(answer, "open"), "");
    const requirements = text(answers[0]);
    assert.ok(requirements.includes("Google Chrome"));
    assert.ok(
      requirements.includes(
        language === "en" ? "Background models" : "后台模型",
      ),
    );
    const platforms = text(answers[1]);
    for (const name of ["Grok", "Gemini", "YouTube", "Reddit"])
      assert.ok(platforms.includes(name));
    const data = text(answers[2]);
    for (const fact of language === "en"
      ? [
          "stored on your computer",
          "questions and materials",
          "configured model",
        ]
      : ["保存在本机", "问题和材料", "配置的模型"]) {
      assert.ok(data.includes(fact), `${language}: ${fact}`);
    }
  }
});

test("language routing preserves query context and anchors while resolving legacy requests", () => {
  for (const root of ["https://example.test/", publicRoot]) {
    const source = `${root}?from=readme&lang=zh-CN#download`;
    const chinese = `${root}zh-CN/?from=readme#download`;
    assert.equal(legacyLanguageURL(source), chinese);
    assert.equal(languageURL(source, "zh-CN"), chinese);
    assert.equal(languageURL(chinese, "en"), `${root}?from=readme#download`);
    assert.equal(languageFromPath(new URL(chinese).pathname), "zh-CN");
    assert.equal(
      languageFromPath(new URL(`${root}zh-CN/index.html`).pathname),
      "zh-CN",
    );
    assert.equal(
      legacyLanguageURL(`${root}zh-CN/?lang=en#download`),
      `${root}#download`,
    );
    assert.equal(legacyLanguageURL(`${root}?lang=unknown`), null);
  }
});

test("generated pages resolve local assets and links under the Pages project prefix", async () => {
  for (const relativePath of ["index.html", "zh-CN/index.html"]) {
    const document = await page(relativePath);
    for (const node of nodes(document, (node) =>
      ["a", "link", "script", "img", "source", "track", "video"].includes(
        node.tagName,
      ),
    )) {
      for (const name of ["href", "src", "poster"]) {
        const value = attribute(node, name);
        if (!value) continue;
        const url = new URL(value, new URL(relativePath, publicRoot));
        if (url.origin !== new URL(publicRoot).origin) continue;
        assert.ok(
          url.pathname.startsWith("/postrove/"),
          `${relativePath}: ${value} stays in project`,
        );
        let target = decodeURIComponent(
          url.pathname.slice("/postrove/".length),
        );
        if (!target || target.endsWith("/")) target += "index.html";
        assert.ok(
          (await stat(path.join(outputDirectory, target))).isFile(),
          `${relativePath}: ${value} exists`,
        );
        if (node.tagName === "a" && url.hash) {
          const targetPage =
            target === relativePath ? document : await page(target);
          assert.ok(
            nodes(
              targetPage,
              (entry) =>
                attribute(entry, "id") ===
                decodeURIComponent(url.hash.slice(1)),
            ).length,
            `${relativePath}: ${value} anchor exists`,
          );
        }
      }
    }
  }
});

test("sitemap lists canonical language pages while the card export page retains noindex", async () => {
  const sitemap = await readFile(
    path.join(outputDirectory, "sitemap.xml"),
    "utf8",
  );
  assert.deepEqual(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .sort(),
    [publicRoot, `${publicRoot}zh-CN/`].sort(),
  );
  const cards = await page("cards.html");
  const robots = elements(cards, "meta").find(
    (node) => attribute(node, "name") === "robots",
  );
  assert.equal(attribute(robots, "content"), "noindex");
});

test("preview serves both language pages at root and the Pages project mount", async () => {
  for (const prefix of ["", "/postrove"]) {
    for (const [language, suffix] of [
      ["en", "/"],
      ["zh-CN", "/zh-CN/"],
    ]) {
      const response = await http(`${prefix}${suffix}`);
      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /^text\/html/);
      assert.ok(response.body.includes(copy[language].intro));
    }
    const legacy = await http(`${prefix}/?lang=zh-CN`);
    assert.ok([301, 302, 307, 308].includes(legacy.status));
    assert.equal(
      new URL(legacy.headers.location, `http://127.0.0.1:${port}${prefix}/`)
        .pathname,
      `${prefix}/zh-CN/`,
    );
    const directory = await http(`${prefix}/zh-CN`);
    assert.ok([301, 302, 307, 308].includes(directory.status));
    assert.equal(
      new URL(directory.headers.location, `http://127.0.0.1:${port}${prefix}/`)
        .pathname,
      `${prefix}/zh-CN/`,
    );
  }
});

test("preview handles HEAD and errors without serving unrelated files", async () => {
  const head = await http("/zh-CN/", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.ok(Number(head.headers["content-length"]) > 0);
  assert.equal((await http("/missing-page")).status, 404);
  assert.equal((await http("/README.md")).status, 404);
  assert.equal((await http("/%2e%2e/README.md")).status, 403);
  assert.equal((await http("/%ZZ")).status, 400);
  assert.equal((await http("/assets%5cpostrove-icon.svg")).status, 400);
  const post = await http("/", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
});
