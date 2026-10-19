// Failure cases: personal profiles or credentials enter the capture; saved data
// fails current schemas; a follow starts live work; a language is incomplete;
// a cached image fails; content overflows; a screenshot misses its main controls.
// Evidence: real Electron UI, schema-validated fictional stores, six screenshots,
// and tmp/readme-capture/evidence.json. Platform replies are authored examples.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect } from "@playwright/test";
import sharp from "sharp";
import { searchStateSchema } from "../../src/shared/focus-search-contracts";
import { forwardingStateSchema } from "../../src/main/services/forwarding/store";
import type { ReadingMaterial } from "../../src/shared/reading-contracts";

const output = resolve("assets/screenshots");
const evidence = resolve("tmp/readme-capture");
const timestamp = "2026-10-19T01:30:00.000Z";
const imageUrl = "https://trail-notes.example/daypack.png";
const imageId = createHash("sha256").update(imageUrl).digest("hex");
const viewport = { width: 1440, height: 960 };
function nextWeeklyRun(weekday: number, time: string) {
  const offset = 8 * 3600_000;
  const next = new Date(Date.now() + offset);
  const [hour, minute] = time.split(":").map(Number);
  next.setUTCHours(hour, minute, 0, 0);
  next.setUTCDate(next.getUTCDate() + ((weekday - next.getUTCDay() + 7) % 7));
  if (next.getTime() - offset <= Date.now() + 60_000)
    next.setUTCDate(next.getUTCDate() + 7);
  return new Date(next.getTime() - offset).toISOString();
}
const copy = {
  en: {
    search: "Search results",
    parsed: "Parsed content",
    focus: "Focus",
    question: "What should I pack for a weekend day hike?",
    reports: [
      "A lighter pack for weekend trails",
      "Small details that make a day outdoors better",
    ],
    titles: [
      "A lighter pack for weekend trails",
      "A simple daypack checklist",
      "How to organize a small backpack",
    ],
    summary:
      "A practical way to organize a daypack: group items by use, keep everyday essentials within reach, and lay everything out before packing.",
    heading: "A little planning, a lighter pack",
    intro:
      "Start with the route, the forecast, and the things you use most. This sample guide groups a weekend kit into three easy-to-find sets.",
    body: "## Give everything a place\n\n- **On the move:** water bottle, trail notes, and a small snack.\n- **At a break:** a light layer, a sit pad, and your camera.\n- **Back at home:** unpack, dry, and reset for the next outing.\n\n## Pack once, refine each weekend\n\nKeep a short checklist. After each trip, mark the items you used and adjust your layout for the next route.",
    reference:
      "Group small items in separate pouches. Keep your checklist with the bag so the next trip starts with a quick review.",
    replyX:
      "Two useful starting points for a weekend kit:\n\n- **Start with a checklist.** Group your kit by when you use it.\n- **Keep the layout simple.** Put frequently used items within reach.\n\nThese sample posts explore a small, well-organized daypack.",
    replyXhs:
      "Look at complete packing layouts, then adapt them to your route and habits. A checklist and a few small pouches make a useful starting point.",
    candidates: [
      "A simple daypack checklist",
      "How to organize a small backpack",
      "Weekend hiking: a flat-lay packing guide",
    ],
    follows: [
      [
        "Weekend trail kit",
        "Find practical daypack checklists and lightweight packing ideas.",
      ],
      [
        "Small outdoor habits",
        "Find ideas for organizing gear before and after a day hike.",
      ],
      ["Trail photography", "Find compact camera setups for weekend walks."],
    ],
    art: [
      "WEEKEND, PACKED LIGHT",
      "A place for every little thing",
      "ON THE MOVE",
      "AT A BREAK",
      "READY TO GO",
    ],
  },
  "zh-CN": {
    search: "搜索结果",
    parsed: "解析结果",
    focus: "关注",
    question: "周末单日徒步，背包里该带些什么？",
    reports: ["周末徒步，轻装出发", "让户外一天更从容的小细节"],
    titles: [
      "周末徒步，轻装出发",
      "一份简单的单日徒步清单",
      "小背包的分区收纳方法",
    ],
    summary:
      "把单日徒步装备按使用场景分组，常用物品放在顺手的位置。出发前平铺检查，让每件东西都有自己的位置。",
    heading: "多一点准备，少一点负担",
    intro:
      "从路线、天气和使用习惯出发。这份示例指南把周末装备分成三组，让出发前的检查更轻松。",
    body: "## 给每件东西留个位置\n\n- **行进时**：水瓶、路线笔记和一小份零食。\n- **休息时**：轻薄外套、坐垫和相机。\n- **回家后**：取出装备、晾干整理，为下次出发做好准备。\n\n## 每次出发，调整一点\n\n保留一份简短清单。每次回来标记实际用过的物品，再根据下次的路线调整收纳位置。",
    reference:
      "用几个小收纳袋区分零散物品，把清单和背包放在一起。下次出发前，按清单快速检查。",
    replyX:
      "可以从这几个方面整理周末徒步装备：\n\n- **先列清单**：按使用场景给物品分组。\n- **收纳顺手**：常用物品放在容易拿取的位置。\n\n下面的示例帖子展示了单日背包清单和分区收纳方法。",
    replyXhs:
      "先参考完整的装备平铺图，再根据路线和个人习惯调整。一份清单、几个收纳袋，就能让准备过程更清楚。",
    candidates: [
      "一份简单的单日徒步清单",
      "小背包的分区收纳方法",
      "周末徒步：出发前的装备平铺图",
    ],
    follows: [
      ["周末轻装徒步", "寻找实用的单日徒步清单和轻量收纳方法。"],
      ["户外整理小习惯", "寻找单日徒步出发前、回家后的装备整理方法。"],
      ["沿途摄影灵感", "寻找适合周末散步的轻便相机搭配。"],
    ],
    art: [
      "周末，轻装出发",
      "让每件小物，都有自己的位置",
      "行进时",
      "休息时",
      "准备出发",
    ],
  },
};

