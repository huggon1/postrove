import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Authored fictional stores are opened by the real current Electron application.
// This helper owns a fresh review profile and aborts renderer HTTP requests.
const folder = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(folder, "../..");
const output = path.join(folder, "demo-assets");
const runtime = path.join(output, ".runtime");
const stamp = "2026-10-20T09:20:00.000Z";
const viewport = { width: 1100, height: 760 };
const videoUrl = "https://www.youtube.com/watch?v=DEMO1234abc";
const imageUrl = "https://postrove-demo.example/pixel-game.png";
const imageId = createHash("sha256").update(imageUrl).digest("hex");

async function findModules() {
  const common = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: repo, encoding: "utf8" },
  ).trim();
  const candidates = [
    process.env.POSTROVE_CAPTURE_NODE_MODULES,
    path.join(repo, "node_modules"),
    path.join(path.dirname(common), "node_modules"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "electron"));
      await access(path.join(candidate, "esbuild"));
      return candidate;
    } catch {}
  }
  throw new Error(
    "Install application dependencies, or set POSTROVE_CAPTURE_NODE_MODULES to an existing application node_modules directory.",
  );
}
const modules = await findModules();
const require = createRequire(path.join(path.dirname(modules), "package.json"));
const { build } = require("esbuild");
const { _electron: electron, expect } = require("@playwright/test");
const sharp = require("sharp");
await mkdir(output, { recursive: true });
await mkdir(path.join(runtime, "dist/renderer"), { recursive: true });
await mkdir(path.join(runtime, "dist/assets"), { recursive: true });
await writeFile(path.join(output, ".gitignore"), ".runtime/\n");
try {
  await symlink(modules, path.join(runtime, "node_modules"), "dir");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const identity = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  dirty: true,
  version: JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"))
    .version,
  platform: process.platform + "-" + process.arch,
  builtAt: stamp,
};
await writeFile(
  path.join(runtime, "package.json"),
  JSON.stringify({
    name: "postrove-promo-demo",
    version: identity.version,
    main: "dist/main/main.cjs",
    private: true,
  }),
);
const options = {
  absWorkingDir: repo,
  nodePaths: [modules],
  bundle: true,
  define: { __POSTROVE_BUILD_IDENTITY__: JSON.stringify(identity) },
  loader: { ".md": "text" },
};
await build({
  ...options,
  entryPoints: ["src/main/main.ts", "src/main/preload.ts"],
  outbase: "src",
  outdir: path.join(runtime, "dist"),
  outExtension: { ".js": ".cjs" },
  platform: "node",
  format: "cjs",
  external: [
    "electron",
    "electron-updater",
    "builder-util-runtime",
    "playwright-core",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ],
});
await build({
  ...options,
  entryPoints: ["src/renderer/main.tsx"],
  outfile: path.join(runtime, "dist/renderer/app.js"),
  platform: "browser",
  format: "esm",
  minify: true,
  loader: { ...options.loader, ".svg": "file" },
});
await build({
  ...options,
  stdin: {
    contents: `export {searchStateSchema,canonicalPost} from ${JSON.stringify(path.join(repo, "src/shared/focus-search-contracts.ts"))};export {forwardingStateSchema} from ${JSON.stringify(path.join(repo, "src/main/services/forwarding/store.ts"))};`,
    resolveDir: repo,
  },
  outfile: path.join(runtime, "contracts.mjs"),
  platform: "node",
  format: "esm",
});
const { searchStateSchema, forwardingStateSchema, canonicalPost } =
  await import(
    pathToFileURL(path.join(runtime, "contracts.mjs")).href + "?v=" + Date.now()
  );
await copyFile(
  path.join(repo, "src/renderer/index.html"),
  path.join(runtime, "dist/renderer/index.html"),
);
for (const name of ["postrove-icon.svg", "postrove-mark.svg"])
  await copyFile(
    path.join(repo, "assets", name),
    path.join(runtime, "dist/assets", name),
  );
