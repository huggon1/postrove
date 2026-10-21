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
const stamp = "2026-10-21T09:20:00.000Z";
const viewport = { width: 1100, height: 760 };
const articleUrl =
  "https://www.xiaohongshu.com/explore/67f0a34b000000001a012345";
const blueUrl = "https://x.com/lin_dev/status/9999999999999999999";
const imageUrl = "https://postrove-demo.example/cover-yellow.png";
const blueImageUrl = "https://postrove-demo.example/cover-blue.png";
const imageId = createHash("sha256").update(imageUrl).digest("hex");
const blueImageId = createHash("sha256").update(blueImageUrl).digest("hex");

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

function coverSvg(kind) {
  const yellow = kind === "yellow";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="430" viewBox="0 0 1200 430">
  <rect width="1200" height="430" rx="26" fill="${yellow ? "#EFCB76" : "#9DB3EF"}"/>
  <rect x="235" y="34" width="744" height="366" rx="20" fill="#26374B" opacity=".15"/>
  <rect x="225" y="24" width="744" height="366" rx="20" fill="#FFFFFF"/>
  <text x="515" y="53" font-family="Arial" font-size="13" letter-spacing="2" fill="#68778B">PIXEL GAME NOTES</text>
  <g transform="translate(245 70)" shape-rendering="crispEdges"><rect width="704" height="300" fill="#BBDADD"/>
  <rect x="535" y="30" width="44" height="44" fill="#FFF1C2"/>
  <path d="M0 230V160H80V120H150V170H245V132H330V180H440V140H540V190H620V130H704V300H0Z" fill="#8DB9A4"/>
  <path d="M0 250V220H100V185H230V220H360V200H470V230H580V190H704V300H0Z" fill="#6F9A85"/>
  <rect y="252" width="704" height="12" fill="#D2DF9F"/><rect y="264" width="704" height="36" fill="#546857"/>
  <rect x="315" y="198" width="108" height="12" fill="#E0D5A0"/><rect x="315" y="210" width="108" height="12" fill="#6B7360"/>
  <rect x="362" y="148" width="19" height="27" fill="#F7D96E"/>
  <g transform="translate(${yellow ? 160 : 310} ${yellow ? 202 : 148})"><rect x="4" width="28" height="9" fill="#3A4660"/><rect y="9" width="36" height="20" fill="#E6BA91"/><rect x="26" y="14" width="5" height="5" fill="#263144"/><rect x="4" y="29" width="28" height="16" fill="#5679BB"/><rect y="45" width="13" height="8" fill="#33415A"/><rect x="23" y="45" width="13" height="8" fill="#33415A"/></g>
  <rect x="633" y="170" width="7" height="82" fill="#E5EDD3"/><rect x="640" y="170" width="42" height="28" fill="#D88770"/>
  </g></svg>`;
}
for (const kind of ["yellow", "blue"]) {
  const svg = coverSvg(kind);
  await writeFile(path.join(output, `cover-${kind}.svg`), svg);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(output, `cover-${kind}.png`));
}

const copy = {
  "zh-CN": {
    question: "我想用 AI 做个像素游戏。找一些开发记录、教程和踩坑经验。",
    title: "我用 AI 做了一个像素小游戏",
    blueTitle: "先把角色移动和跳跃做出来",
    summary:
      "先做一个场景，让角色能移动、跳跃和收集金币。每加一个动作就运行一次，再调整速度和碰撞。",
    blueSummary:
      "记录角色移动、落地检测和跳跃的实现过程。先测试手感，再补地图和美术。",
    replies: {
      x: "### 先做一个能玩的场景\n\n这篇开发记录从角色移动和跳跃开始，再加金币。每次只加一个动作，运行后再让 Agent 修改。",
      xiaohongshu:
        "### 看一遍从零开始的过程\n\n这篇笔记记录了用 AI 做像素小游戏的过程。建议先用简单方块测试移动和碰撞，再换成像素素材。",
      youtube:
        "### 跟着移动和碰撞教程试\n\n找到一段演示角色移动、跳跃和落地检测的视频。可以先完成这几个动作，再设计关卡。",
      reddit:
        "### 先测试手感，再加功能\n\n讨论里建议先做一个很小的原型。让角色移动起来，测试跳跃距离和落地，再补其他功能。",
    },
    sources: {
      x: "先把角色移动和跳跃做出来",
      xiaohongshu: "我用 AI 做了一个像素小游戏",
      youtube: "像素游戏：移动、跳跃和碰撞",
      reddit: "第一个像素游戏，该从哪开始？",
    },
    sourceDescription: "开发记录、操作教程和实际经验",
    nav: "阅读",
    open: "打开话题",
    close: "关闭",
    original: "原文",
    reading: "阅读版本",
    body: `![像素游戏开发记录](${imageUrl})

## 先做一个能玩的场景

我的目标是先让角色移动、跳跃，再收集一枚金币。地图只保留一块地面和一个平台，方便检查动作。

## 每加一个动作就运行一次

先用方块测试碰撞。确认角色能落地，再换上像素素材。把跳跃距离和速度分开调整。

\`\`\`text
第一步：移动与落地检测
第二步：跳跃与平台碰撞
第三步：金币与计数
\`\`\`

## 把问题说给 Agent

记录角色在哪个位置卡住，以及预期的动作。每次修改后都运行一次，再决定下一个任务。

[回到原始文章](${articleUrl})`,
    blueBody: `![角色移动和跳跃的开发记录](${blueImageUrl})

## 从移动和跳跃开始

先做一个只有地面的小场景。让角色左右移动，检测是否落地，再加入跳跃。

## 在小场景里测试手感

调整速度和跳跃高度，确认角色落地后能继续移动。最后加入一枚金币和一个计数器。

\`\`\`text
移动：方向输入 → 水平速度
跳跃：落地状态 → 向上速度
金币：碰撞检测 → 数量加一
\`\`\``,
  },
  en: {
    question:
      "I want to make a pixel game with AI. Find devlogs, tutorials, and practical lessons.",
    title: "My first pixel game with AI",
    blueTitle: "Start with movement and jumping",
    summary:
      "Build one scene with movement, jumping, and coins. Run it after each change, then tune speed and collisions.",
    blueSummary:
      "Notes on movement, ground checks, and jumping. Test the controls before adding a map and art.",
    replies: {
      x: "### Start with one playable scene\n\nThis devlog starts with movement and jumping, then adds a coin. Add one action at a time, run it, and ask your agent to adjust it.",
      xiaohongshu:
        "### Follow the first build\n\nThese notes follow a first pixel game built with AI. Test movement and collisions with simple blocks, then add pixel art.",
      youtube:
        "### Follow a movement tutorial\n\nThis video demonstrates movement, jumping, and ground checks. Try these actions before designing a level.",
      reddit:
        "### Test the controls before adding features\n\nThe discussion recommends a small prototype. Test movement, jump distance, and landing before adding more features.",
    },
    sources: {
      x: "Start with movement and jumping",
      xiaohongshu: "My first pixel game with AI",
      youtube: "Pixel game movement, jumping, and collisions",
      reddit: "Where should a first pixel game start?",
    },
    sourceDescription: "Devlogs, tutorials, and practical lessons",
    nav: "Reading",
    open: "Open topic",
    close: "Close",
    original: "Original",
    reading: "Reading version",
    body: `![Pixel game development notes](${imageUrl})

## Start with one playable scene

I want the character to move, jump, and collect one coin. Keep one floor and one platform so each action is easy to test.

## Run the game after each change

Test collisions with simple blocks first. Add pixel art after landing works. Adjust jump distance and movement speed separately.

\`\`\`text
Step 1: movement and ground checks
Step 2: jumping and platform collisions
Step 3: coins and a counter
\`\`\`

## Give the agent a concrete problem

Record where the character gets stuck and what should happen. Run the game after every change, then choose the next task.

[Open the original article](${articleUrl})`,
    blueBody: `![Movement and jumping notes](${blueImageUrl})

## Start with movement and jumping

Build a small scene with a floor. Move the character left and right, check the ground, then add jumping.

## Test the controls in a small scene

Adjust movement speed and jump height. Check that the character can move after landing. Finally, add one coin and a counter.

\`\`\`text
Move: direction input → horizontal speed
Jump: grounded state → upward speed
Coin: collision check → count plus one
\`\`\``,
  },
};
const routes = [
  {
    platform: "x",
    advisorId: "x-grok-en",
    connectionId: "x-grok",
    routeId: "x-grok",
    promptLanguage: "en",
    url: blueUrl,
  },
  {
    platform: "xiaohongshu",
    advisorId: "xiaohongshu-diandian-zh",
    connectionId: "xiaohongshu-diandian",
    routeId: "xiaohongshu-diandian",
    promptLanguage: "zh-CN",
    url: articleUrl,
  },
  {
    platform: "youtube",
    advisorId: "youtube-gemini-en",
    connectionId: "gemini-web",
    routeId: "youtube-gemini",
    promptLanguage: "en",
    url: "https://www.youtube.com/watch?v=DEMO1234abc",
  },
  {
    platform: "reddit",
    advisorId: "reddit-ai-en",
    connectionId: "reddit-web",
    routeId: "reddit-ai",
    promptLanguage: "en",
    url: "https://www.reddit.com/r/postrove_demo/comments/pixelgame/",
  },
];