async function illustration(labels: string[]) {
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="350" viewBox="0 0 1200 350">
    <rect width="1200" height="350" rx="22" fill="#edf2ea"/>
    <circle cx="1070" cy="64" r="35" fill="#ead6a5"/>
    <path d="M700 350L910 100l160 195 85-90 45 58v87" fill="#c9d8c4"/>
    <path d="M850 350l145-152 130 152" fill="#afc5ac"/>
    <g font-family="Arial, PingFang SC, sans-serif" fill="#263f36">
      <text x="54" y="62" font-size="16" letter-spacing="3">TRAIL NOTES / 01</text>
      <text x="54" y="113" font-size="36" font-weight="bold">${labels[0]}</text>
      <text x="54" y="150" font-size="19" fill="#63766a">${labels[1]}</text>
      <rect x="54" y="208" width="148" height="42" rx="21" fill="#fff"/>
      <text x="128" y="235" text-anchor="middle" font-size="14">${labels[2]}</text>
      <rect x="215" y="208" width="148" height="42" rx="21" fill="#fff"/>
      <text x="289" y="235" text-anchor="middle" font-size="14">${labels[3]}</text>
      <text x="54" y="303" font-size="13" letter-spacing="2">${labels[4]} ↗</text>
    </g>
    <g stroke="#36564b" stroke-width="5" stroke-linejoin="round">
      <path d="M738 141v-22q0-31 32-31t32 31v22" fill="none"/>
      <rect x="701" y="130" width="140" height="168" rx="38" fill="#6d9280"/>
      <path d="M717 166h108v37H717z" fill="#a8c0aa"/>
      <rect x="723" y="223" width="96" height="56" rx="15" fill="#d1b887"/>
      <path d="M731 169v20m80-20v20"/>
      <rect x="888" y="197" width="51" height="102" rx="15" fill="#d5e5ec"/>
      <rect x="898" y="178" width="31" height="23" rx="6" fill="#748e9c"/>
      <path d="M958 265l67-40 50 59-67 40z" fill="#e5bc80"/>
      <path d="M970 269l42-25m-29 40l42-25" fill="none" stroke-width="3"/>
    </g>
  </svg>`),
  )
    .png()
    .toBuffer();
}

async function seed(profile: string, language: keyof typeof copy) {
  const c = copy[language];
  const imageRoot = join(profile, "material-images");
  await mkdir(imageRoot, { recursive: true });
  await writeFile(join(imageRoot, imageId), await illustration(c.art));
  await writeFile(join(imageRoot, `${imageId}.type`), "image/png");
  const material = (
    index: number,
    role: "main" | "reference",
  ): ReadingMaterial => {
    const url = `https://trail-notes.example/guide-${index + 1}`;
    const markdown =
      index === 0
        ? `## ${c.heading}\n\n${c.intro}\n\n![${c.art[0]}](${imageUrl})\n\n${c.body}`
        : `## ${c.titles[index]}\n\n${c.reference}`;
    return {
      id: `demo-material-${index}`,
      role,
      url,
      title: c.titles[index],
      source: {
        platform: "web",
        sourceUrl: url,
        sourceIdentity: "Trail Notes · Demo",
        title: c.titles[index],
        fetchedAt: timestamp,
        markdown,
        contentBlocks: [{ type: "text", text: markdown }],
        images:
          index === 0
            ? [
                {
                  imageId: "daypack",
                  url: imageUrl,
                  alt: c.art[0],
                  cachedUrl: `postrove-image://${imageId}`,
                },
              ]
            : [],
        completeness: "complete",
        completenessNote: "",
      },
      chunks: [
        { index: 0, original: markdown, translated: markdown, complete: true },
      ],
      summary: index === 0 ? c.summary : c.reference,
      state: "completed",
    };
  };
  const readingTasks = c.titles.map((_, index) => {
    const materials =
      index === 0
        ? [material(0, "main"), material(1, "reference")]
        : [material(index, "main")];
    return {
      taskId: randomUUID(),
      resultId: randomUUID(),
      materialId: randomUUID(),
      target: { entry: "app", sourceUrl: materials[0].url },
      state: "completed",
      phase: "已保存",
      outputLanguage: language,
      materials,
      source: materials[0].source,
      report: {
        materials,
        source: materials[0].source,
        outputLanguage: language,
      },
      createdAt: new Date(
        Date.parse(timestamp) - index * 3600_000,
      ).toISOString(),
      updatedAt: timestamp,
      finishedAt: timestamp,
    };
  });
  const forwarding = forwardingStateSchema.parse({
    version: 1,
    tasks: readingTasks,
  });
  const reports = [c.question, ...c.reports].map((question, index) => ({
    reportId: randomUUID(),
    taskId: randomUUID(),
    question,
    createdAt: new Date(
      Date.parse(timestamp) - index * 86_400_000,
    ).toISOString(),
    finishedAt: timestamp,
    outputLanguage: language,
    origin: "manual",
    status: "completed",
    taskOutcome: "completed",
    period: "week",
    platforms: ["x", "xiaohongshu"],
    submissions: [],
    sections: ["x", "xiaohongshu"].map((platform) => ({
      sectionId: randomUUID(),
      platform,
      promptLanguage: platform === "x" ? "en" : "zh-CN",
      prompt: platform === "x" ? copy.en.question : copy["zh-CN"].question,
      state: "completed",
      finishedAt: timestamp,
      rawReply: platform === "x" ? c.replyX : c.replyXhs,
      citationExtraction: { state: "completed" },
      candidates: (platform === "x" ? [0, 1] : [2]).map((i) => ({
        candidateId: randomUUID(),
        postKey:
          platform === "x"
            ? `x:100000000000000000${i + 1}`
            : "xiaohongshu:postrovedemo0001",
        url:
          platform === "x"
            ? `https://x.com/postrove_demo/status/100000000000000000${i + 1}`
            : "https://www.xiaohongshu.com/explore/postrovedemo0001",
        title: c.candidates[i],
        description: "",
      })),
    })),
  }));
  const search = searchStateSchema.parse({
    version: 1,
    reports,
    follows: c.follows.map(([name, question], index) => ({
      followId: randomUUID(),
      name,
      question,
      platforms: index === 2 ? ["x"] : ["x", "xiaohongshu"],
      period: "week",
      schedule: {
        cadence: "weekly",
        weekday: [5, 0, 3][index],
        time: ["18:30", "10:00", "20:00"][index],
      },
      paused: index === 2,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      // Keep active schedules in the future on every reproduction.
      nextRunAt: nextWeeklyRun(
        [5, 0, 3][index],
        ["18:30", "10:00", "20:00"][index],
      ),
    })),
  });
  for (const [name, value] of Object.entries({
    "business-generation.json": {
      generation: "search-follow-v1",
      state: "committed",
    },
    "preferences.json": { language },
    "focus-search.json": search,
    "forwarding.json": forwarding,
  }))
    await writeFile(join(profile, name), JSON.stringify(value), {
      mode: 0o600,
    });
}