await sharp(path.join(repo, "assets/postrove-icon.svg"))
  .resize(1024)
  .png()
  .toFile(path.join(runtime, "dist/assets/postrove.png"));

const game = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="430" viewBox="0 0 1200 430">
<rect width="1200" height="430" rx="24" fill="#15213B"/>
<g opacity=".18" stroke="#9BAED2">${Array.from({ length: 30 }, (_, i) => `<path d="M${i * 40} 0v430"/>`).join("")}${Array.from({ length: 11 }, (_, i) => `<path d="M0 ${i * 40}h1200"/>`).join("")}</g>
<g fill="#AFEDC8"><path d="M0 370h340v60H0zM430 310h230v35H430zM750 245h220v35H750zM1040 180h160v35h-160z"/></g>
<g fill="#668978"><path d="M0 392h340v38H0zM430 332h230v13H430zM750 267h220v13H750zM1040 202h160v13h-160z"/></g>
<g fill="#E7FF96"><path d="M500 201h12v-12h12v12h12v12h-12v12h-12v-12h-12zM815 136h12v-12h12v12h12v12h-12v12h-12v-12h-12z"/></g>
<path d="M260 280q75-145 200-30" stroke="#8C9BF5" stroke-width="5" stroke-dasharray="10 12" fill="none"/>
<g shape-rendering="crispEdges"><path d="M195 264h60v12h12v60h-12v12h-12v22h-18v-22h-18v22h-18v-34h-12v-48h18z" fill="#AFA0FF"/><path d="M195 288h60v24h-60z" fill="#DBD4FF"/><path d="M208 288h7v12h-7zM238 288h7v12h-7z" fill="#17213B"/><path d="M195 264h60v12h-60z" fill="#D0C7FF"/></g>
<g font-family="Arial,sans-serif" fill="#C5D0E8"><text x="48" y="58" font-size="17" letter-spacing="3">PIXEL LAB / FICTIONAL DEMO</text><text x="820" y="385" font-size="18">MOVE → JUMP → COLLIDE</text></g>
<rect x="65" y="300" width="50" height="42" rx="8" fill="#FFFFFF14"/><path d="M100 321H80m0 0 7-7m-7 7 7 7" stroke="#D8E0F4" stroke-width="3" fill="none"/>
</svg>`;
await writeFile(path.join(output, "game.svg"), game);
await sharp(Buffer.from(game)).png().toFile(path.join(output, "game.png"));

const copy = {
  "zh-CN": {
    question: "我想用 AI 做一个像素小游戏，应该从哪里开始？",
    title: "用 AI 做第一个像素小游戏",
    summary:
      "先做一个角色、一块平台和一次跳跃。跟着示例教程，逐步理解移动、跳跃和碰撞，再让 AI 帮你拆解下一步。",
    body: `![像素角色与平台：虚构教程示意图](${imageUrl})\n\n## 先让一个角色动起来\n\n[00:00 · 创建角色与场景](${videoUrl}&t=0s)　 [02:14 · 移动与跳跃](${videoUrl}&t=134s)　 [05:32 · 平台碰撞](${videoUrl}&t=332s)\n\n从一个小场景开始：左右移动、按空格跳跃、落回平台。每完成一步，就运行一次并观察结果。\n\n\`\`\`text\n角色：左右移动 → 空格跳跃\n场景：一块平台 → 检查落地碰撞\n\`\`\`\n\n**给 AI 的下一问：**“请把角色跳跃拆成三个小步骤，并解释每一步。”\n\n*虚构演示材料与占位来源，用于展示阅读流程。*`,
    replies: {
      x: "### 先做最小的可玩循环\n\n从一个角色、一块平台开始。先实现左右移动，再加跳跃和落地碰撞。每完成一步，就让 AI 解释代码。\n\n*虚构演示回复 · 示例来源*",
      xiaohongshu:
        "### 先画一个简单的小世界\n\n用 16×16 的角色和两种颜色搭出场景。先完成一个能走、能跳的小房间，再逐步丰富画面。\n\n*虚构演示回复 · 示例来源*",
      youtube:
        "### 跟着一个短教程，逐步动手\n\n先看角色如何移动，再理解跳跃与平台碰撞。把教程拆成三个小练习，遇到问题时让 AI 帮你解释。\n\n*虚构演示回复 · 示例来源*",
      reddit:
        "### 把第一作的范围收小\n\n只做一个房间和一个目标。先写下“能移动、能跳、能落地”，让 AI 帮你逐项调试。\n\n*虚构演示回复 · 示例来源*",
    },
    sources: {
      x: "一个角色，也能开始做游戏",
      xiaohongshu: "16×16 像素角色入门",
      youtube: "用 AI 做第一个像素小游戏",
      reddit: "第一款小游戏，先完成一个房间",
    },
    demo: "虚构演示来源 · 占位链接",
    nav: "阅读",
    open: "打开话题",
    close: "关闭",
    original: "原文",
    reading: "阅读版本",
  },
  en: {
    question: "I want to make a pixel game with AI. Where do I start?",
    title: "Your first pixel game with AI",
    summary:
      "Start with one character, one platform, and one jump. Follow a sample tutorial through movement, jumping, and collisions, then ask AI to explain the next step.",
    body: `![Pixel character and platforms: fictional tutorial artwork](${imageUrl})\n\n## Make one character move\n\n[00:00 · Set up the scene](${videoUrl}&t=0s)　 [02:14 · Move and jump](${videoUrl}&t=134s)　 [05:32 · Platform collisions](${videoUrl}&t=332s)\n\nBegin with a tiny scene: move left and right, press space to jump, and land on a platform. Run each small change and observe what happens.\n\n\`\`\`text\nCharacter: move left/right → press space to jump\nScene: one platform → check landing collisions\n\`\`\`\n\n**Ask AI next:** “Break a character jump into three small steps and explain each one.”\n\n*Fictional demo material and placeholder sources illustrate the reading workflow.*`,
    replies: {
      x: "### Build the smallest playable loop\n\nStart with one character and one platform. Add movement, then jumping and landing collisions. Ask AI to explain each small change.\n\n*Fictional demo reply · Sample sources*",
      xiaohongshu:
        "### Sketch one tiny world\n\nTry a 16×16 character and a two-color scene. Finish a single room where you can walk and jump, then develop the visual details.\n\n*Fictional demo reply · Sample sources*",
      youtube:
        "### Follow one short tutorial, step by step\n\nSee how movement works, then explore jumping and platform collisions. Treat each part as a small exercise and ask AI to explain what you observe.\n\n*Fictional demo reply · Sample sources*",
      reddit:
        "### Keep the first game small\n\nMake one room with one goal. Write down “move, jump, land,” then use AI to help debug each part.\n\n*Fictional demo reply · Sample sources*",
    },
    sources: {
      x: "One character is enough to begin",
      xiaohongshu: "A first 16×16 pixel character",
      youtube: "Your first pixel game with AI",
      reddit: "For your first game, finish one room",
    },
    demo: "Fictional demo source · Placeholder link",
    nav: "Reading",
    open: "Open topic",
    close: "Close",
    original: "Original",
    reading: "Reading version",
  },
};
const routes = [
  {
    platform: "youtube",
    advisorId: "youtube-gemini-en",
    connectionId: "gemini-web",
    routeId: "youtube-gemini",
    promptLanguage: "en",
    url: videoUrl,
  },
  {
    platform: "x",
    advisorId: "x-grok-en",
    connectionId: "x-grok",
    routeId: "x-grok",
    promptLanguage: "en",
    url: "https://x.com/postrove_demo/status/9999999999999999999",
  },
  {
    platform: "xiaohongshu",
    advisorId: "xiaohongshu-diandian-zh",
    connectionId: "xiaohongshu-diandian",
    routeId: "xiaohongshu-diandian",
    promptLanguage: "zh-CN",
    url: "https://www.xiaohongshu.com/explore/postrove_pixel_demo",
  },
  {
    platform: "reddit",
    advisorId: "reddit-ai-en",
    connectionId: "reddit-web",
    routeId: "reddit-ai",
    promptLanguage: "en",
    url: "https://www.reddit.com/r/postrove_demo/comments/demopixel/",
  },
];