async function seed(profile, language) {
  const c = copy[language];
  const original = copy["zh-CN"].body;
  const material = {
    id: "interface-yellow-main",
    role: "main",
    url: articleUrl,
    title: c.title,
    source: {
      platform: "xiaohongshu",
      sourceUrl: articleUrl,
      sourceIdentity:
        language === "zh-CN" ? "林同学的开发笔记" : "Lin’s game notes",
      title: c.title,
      fetchedAt: stamp,
      markdown: original,
      contentBlocks: [{ type: "text", text: original }],
      images: [
        {
          imageId: "interface-yellow",
          url: imageUrl,
          alt: "Pixel game notes",
          cachedUrl: `postrove-image://${imageId}`,
        },
      ],
      completeness: "complete",
      completenessNote: "Main article and illustration.",
    },
    chunks: [{ index: 0, original, translated: c.body, complete: true }],
    summary: c.summary,
    state: "completed",
  };
  const task = {
    taskId: randomUUID(),
    resultId: randomUUID(),
    materialId: randomUUID(),
    target: { entry: "app", sourceUrl: articleUrl },
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
          description: c.sourceDescription,
        },
      ],
    })),
  };
  const search = searchStateSchema.parse({
    version: 1,
    reports: [report],
    follows: [],
  });
  const blueMaterial = {
    ...material,
    id: "interface-blue-main",
    url: blueUrl,
    title: c.blueTitle,
    source: {
      ...material.source,
      platform: "x",
      sourceUrl: blueUrl,
      sourceIdentity: "lin.dev",
      title: c.blueTitle,
      markdown: copy.en.blueBody,
      contentBlocks: [{ type: "text", text: copy.en.blueBody }],
      images: [
        {
          imageId: "interface-blue",
          url: blueImageUrl,
          alt: "Pixel game notes",
          cachedUrl: `postrove-image://${blueImageId}`,
        },
      ],
    },
    chunks: [
      {
        index: 0,
        original: copy.en.blueBody,
        translated: c.blueBody,
        complete: true,
      },
    ],
    summary: c.blueSummary,
  };
  const blueTask = {
    ...task,
    taskId: randomUUID(),
    resultId: randomUUID(),
    materialId: randomUUID(),
    target: { entry: "app", sourceUrl: blueUrl },
    materials: [blueMaterial],
    source: blueMaterial.source,
    report: {
      materials: [blueMaterial],
      source: blueMaterial.source,
      outputLanguage: language,
    },
  };
  const forwarding = forwardingStateSchema.parse({
    version: 1,
    tasks: [task, blueTask],
  });
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
    path.join(output, "cover-yellow.png"),
    path.join(profile, "material-images", imageId),
  );
  await writeFile(
    path.join(profile, "material-images", imageId + ".type"),
    "image/png",
  );
  await copyFile(
    path.join(output, "cover-blue.png"),
    path.join(profile, "material-images", blueImageId),
  );
  await writeFile(
    path.join(profile, "material-images", blueImageId + ".type"),
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
  return { report, task, blueTask };
}

