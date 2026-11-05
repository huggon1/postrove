import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PlatformBrowser } from "../../src/main/services/platform-browser";
import { BrowserAgent } from "../../src/main/services/browser-agent";
import { PlatformAccess } from "../../src/main/services/platform-access";
import { VideoTranscriptReaders } from "../../src/main/services/video-transcript";
import {
  XiaohongshuMediaReader,
  XhsMediaError,
} from "../../src/main/services/xiaohongshu-media";
import { XiaohongshuVideoReader } from "../../src/main/services/xiaohongshu-video";
import { youtubeRuntimeVersion } from "../../src/main/services/youtube-transcript";

app.setPath("userData", process.env.POSTROVE_BROWSER_FIXTURE_ROOT!);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("about:blank");
});
(globalThis as any).collectXhsVideo = async (input: {
  endpoint: string;
  short: boolean;
  mediaFailure: boolean;
  speechFailure?: boolean;
  referenceFailure?: boolean;
}) => {
  const root = app.getPath("userData"),
    id = "abcdef1234567890abcdef12",
    attemptId = randomUUID();
  const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=fictional-browser-access`;
  const intake = input.short ? "https://xhslink.com/o/fictional" : url;
  const reference = "https://www.bilibili.com/video/BV1234567890?p=2&t=31";
  const runtime = join(root, "runtime"),
    runtimeDirectory = join(runtime, "youtube");
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(
    join(runtimeDirectory, "runtime.json"),
    JSON.stringify(youtubeRuntimeVersion),
  );
  await writeFile(
    join(
      runtimeDirectory,
      `yt-dlp${process.platform === "win32" ? ".exe" : ""}`,
    ),
    "controlled process boundary",
    { mode: 0o700 },
  );
  const browser = new PlatformBrowser(
    join(root, "browser"),
    () => {},
    undefined,
    { headless: true },
  );
  const context = await browser.context("xiaohongshu");
  await context.addCookies([
    {
      name: "a1",
      value: "fictional-guest",
      domain: ".xiaohongshu.com",
      path: "/",
      secure: true,
    },
  ]);
  await context.route("**/*", (route) =>
    route.request().url().startsWith("https://xhslink.com/")
      ? route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<script>location.replace(${JSON.stringify(url)})</script>`,
        })
      : route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<article><h1>Video note fixture</h1><p>Written page description</p>${input.referenceFailure ? `<a href="${reference}">Reference video</a>` : ""}</article><script>window.__INITIAL_STATE__=${JSON.stringify({ note: { noteDetailMap: { [id]: { note: { noteId: id, type: "video", title: "Video note fixture", desc: "Written page description", user: { nickname: "Fixture" }, imageList: [{ urlDefault: "https://example.test/cover.jpg" }] } } } } })}</script>`,
        }),
  );
  let extractions = 0;
  const reader = new XiaohongshuVideoReader(join(root, "evidence"), {
    media: new XiaohongshuMediaReader(runtime, async () => {
      extractions++;
      if (input.mediaFailure)
        throw new XhsMediaError("access_parameters_invalid");
      return JSON.stringify({
        id,
        title: "Video note fixture",
        description: "Written page description",
        uploader: "Fixture",
        thumbnails: [{ url: "https://example.test/cover.jpg" }],
        formats: [
          {
            url: "https://sns-video-bd.xhscdn.com/fictional.mp4",
            acodec: "aac",
          },
        ],
      });
    }),
    acquire: async () => ({ path: join(root, "fictional.mp4") }),
    speech: {
      transcribe: async () => ({
        status: input.speechFailure ? "partial" : "completed",
        ...(input.speechFailure
          ? { issue: { code: "process_failed" as const } }
          : {}),
        provenance: "application_asr",
        backend: "whisper.cpp",
        runtimeVersion: "fixture",
        model: "fixture",
        modelSha256: "a".repeat(64),
        language: "zh",
        duration: 12,
        chunks: [],
        segments: [
          {
            id: "speech-0-0",
            start: 1,
            end: 3,
            text: "Recognized spoken fixture content.",
          },
        ],
      }),
    },
  });
  const agent = new BrowserAgent(
    browser,
    join(process.cwd(), "dist/worker/jobs/browser/worker-entry.mjs"),
    join(root, "traces"),
    undefined,
    undefined,
    undefined,
    new VideoTranscriptReaders({
      xiaohongshu: reader,
      ...(input.referenceFailure
        ? {
            bilibili: {
              available: async () => true,
              read: async () => ({
                outcome: "unavailable" as const,
                reason: "need_login_subtitle",
              }),
            },
          }
        : {}),
    }),
  );
  const diagnostics: Record<string, unknown> = {};
  const run = agent.run.bind(agent);
  agent.run = async (...args) => {
    const result = await run(...args);
    Object.assign(diagnostics, Object.fromEntries(result.sourceDiagnostics));
    return result;
  };
  try {
    const materials = await new PlatformAccess(agent).collect(
      randomUUID(),
      intake,
      {
        method: "generic_api",
        modelId: "fixture",
        api: "openai-completions",
        baseUrl: input.endpoint,
        credential: "fictional",
      },
      new AbortController().signal,
      false,
      undefined,
      undefined,
      attemptId,
    );
    return { materials, extractions, intake, url, reference, diagnostics };
  } finally {
    await browser.shutdown();
  }
};
