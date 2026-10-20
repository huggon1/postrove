import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PlatformBrowser } from "../../src/main/services/platform-browser";
import { BrowserAgent } from "../../src/main/services/browser-agent";
import { PlatformAccess } from "../../src/main/services/platform-access";
import {
  advisorById,
  advisorRouteFor,
  type AdvisorId,
} from "../../src/shared/advisor-contracts";
import type { SearchSection } from "../../src/shared/focus-search-contracts";
import {
  YoutubeTranscriptReader,
  youtubeRuntimeVersion,
} from "../../src/main/services/youtube-transcript";
import { mkdir, readFile, writeFile } from "node:fs/promises";

app.setPath("userData", process.env.POSTROVE_BROWSER_FIXTURE_ROOT!);
(globalThis as any).runExpandedAdvisor = async (input: {
  endpoint: string;
  advisorId: AdvisorId;
}) => {
  const advisor = advisorById(input.advisorId);
  const entry =
    advisor.platform === "youtube"
      ? "https://gemini.google.com/app"
      : "https://www.reddit.com/answers/";
  const source =
    advisor.platform === "youtube"
      ? "https://www.youtube.com/watch?v=abcdefghijk&t=12s"
      : "https://www.reddit.com/r/testing/comments/abc123/comment/def456/";
  const browser = new PlatformBrowser(
    join(app.getPath("userData"), input.advisorId),
    () => {},
    undefined,
    { headless: true },
  );
  const context = await browser.context(advisor.platform);
  await context.route("**/*", async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<main><fixture-ai></fixture-ai></main><script>const root=document.querySelector('fixture-ai').attachShadow({mode:'open'});root.innerHTML='<label>Ask AI<textarea aria-label="Ask AI"></textarea></label><button id="send">Send question</button><section id="answer" hidden><div id="body"></div></section>';root.querySelector('#send').onclick=()=>{root.querySelector('#answer').hidden=false;root.querySelector('#body').innerHTML='<p>Complete original answer from this platform.</p><a href="${source}">Observed source</a><a href="https://example.test/wrong">Wrong platform</a>'};</script>`,
    }),
  );
  const agent = new BrowserAgent(
    browser,
    join(process.cwd(), "dist/worker/jobs/browser/worker-entry.mjs"),
    join(app.getPath("userData"), "traces"),
  );
  const section: SearchSection = {
    sectionId: randomUUID(),
    advisorId: advisor.id,
    connectionId: advisor.connectionId,
    routeId: advisorRouteFor(advisor).id,
    platform: advisor.platform,
    promptLanguage: advisor.language,
    prompt: "Prepared source question",
    state: "pending",
    rawReply: "",
    candidates: [],
  };
  const progress: any[] = [];
  try {
    const result = await new PlatformAccess(agent).search(
      section,
      {
        method: "generic_api",
        modelId: "fixture",
        api: "openai-completions",
        baseUrl: input.endpoint,
        credential: "fictional",
      },
      new AbortController().signal,
      section.sectionId,
      async (event) => {
        progress.push(event);
      },
    );
    return { result, progress, entry };
  } finally {
    await browser.shutdown();
  }
};
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("about:blank");
});

(globalThis as any).collectExpandedVideo = async (input: {
  endpoint: string;
  captionsAvailable: boolean;
  runtimeAvailable: boolean;
}) => {
  const videoUrl = "https://www.youtube.com/watch?v=abcdefghijk";
  const root = app.getPath("userData"),
    attemptId = randomUUID();
  const runtime = join(root, "runtime");
  if (input.runtimeAvailable) {
    await mkdir(join(runtime, "youtube"), { recursive: true });
    await writeFile(
      join(runtime, "youtube", "runtime.json"),
      JSON.stringify(youtubeRuntimeVersion),
    );
    for (const binary of ["yt-dlp", "deno"])
      await writeFile(
        join(
          runtime,
          "youtube",
          binary + (process.platform === "win32" ? ".exe" : ""),
        ),
        "controlled reader boundary",
        { mode: 0o755 },
      );
  }
  let extractions = 0,
    browserRuns = 0;
  const reader = new YoutubeTranscriptReader(
    runtime,
    join(root, "evidence"),
    async (_executable, args, directory) => {
      extractions++;
      if (args.includes("--dump-single-json"))
        return JSON.stringify({
          id: "abcdefghijk",
          title: "Observed video",
          language: "en",
          duration: 20,
          subtitles: input.captionsAvailable
            ? {
                en: [
                  {
                    ext: "json3",
                    url: "https://www.youtube.com/api/timedtext?lang=en",
                  },
                ],
              }
            : {},
        });
      await writeFile(
        join(directory, "captions.en.json3"),
        JSON.stringify({
          events: [
            {
              tStartMs: 1000,
              dDurationMs: 3000,
              segs: [{ utf8: "Original creator caption." }],
            },
          ],
        }),
      );
      return "";
    },
  );
  const browser = new PlatformBrowser(
    join(root, "browser"),
    () => {},
    undefined,
    { headless: true },
  );
  const context = await browser.context("youtube");
  await context.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<article><h1>Observed video</h1><p>Browser transcript with original timestamped text.</p><a href="https://www.youtube.com/watch?v=abcdefghijk&t=3s">0:03</a></article>',
    }),
  );
  const agent = new BrowserAgent(
    browser,
    join(process.cwd(), "dist/worker/jobs/browser/worker-entry.mjs"),
    join(root, "traces"),
    undefined,
    undefined,
    undefined,
    reader,
  );
  const run = agent.run.bind(agent);
  agent.run = async (...args) => {
    browserRuns++;
    return run(...args);
  };
  try {
    const materials = await new PlatformAccess(agent).collect(
      randomUUID(),
      videoUrl,
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
    return {
      materials,
      extractions,
      browserRuns,
      readerAttempt: input.runtimeAvailable
        ? JSON.parse(
            await readFile(
              join(
                root,
                "evidence",
                attemptId,
                "youtube",
                "abcdefghijk",
                "reader-attempt.json",
              ),
              "utf8",
            ),
          )
        : undefined,
    };
  } finally {
    await browser.shutdown();
  }
};