const captures = [],
  errors = [],
  httpRequests = [];
for (const language of ["zh-CN", "en"]) {
  const profile = await mkdtemp(
    path.join(tmpdir(), "postrove-interface-promo-"),
  );
  let app;
  try {
    const fixture = await seed(profile, language);
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
      // The English promotional film uses the requested public display name.
      // Application behavior, platform keys, and source addresses retain their identity.
      const displayAliases =
        language === "en"
          ? await page.evaluate(() => {
              const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
              );
              let count = 0;
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.textContent.includes("Xiaohongshu")) {
                  node.textContent = node.textContent.replaceAll(
                    "Xiaohongshu",
                    "RedNote",
                  );
                  count++;
                }
              }
              return { Xiaohongshu: "RedNote", replacements: count };
            })
          : null;
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(done)),
      );
      const visibleHanAudit =
        language === "en"
          ? await page.evaluate((allowChineseSource) => {
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
                  allowChineseSource &&
                  node.parentElement.closest(".reader-article .markdown")
                ) {
                  allowed.push(text);
                  identityExceptions.push({
                    text,
                    selector: ".reader-article .markdown",
                    meaning:
                      "Chinese original source shown in the English reader",
                  });
                  continue;
                }
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
            }, ["reading-original", "reading-focus-original"].includes(scene))
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
        displayAliases,
        ...bounds,
      });
      console.log("Captured", file);
    }
    async function alignReaderCover(reader) {
      await reader.locator(".markdown img").evaluate((img) => {
        for (
          let parent = img.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          if (
            /auto|scroll/.test(getComputedStyle(parent).overflowY) &&
            parent.scrollHeight > parent.clientHeight
          ) {
            parent.scrollTop += img.getBoundingClientRect().top - 100;
            break;
          }
        }
      });
      await expect
        .poll(() =>
          reader
            .locator(".markdown img")
            .evaluate((img) => Math.round(img.getBoundingClientRect().top)),
        )
        .toBe(100);
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
    await expect(page.locator(".reading-card-title")).toHaveText([
      c.title,
      c.blueTitle,
    ]);
    await screenshot("library");
    await page.locator(".reading-card-title").first().click();
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
      "先做一个能玩的场景",
    );
    await screenshot("reading-original");
    await alignReaderCover(reader);
    await screenshot("reading-focus-original");
    await reader.getByRole("button", { name: c.reading, exact: true }).click();
    await alignReaderCover(reader);
    await screenshot("reading-focus");
    await reader.locator(".markdown pre").scrollIntoViewIfNeeded();
    await screenshot("reading-code");
    await reader.getByRole("button", { name: c.close, exact: true }).click();
    const blueReadingId = fixture.blueTask.taskId;
    assert.ok(blueReadingId && blueReadingId !== fixture.task.taskId);
    await page
      .locator(".reading-card-title")
      .filter({ hasText: c.blueTitle })
      .click();
    const blueReader = page.getByRole("dialog");
    await expect(blueReader.locator("h1")).toHaveText(c.blueTitle);
    await expect(blueReader.locator(".markdown img")).toBeVisible();
    await expect
      .poll(() =>
        blueReader
          .locator(".markdown img")
          .evaluate((img) => img.complete && img.naturalWidth === 1200),
      )
      .toBe(true);
    await screenshot("reading-blue");
    await blueReader
      .getByRole("button", { name: c.original, exact: true })
      .click();
    await expect(blueReader.locator(".markdown")).toContainText(
      "Start with movement and jumping",
    );
    await screenshot("reading-blue-original");
    await alignReaderCover(blueReader);
    await screenshot("reading-blue-focus-original");
    await blueReader
      .getByRole("button", { name: c.reading, exact: true })
      .click();
    await alignReaderCover(blueReader);
    await screenshot("reading-blue-focus");
    await blueReader.locator(".markdown pre").scrollIntoViewIfNeeded();
    await screenshot("reading-blue-code");
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
      displayAliases: { en: { Xiaohongshu: "RedNote" } },
      build: identity,
      originalUrl: articleUrl,
      linkedSourceUrl: blueUrl,
      viewport,
      checks: {
        schemaValidation: true,
        profileReadBack: true,
        rendererErrors: errors,
        rendererHttpRequests: httpRequests,
        cachedArtworkLoaded: true,
        yellowBlueIdentityPreserved: true,
        blueSourceReaderCaptured: true,
        allFourIndependentMembers: true,
        realOriginalTabSwitch: true,
        sourceLanguage: { yellow: "zh-CN", blue: "en" },
        englishVisibleHanChecked: true,
      },
      captures,
    },
    null,
    2,
  ),
);
console.log("Verified fictional demo captures:", path.relative(repo, output));