async function seed(profile, language) {
  const c = copy[language];
  const original = copy.en.body;
  const material = {
    id: "pixel-demo-main",
    role: "main",
    url: videoUrl,
    title: c.title,
    source: {
      platform: "youtube",
      sourceUrl: videoUrl,
      sourceKey: "youtube:video:DEMO1234abc",
      sourceIdentity: "Pixel Lab · Fictional demo",
      title: copy.en.title,
      fetchedAt: stamp,
      markdown: original,
      contentBlocks: [{ type: "text", text: original }],
      images: [
        {
          imageId: "pixel-scene",
          url: imageUrl,
          alt: "Pixel Lab · Fictional demo",
          cachedUrl: `postrove-image://${imageId}`,
        },
      ],
      completeness: "complete",
      completenessNote: copy.en.demo,
    },
    chunks: [{ index: 0, original, translated: c.body, complete: true }],
    summary: c.summary,
    state: "completed",
  };
  const task = {
    taskId: randomUUID(),
    resultId: randomUUID(),
    materialId: randomUUID(),
    target: { entry: "app", sourceUrl: videoUrl },
    state: "completed",
    phase: "已保存",
    outputLanguage: language,
    materials: [material],
    source: material.source,
    report: {
      materials: [material],
      source: material.source,
      outputLanguage: language,
    },
    activities: [],
    createdAt: stamp,
    updatedAt: stamp,
    finishedAt: stamp,
  };
  const report = {
    reportId: randomUUID(),
    taskId: randomUUID(),
    question: c.question,
    createdAt: stamp,
    finishedAt: stamp,
    outputLanguage: language,
    origin: "manual",
    status: "completed",
    taskOutcome: "completed",
    period: "all",
    platforms: routes.map((r) => r.platform),
    submissions: [],
    sections: routes.map((route) => ({
      sectionId: randomUUID(),
      ...route,
      url: undefined,
      runId: randomUUID(),
      prompt: copy[route.promptLanguage].question,
      platformPrompt: copy[route.promptLanguage].question,
      state: "completed",
      finishedAt: stamp,
      rawReply: copy[route.promptLanguage].replies[route.platform],
      readingReply: c.replies[route.platform],
      citationExtraction: { state: "completed" },
      candidates: [
        {
          candidateId: randomUUID(),
          postKey: canonicalPost(route.platform, route.url).key,
          url: route.url,
          title: c.sources[route.platform],
          description: c.demo,
        },
      ],
    })),
  };
  const search = searchStateSchema.parse({
    version: 1,
    reports: [report],
    follows: [],
  });
  const forwarding = forwardingStateSchema.parse({ version: 1, tasks: [task] });
  const files = {
    "business-generation.json": {
      generation: "search-follow-v1",
      state: "committed",
    },
    "preferences.json": { language, readingLanguage: language },
    "advisors.json": { version: 1, enabled: routes.map((r) => r.advisorId) },
    "focus-search.json": search,
    "forwarding.json": forwarding,
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(path.join(profile, name), JSON.stringify(value), {
      mode: 0o600,
    });
  await mkdir(path.join(profile, "material-images"), { recursive: true });
  await copyFile(
    path.join(output, "game.png"),
    path.join(profile, "material-images", imageId),
  );
  await writeFile(
    path.join(profile, "material-images", imageId + ".type"),
    "image/png",
  );
  await writeFile(
    path.join(output, `fixture-${language}.json`),
    JSON.stringify(
      {
        scope: "Authored fictional demo. Placeholder URLs are never fetched.",
        ...files,
      },
      null,
      2,
    ),
  );
  return { report, task };
}

const captures = [],
  errors = [],
  httpRequests = [];
for (const language of ["zh-CN", "en"]) {
  const profile = await mkdtemp(path.join(tmpdir(), "postrove-pixel-promo-"));
  let app;
  try {
    await seed(profile, language);
    const env = {};
    for (const key of [
      "PATH",
      "TMPDIR",
      "TEMP",
      "TMP",
      "SystemRoot",
      "WINDIR",
      "DISPLAY",
      "LANG",
    ])
      if (process.env[key]) env[key] = process.env[key];
    app = await electron.launch({
      executablePath: require("electron"),
      args: [runtime],
      env: {
        ...env,
        TZ: "Asia/Shanghai",
        POSTROVE_TEST_DATA: profile,
        POSTROVE_RUN_MODE: "review",
        POSTROVE_EVAL_DENY_KEYCHAIN: "1",
      },
    });
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/^https?:/, async (route) => {
      httpRequests.push(route.request().url());
      await route.abort();
    });
    await app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
    });
    await page.waitForURL(/index\.html/, { timeout: 30000 });
    await page
      .getByRole("navigation")
      .waitFor({ state: "visible", timeout: 30000 });
    await page.setViewportSize(viewport);
    const display = await app.context().newCDPSession(page);
    await display.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", language, {
      timeout: 20000,
    });
    assert.equal(
      await app.evaluate(({ app }) => app.getPath("userData")),
      profile,
    );
    await page.evaluate(() => document.fonts.ready);
    const c = copy[language];
    async function screenshot(scene) {
      await page.mouse.move(viewport.width - 10, viewport.height - 10);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (a) => a.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((a) => a.finished.catch(() => {})),
        );
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
      });
      const visibleHanAudit =
        language === "en"
          ? await page.evaluate(() => {
              const allowed = [],
                forbidden = [],
                identityExceptions = [],
                whitelist = ["小红书", "点点"];
              const nodes = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
              );
              while (nodes.nextNode()) {
                const node = nodes.currentNode,
                  text = node.textContent.trim();
                if (!/\p{Script=Han}/u.test(text)) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const visible = [...range.getClientRects()].some((rect) => {
                  let left = Math.max(0, rect.left),
                    top = Math.max(0, rect.top);
                  let right = Math.min(innerWidth, rect.right),
                    bottom = Math.min(innerHeight, rect.bottom);
                  for (
                    let parent = node.parentElement;
                    parent;
                    parent = parent.parentElement
                  ) {
                    const style = getComputedStyle(parent);
                    if (
                      style.display === "none" ||
                      style.visibility !== "visible" ||
                      Number(style.opacity) === 0
                    )
                      return false;
                    const box = parent.getBoundingClientRect();
                    if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
                      left = Math.max(left, box.left);
                      right = Math.min(right, box.right);
                    }
                    if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
                      top = Math.max(top, box.top);
                      bottom = Math.min(bottom, box.bottom);
                    }
                  }
                  return right > left && bottom > top;
                });
                if (!visible) continue;
                if (
                  (text === "点" || text === "中") &&
                  node.parentElement.closest(".avatar.diandian")
                ) {
                  allowed.push(text);
                  identityExceptions.push({
                    text,
                    selector:
                      text === "中"
                        ? ".avatar.diandian .avatar-language"
                        : ".avatar.diandian",
                    meaning:
                      text === "中"
                        ? "Chinese-speaking expert language badge"
                        : "Diandian avatar",
                  });
                  continue;
                }
                const remaining = whitelist.reduce(
                  (value, name) => value.replaceAll(name, ""),
                  text,
                );
                (/\p{Script=Han}/u.test(remaining) ? forbidden : allowed).push(
                  text,
                );
              }
              return {
                allowed: [...new Set(allowed)],
                identityExceptions: identityExceptions.filter(
                  (value, index, list) =>
                    list.findIndex((item) => item.text === value.text) ===
                    index,
                ),
                forbidden: [...new Set(forbidden)],
              };
            })
          : null;
      if (visibleHanAudit)
        assert.deepEqual(
          visibleHanAudit.forbidden,
          [],
          `Unexpected visible Chinese in ${scene}`,
        );
      const file = `${scene}-${language}.png`;
      const pixels = await display.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, ...viewport, scale: 2 },
      });
      await writeFile(
        path.join(output, file),
        Buffer.from(pixels.data, "base64"),
      );
      const bounds = await page.evaluate(() => ({
        devicePixelRatio,
        overflow: document.documentElement.scrollWidth - innerWidth,
        modal: [...document.querySelectorAll("dialog,.modal")].map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
        elements: [
          ...document.querySelectorAll(
            ".reader-article h1,.reader-toolbar,.reader-introduction,.reader-article .markdown,.reader-article .markdown img,.full-reply,.source-tile",
          ),
        ].map((e) => {
          const r = e.getBoundingClientRect();
          return {
            className: e.className,
            tag: e.tagName,
            text: e.textContent.slice(0, 80),
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
          };
        }),
      }));
      assert.ok(bounds.overflow <= 0);
      const dimensions = await sharp(path.join(output, file)).metadata();
      assert.equal(dimensions.width, 2200);
      assert.equal(dimensions.height, 1520);
      captures.push({
        language,
        scene,
        file,
        width: dimensions.width,
        height: dimensions.height,
        sha256: createHash("sha256")
          .update(await readFile(path.join(output, file)))
          .digest("hex"),
        visibleHanAudit,
        ...bounds,
      });
      console.log("Captured", file);
    }
    await expect(page.locator(".topic-card")).toHaveCount(1);
    await expect(page.locator(".avatar-stack .avatar")).toHaveCount(4);
    await screenshot("topics");
    await page.getByRole("button", { name: c.open, exact: false }).click();
    await expect(page.locator(".full-reply")).toHaveCount(4);
    await expect(
      page.locator(".thread-question h1, .thread-question h2"),
    ).toHaveText(c.question);
    await screenshot("topic");
    await page.locator(".full-reply").first().scrollIntoViewIfNeeded();
    await screenshot("topic-source");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: c.close, exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: c.nav, exact: true })
      .click();
    await page.locator(".reading-card-title").click();
    const reader = page.getByRole("dialog");
    await expect(reader.locator("h1")).toHaveText(c.title);
    await expect(reader.locator(".markdown img")).toBeVisible();
    await expect
      .poll(() =>
        reader
          .locator(".markdown img")
          .evaluate((img) => img.complete && img.naturalWidth === 1200),
      )
      .toBe(true);
    await screenshot("reading");
    await reader.getByRole("button", { name: c.original, exact: true }).click();
    await expect(reader.locator(".markdown")).toContainText(
      "Make one character move",
    );
    await screenshot("reading-original");
    await reader.getByRole("button", { name: c.reading, exact: true }).click();
    await reader.locator(".markdown pre").scrollIntoViewIfNeeded();
    await screenshot("reading-code");
    const files = await readdir(profile);
    for (const file of [
      "telegram-bot-token.json",
      "feishu-credentials.json",
      "model-connection.json",
      "platform-browser",
    ])
      assert.ok(!files.includes(file), "Unexpected integration " + file);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
assert.deepEqual(errors, []);
assert.deepEqual(httpRequests, []);
await writeFile(
  path.join(output, "evidence.json"),
  JSON.stringify(
    {
      scope:
        "Real current Electron UI, preload, IPC and schema-validated fictional stores. Completed authored replies and reading examples; no platform request. Fresh review profiles removed after capture.",
      build: identity,
      originalUrl: videoUrl,
      viewport,
      checks: {
        schemaValidation: true,
        profileReadBack: true,
        rendererErrors: errors,
        rendererHttpRequests: httpRequests,
        cachedArtworkLoaded: true,
        allFourIndependentMembers: true,
        realOriginalTabSwitch: true,
        sourceLanguage: "en",
        englishVisibleHanChecked: true,
      },
      captures,
    },
    null,
    2,
  ),
);
console.log("Verified fictional demo captures:", path.relative(repo, output));