await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });
assert.doesNotMatch(await readFile("README.md", "utf8"), /\p{Script=Han}/u);
const captures: unknown[] = [];
for (const language of ["en", "zh-CN"] as const) {
  const profile = await mkdtemp(join(tmpdir(), "postrove-readme-"));
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await seed(profile, language);
    // Allow only OS process essentials; model keys and personal app flags stay out.
    const env: Record<string, string> = {};
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
      if (process.env[key]) env[key] = process.env[key]!;
    application = await electron.launch({
      args: ["."],
      env: {
        ...env,
        TZ: "Asia/Shanghai",
        POSTROVE_TEST_DATA: profile,
        POSTROVE_RUN_MODE: "review",
        POSTROVE_EVAL_DENY_KEYCHAIN: "1",
      },
    });
    const page = await application.firstWindow();
    const errors: string[] = [],
      network: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/^https?:/, async (route) => {
      network.push(route.request().url());
      await route.abort();
    });
    await page.setViewportSize(viewport);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    const actualProfile = await application.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    assert.equal(actualProfile, profile);
    const c = copy[language];
    for (const [scene, destination] of [
      ["search", c.search],
      ["reading", c.parsed],
      ["follows", c.focus],
    ] as const) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: destination, exact: true })
        .click();
      if (scene === "search") {
        await expect(page.locator(".reader-title")).toHaveText(c.question);
        await expect(page.locator(".platform-section")).toHaveCount(2);
        await expect(
          page.getByRole("button", {
            name: language === "en" ? "Add to parsing" : "加入解析",
            exact: true,
          }),
        ).toHaveCount(3);
      } else if (scene === "reading") {
        await expect(page.locator(".result-row small").first()).toContainText(
          language === "en" ? "Saved" : "已保存",
        );
        await expect(page.locator(".report-heading h2")).toHaveText(
          c.titles[0],
        );
        const image = page.locator(".markdown img");
        await expect(image).toBeVisible();
        await expect
          .poll(() =>
            image.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          )
          .toBe(true);
        await expect(page.locator(".material-index button")).toHaveCount(2);
      } else {
        await expect(page.locator(".follow-row")).toHaveCount(3);
        await expect(page.locator(".follow-row").first()).toContainText(
          language === "en" ? "Weekly Friday" : "每周 周五",
        );
        await expect(
          page.getByRole("button", {
            name: language === "en" ? "Pause" : "暂停",
            exact: true,
          }),
        ).toHaveCount(2);
      }
      await page.evaluate(() => document.fonts.ready);
      if (language === "en")
        await expect(page.locator("body")).not.toContainText(/\p{Script=Han}/u);
      await page.mouse.move(1430, 950);
      const bounds = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        mainOverflow:
          document.querySelector("main")!.scrollWidth -
          document.querySelector("main")!.clientWidth,
      }));
      assert.ok(bounds.horizontalOverflow <= 0 && bounds.mainOverflow <= 0);
      const path = join(output, `${scene}-${language}.png`);
      const buffer = await page.screenshot({
        animations: "disabled",
        scale: "css",
      });
      await sharp(buffer).png({ compressionLevel: 9 }).toFile(path);
      captures.push({
        language,
        scene,
        file: `assets/screenshots/${scene}-${language}.png`,
        viewport,
        ...bounds,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
      console.log(`Captured ${scene} (${language})`);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    const profileFiles = await readdir(profile);
    for (const name of [
      "telegram-bot-token.json",
      "feishu-credentials.json",
      "model-connection.json",
      "platform-browser",
    ])
      assert.ok(
        !profileFiles.includes(name),
        `Unexpected personal integration: ${name}`,
      );
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
}
await writeFile(
  join(evidence, "evidence.json"),
  JSON.stringify(
    {
      build: JSON.parse(await readFile("dist/build-identity.json", "utf8")),
      scope:
        "Real Electron renderer, preload, IPC and stores; authored fictional questions, replies, sources and reading content; local illustration; isolated profiles removed after capture.",
      checks: [
        "Saved-state schema validation",
        "Independent userData read-back",
        "Both interface and saved-content languages",
        "English README and screenshot text use Latin platform names",
        "Cached image loaded",
        "Scene controls and record counts",
        "Horizontal bounds",
        "Renderer errors and renderer HTTP requests absent",
        "Credential files absent",
      ],
      uiContentAdmission:
        "Existing application copy is retained. Platform labels use Xiaohongshu / Diandian in English under the user's explicit translation request. The parsed-list phase uses its existing translation when a saved record is shown; cadence and weekday use existing labels with a separating space. Authored examples populate existing saved-content fields under the user's approved screenshot plan. README captions identify all screenshots as demo data.",
      captures,
    },
    null,
    2,
  ),
);
console.log("Evidence: tmp/readme-capture/evidence.json");
