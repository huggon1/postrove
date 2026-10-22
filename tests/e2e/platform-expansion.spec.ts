import { launchChineseApplication } from "../support/application";
import { test, expect, _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("new members share Gemini setup, enable Reddit guest use, and retain scheduled recipients", async ({}, info) => {
  const root = await mkdtemp(join(tmpdir(), "postrove-expansion-ui-"));
  await mkdir(join(root, "platform-browser/shared"), { recursive: true });
  await writeFile(
    join(root, "advisors.json"),
    JSON.stringify({ version: 1, enabled: [] }),
  );
  // Cookie metadata is a controlled UI boundary; it contains no session values.
  await writeFile(
    join(root, "platform-browser/shared/postrove-session-status.json"),
    JSON.stringify({
      cookies: [
        {
          name: "__Secure-1PSID",
          domain: ".google.com",
          expires: Date.now() / 1000 + 3600,
        },
      ],
    }),
  );
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: root,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "管理成员", exact: true }).click();
    const members = page.getByRole("dialog", { name: "我的成员", exact: true });
    await expect(members.locator(".shared-adapter-card")).toHaveCount(4);
    const gemini = members.locator(".shared-adapter-card").filter({
      has: page.getByRole("heading", { name: "Gemini", exact: true }),
    });
    await expect(gemini.getByText("已连接", { exact: true })).toBeVisible();
    await gemini
      .getByRole("switch", { name: "Gemini · YouTube · 中文", exact: true })
      .click();
    await gemini
      .getByRole("switch", { name: "Gemini · YouTube · 英文", exact: true })
      .click();
    await gemini.getByRole("button", { name: "管理配置", exact: true }).click();
    await expect(
      members.getByRole("heading", { name: "Gemini · 配置", exact: true }),
    ).toBeVisible();
    await expect(
      members.getByRole("switch", {
        name: "Gemini · YouTube · 中文",
        exact: true,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      members.getByRole("switch", {
        name: "Gemini · YouTube · 英文",
        exact: true,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await page.screenshot({
      path: info.outputPath("gemini-shared-configuration.png"),
      animations: "disabled",
    });
    await members
      .getByRole("button", { name: "返回成员列表", exact: true })
      .click();
    const reddit = members.locator(".shared-adapter-card").filter({
      has: page.getByRole("heading", { name: "Reddit AI", exact: true }),
    });
    await expect(reddit.getByText("可使用", { exact: true })).toBeVisible();
    await reddit
      .getByRole("switch", { name: "Reddit AI · 英文", exact: true })
      .click();
    await page.screenshot({
      path: info.outputPath("new-member-catalog.png"),
      animations: "disabled",
    });
    await members.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Gemini · YouTube · 中文",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reddit AI · 英文", exact: true }),
    ).toBeVisible();
    for (const member of [
      { name: "Reddit AI · 英文 Reddit", heading: "Reddit AI · 配置" },
      { name: "Gemini · YouTube · 中文 YouTube", heading: "Gemini · 配置" },
    ]) {
      await page
        .getByRole("button", { name: member.name, exact: true })
        .click();
      await expect(
        members.getByRole("heading", { name: member.heading, exact: true }),
      ).toBeVisible();
      await members.getByRole("button", { name: "关闭", exact: true }).click();
    }
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "AI 成员", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Reddit AI Reddit 英文专家 可使用",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await page
      .getByRole("button", { name: "新建定时消息", exact: true })
      .first()
      .click();
    const editor = page.getByRole("dialog", {
      name: "新建定时消息",
      exact: true,
    });
    await editor
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("Video and community research");
    await editor
      .getByRole("textbox", { name: "消息内容", exact: true })
      .fill("Which discussions are useful?");
    await editor
      .getByRole("button", { name: "保存定时消息", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const state = JSON.parse(
      await readFile(join(root, "focus-search.json"), "utf8"),
    );
    expect(state.follows[0].advisorIds).toEqual([
      "youtube-gemini-zh",
      "youtube-gemini-en",
      "reddit-ai-en",
    ]);
    expect(state.follows[0].platforms).toEqual(["youtube", "reddit"]);
    await page.screenshot({
      path: info.outputPath("scheduled-new-experts.png"),
      animations: "disabled",
    });
    const enabled = JSON.parse(
      await readFile(join(root, "advisors.json"), "utf8"),
    ).enabled;
    expect(enabled).toHaveLength(3);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

for (const advisorId of ["youtube-gemini-en", "reddit-ai-en"] as const) {
  test(`${advisorId} loads its Skill, operates shadow controls and validates original citations`, async ({}, info) => {
    const root = await mkdtemp(join(tmpdir(), "postrove-expansion-agent-"));
    const source = advisorId.startsWith("youtube")
      ? "http://www.youtube.com/watch?v=abcdefghijk&t=12s"
      : "https://www.reddit.com/r/testing/comments/abc123/comment/def456/";
    const skill = advisorId.startsWith("youtube")
      ? "gemini-youtube-search"
      : "reddit-search";
    const entry = advisorId.startsWith("youtube")
      ? "https://gemini.google.com/app"
      : "https://www.reddit.com/answers/";
    let calls = 0;
    let triedPartial = false;
    let partialRejected = false;
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const part of req) raw += part;
      const input = JSON.parse(raw);
      const messages = input.messages.filter(
        (message: any) => message.role === "tool",
      );
      const results = messages.map((message: any) => {
        try {
          return JSON.parse(message.content);
        } catch {
          return {};
        }
      });
      const latest = results.at(-1);
      const snapshot = results
        .toReversed()
        .find((result: any) => result.elements);
      const capture = results
        .toReversed()
        .find((result: any) => result.captureId);
      const stage = input.messages.some((message: any) =>
        JSON.stringify(message.content).includes("CITATION EXTRACTION —"),
      );
      let name = "browser",
        args: any,
        output: any;
      const find = (predicate: (node: any) => boolean) =>
        snapshot?.elements.find(predicate)?.ref;
      if (stage) {
        if (latest?.captureKind !== "search_sources") {
          name = "capture_search_sources";
          args = { savedReplyCaptureId: capture.captureId };
        } else
          output = {
            citationState: "completed",
            sourceCaptureIds: [latest.captureId],
            candidates: [
              {
                url: source.replace(/^http:/, "https:"),
                title: "Observed source",
                description: "Original source",
                sourceCaptureId: latest.captureId,
              },
              {
                url: source,
                title: "Observed source",
                description: "Same observed identity",
                sourceCaptureId: latest.captureId,
              },
              {
                url: "https://example.test/wrong",
                title: "Wrong platform",
                description: "",
                sourceCaptureId: latest.captureId,
              },
            ],
          };
      } else if (!results.some((result: any) => result.skill === skill)) {
        name = "load_platform_skill";
        args = { name: skill };
      } else if (!snapshot) {
        args = { action: "navigate", value: entry };
      } else if (
        !input.messages.some((message: any) =>
          message.tool_calls?.some((call: any) =>
            call.function?.arguments?.includes('"action":"fill"'),
          ),
        )
      ) {
        args = {
          action: "fill",
          ref: find((node: any) => node.tag === "TEXTAREA"),
          value: "Prepared source question",
        };
      } else if (
        !input.messages.some((message: any) =>
          message.tool_calls?.some((call: any) =>
            call.function?.arguments?.includes('"action":"click"'),
          ),
        )
      ) {
        args = {
          action: "click",
          ref: find(
            (node: any) =>
              node.tag === "BUTTON" && node.label === "Send question",
          ),
        };
      } else if (!capture) {
        const partial = advisorId.startsWith("youtube") && !triedPartial;
        if (advisorId.startsWith("youtube") && triedPartial)
          partialRejected = input.messages.some(
            (message: any) =>
              message.role === "tool" &&
              JSON.stringify(message.content).includes("reply_scope:"),
          );
        triedPartial = true;
        args = {
          action: "capture",
          ref: find(
            (node: any) =>
              node.tag ===
                (advisorId.startsWith("youtube") && !partial
                  ? "MODEL-RESPONSE-CONTENT"
                  : "DIV") && node.label.startsWith("Complete original answer"),
          ),
        };
      }
      if (!stage && results.some((result: any) => result.captureId))
        output = {
          platformPrompt: "Prepared source question",
          replyCaptureId: capture.captureId,
        };
      if (!stage && !output && !args) args = { action: "snapshot" };
      if (++calls > 20) {
        res.writeHead(500);
        res.end("{}");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta = output
        ? { role: "assistant", content: JSON.stringify(output) }
        : {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `call-${calls}`,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          };
      for (const [value, reason] of [
        [delta, null],
        [{}, output ? "stop" : "tool_calls"],
      ])
        res.write(
          `data: ${JSON.stringify({ id: `fixture-${calls}`, object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`,
        );
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1`;
    const app = await electron.launch({
      args: [resolve("build/test-workers/platform-expansion-app.mjs")],
      env: { ...process.env, POSTROVE_BROWSER_FIXTURE_ROOT: root },
    });
    try {
      const result = await app.evaluate(
        async (_electron, input) =>
          (globalThis as any).runExpandedAdvisor(input),
        { endpoint, advisorId },
      );
      expect(result.result.rawReply).toContain("Complete original answer");
      expect(result.result.candidates).toHaveLength(1);
      expect(result.result.candidates[0].url).toBe(
        advisorId.startsWith("youtube")
          ? source.replace(/^http:/, "https:")
          : "https://www.reddit.com/r/testing/comments/abc123/_/def456/",
      );
      expect(result.result.citationExtraction.state).toBe("completed");
      if (advisorId.startsWith("youtube")) expect(partialRejected).toBe(true);
      expect(result.result.candidates[0].postKey).toBe(
        advisorId.startsWith("youtube")
          ? "youtube:video:abcdefghijk"
          : "reddit:comment:def456",
      );
      expect(result.progress.some((event: any) => event.rawReply)).toBe(true);
      await info.attach("validated-source.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
    } finally {
      await app.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const scenario of [
  {
    captionsAvailable: true,
    runtimeAvailable: true,
    name: "combines the caption tool and page capture in one Agent",
  },
  {
    captionsAvailable: false,
    runtimeAvailable: true,
    name: "uses browser capture after the caption tool fails",
  },
  {
    captionsAvailable: false,
    runtimeAvailable: false,
    name: "uses the same Agent and Skill when the caption runtime is absent",
  },
]) {
  test(`YouTube reading ${scenario.name}`, async ({}, info) => {
    const root = await mkdtemp(join(tmpdir(), "postrove-video-reading-"));
    let calls = 0;
    const observedTools: string[] = [];
    let transcriptIds: { returned: string; evidence: string } | undefined;
    let triedPlayback = false,
      playbackRejected = false;
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const part of req) raw += part;
      const input = JSON.parse(raw);
      const results = input.messages
        .filter((message: any) => message.role === "tool")
        .map((message: any) => {
          try {
            return JSON.parse(message.content);
          } catch {
            return {};
          }
        });
      const snapshot = results
        .toReversed()
        .find((result: any) => result.elements);
      const caption = results.find(
        (result: any) => result.evidence?.kind === "transcript",
      );
      if (caption)
        transcriptIds = {
          returned: caption.captureId,
          evidence: caption.evidence.captureId,
        };
      const pageCapture = results.find(
        (result: any) => result.captureId && !result.evidence,
      );
      let name = "browser",
        args: any,
        output: any;
      if (!results.some((result: any) => result.skill === "youtube-reading")) {
        name = "load_platform_skill";
        args = { name: "youtube-reading" };
      } else if (!snapshot)
        args = {
          action: "navigate",
          value: "https://www.youtube.com/watch?v=abcdefghijk",
        };
      else if (
        input.tools.some(
          (tool: any) => tool.function.name === "read_youtube_transcript",
        ) &&
        !caption &&
        !results.some((result: any) => result.outcome === "unavailable")
      ) {
        name = "read_youtube_transcript";
        args = { url: "https://www.youtube.com/watch?v=abcdefghijk" };
      } else if (!pageCapture) {
        const playback = !triedPlayback;
        if (triedPlayback)
          playbackRejected = input.messages.some(
            (message: any) =>
              message.role === "tool" &&
              JSON.stringify(message.content).includes("source_scope:"),
          );
        triedPlayback = true;
        args = {
          action: "capture",
          ref: snapshot.elements.find(
            (element: any) =>
              element.tag === (playback ? "DIV" : "ARTICLE") &&
              (!playback ||
                element.label.startsWith("Sponsored advertisement")),
          )?.ref,
        };
      } else
        output = {
          materials: [
            {
              role: "main",
              url: "https://www.youtube.com/watch?v=abcdefghijk",
              title: "Observed video",
              sourceIdentity: "Observed creator",
              sourceCaptureIds: [
                caption?.captureId,
                pageCapture.captureId,
              ].filter(Boolean),
              completeness: "partial",
              completenessNote:
                "Observed video material; visual coverage is unknown",
            },
          ],
        };
      if (++calls > 12) {
        res.writeHead(500);
        res.end("{}");
        return;
      }
      if (!output) observedTools.push(name);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta = output
        ? { role: "assistant", content: JSON.stringify(output) }
        : {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `call-${calls}`,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          };
      for (const [value, reason] of [
        [delta, null],
        [{}, output ? "stop" : "tool_calls"],
      ])
        res.write(
          `data: ${JSON.stringify({ id: `reading-${calls}`, object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`,
        );
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1`;
    const app = await electron.launch({
      args: [resolve("build/test-workers/platform-expansion-app.mjs")],
      env: { ...process.env, POSTROVE_BROWSER_FIXTURE_ROOT: root },
    });
    try {
      const result = await app.evaluate(
        async (_electron, input) =>
          (globalThis as any).collectExpandedVideo(input),
        { endpoint, ...scenario },
      );
      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].source.sourceKey).toBe(
        "youtube:video:abcdefghijk",
      );
      expect(result.materials[0].source.sourceIdentity).toBe(
        "Observed creator",
      );
      expect(result.browserRuns).toBe(1);
      expect(playbackRejected).toBe(true);
      expect(result.materials[0].source.markdown).not.toContain(
        "Sponsored advertisement",
      );
      expect(observedTools[0]).toBe("load_platform_skill");
      expect(result.materials[0].source.markdown).toContain(
        "Browser transcript with original timestamped text.",
      );
      expect(result.extractions).toBe(
        scenario.runtimeAvailable ? (scenario.captionsAvailable ? 2 : 1) : 0,
      );
      if (scenario.runtimeAvailable) {
        expect(observedTools).toContain("read_youtube_transcript");
        expect(result.readerAttempt.state).toBe(
          scenario.captionsAvailable ? "completed" : "unavailable",
        );
      } else {
        expect(observedTools).not.toContain("read_youtube_transcript");
        expect(result.readerAttempt).toBeUndefined();
      }
      if (scenario.captionsAvailable) {
        expect(transcriptIds?.returned).toBe(transcriptIds?.evidence);
        expect(transcriptIds?.returned).toBeTruthy();
        expect(result.materials[0].source.markdown).toContain(
          "Original creator caption.",
        );
        expect(result.materials[0].source.evidence.segments[0].url).toBe(
          "https://www.youtube.com/watch?v=abcdefghijk&t=1s",
        );
      }
      await info.attach("reading-result.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
    } finally {
      await app.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
