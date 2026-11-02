import {
  test,
  expect,
  chromium,
  _electron as electron,
} from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readXhsVideoContext } from "../../src/main/services/xiaohongshu-video-context";

test("XHS video context uses the task document, preserves guest cookies and separates access challenges", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const id = "abcdef1234567890abcdef12";
  const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=fictional-browser-access`;
  let mode: "note" | "login" | "verify" | "wrong-note" = "note";
  await context.addCookies([
    {
      name: "a1",
      value: "fictional-guest",
      domain: ".xiaohongshu.com",
      path: "/",
      secure: true,
    },
  ]);
  await context.route("https://www.xiaohongshu.com/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body:
        mode === "note" || mode === "wrong-note"
          ? `<!doctype html><article>Fictional video note</article><script>window.__INITIAL_STATE__=${JSON.stringify({ note: { noteDetailMap: { [id]: { note: { noteId: mode === "wrong-note" ? "b".repeat(24) : id, title: "Video fixture", desc: "Written page content", user: { nickname: "Fixture" }, imageList: [{ urlDefault: "https://example.test/cover.jpg" }] } } } } })}</script>`
          : `<!doctype html><main>${mode === "login" ? "请先登录" : "安全验证"}</main>`,
    }),
  );
  const page = await context.newPage();
  try {
    await page.goto(url);
    const note = await readXhsVideoContext(
      page,
      url,
      new AbortController().signal,
    );
    expect(note.fallback?.id).toBe(id);
    expect(note.fallback?.description).toBe("Written page content");
    expect(note.fallback?.images).toHaveLength(1);
    expect(note.cookies?.map((cookie) => cookie.name)).toEqual(["a1"]);
    expect(note.accessIssue).toBeUndefined();
    for (const state of ["login", "verify"] as const) {
      mode = state;
      await page.reload();
      const result = await readXhsVideoContext(
        page,
        url,
        new AbortController().signal,
      );
      expect(result.fallback).toBeUndefined();
      expect(result.accessIssue).toBe(
        state === "login" ? "login_required" : "verification_required",
      );
    }
    mode = "wrong-note";
    await page.reload();
    expect(
      (await readXhsVideoContext(page, url, new AbortController().signal))
        .fallback,
    ).toBeUndefined();
    await expect(
      readXhsVideoContext(
        page,
        url.replace(id, "b".repeat(24)),
        new AbortController().signal,
      ),
    ).rejects.toThrow("identity_changed");
    await expect(
      readXhsVideoContext(page, url, AbortSignal.abort()),
    ).rejects.toThrow("Cancelled");
  } finally {
    await context.close();
    await browser.close();
  }
});

for (const scenario of [
  {
    short: true,
    mediaFailure: false,
    speechFailure: false,
    referenceFailure: false,
    label: "short-link speech identity",
  },
  {
    short: false,
    mediaFailure: true,
    speechFailure: false,
    referenceFailure: false,
    label: "page content after media failure",
  },
  {
    short: false,
    mediaFailure: false,
    speechFailure: true,
    referenceFailure: false,
    label: "partial speech and its own diagnostic",
  },
  {
    short: false,
    mediaFailure: false,
    speechFailure: false,
    referenceFailure: true,
    label: "another video's diagnostic at its requested address",
  },
]) {
  test(`XHS video Agent retains ${scenario.label}`, async ({}, info) => {
    const root = await mkdtemp(join(tmpdir(), "postrove-xhs-agent-"));
    const full =
      "https://www.xiaohongshu.com/explore/abcdef1234567890abcdef12?xsec_token=fictional-browser-access";
    const intake = scenario.short ? "https://xhslink.com/o/fictional" : full;
    let calls = 0;
    let unobservedRejected = false;
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
            return { error: String(message.content) };
          }
        });
      let name = "browser",
        args: any,
        output: any;
      const capture = results.find((value: any) => value.captureId);
      if (!results.length) {
        name = "load_platform_skill";
        args = { name: "xiaohongshu-reading" };
      } else if (results.length === 1) {
        name = "read_video_transcript";
        args = { url: full };
      } else if (results.length === 2) {
        unobservedRejected = !!results.at(-1).error;
        args = { action: "navigate", value: intake };
      } else if (
        scenario.short &&
        !results.some((value: any) => value.url === full)
      ) {
        args = { action: "wait", value: "0.25" };
      } else if (
        scenario.referenceFailure &&
        !results.some((value: any) => value.reason === "need_login_subtitle")
      ) {
        name = "read_video_transcript";
        args = { url: "https://www.bilibili.com/video/BV1234567890?p=2&t=31" };
      } else if (!capture) {
        name = "read_video_transcript";
        args = { url: full };
      } else
        output = {
          materials: [
            {
              role: "main",
              url: intake,
              title: "Video note fixture",
              sourceIdentity: "Fixture",
              sourceCaptureIds: [capture.captureId],
              completeness: "partial",
              completenessNote:
                "Captured page and speech coverage from the video tool.",
            },
          ],
        };
      if (++calls > 12) {
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
                id: `xhs-${calls}`,
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
          `data: ${JSON.stringify({ id: `xhs-${calls}`, object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`,
        );
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1`;
    const app = await electron.launch({
      args: [resolve("build/test-workers/xiaohongshu-app.mjs")],
      env: { ...process.env, POSTROVE_BROWSER_FIXTURE_ROOT: root },
    });
    try {
      const result = await app.evaluate(
        async (_electron, input) => (globalThis as any).collectXhsVideo(input),
        { endpoint, ...scenario },
      );
      expect(unobservedRejected).toBe(true);
      expect(result.extractions).toBe(1);
      expect(result.materials).toHaveLength(1);
      const material = result.materials[0];
      expect(material.url).toBe(intake);
      expect(material.source.sourceUrl).toBe(intake);
      if (scenario.short) expect(material.source.resolvedSourceUrl).toBe(full);
      expect(material.source.platform).toBe("xiaohongshu");
      expect(material.source.markdown).toContain("Written page description");
      expect(material.source.images).toHaveLength(1);
      if (scenario.mediaFailure)
        expect(material.source.evidence).toBeUndefined();
      else {
        expect(material.source.evidence.provenance.source).toBe(
          "application_asr",
        );
        expect(material.source.evidence.visualCoverage).toBe("unknown");
        expect(material.source.markdown).toContain(
          "Recognized spoken fixture content.",
        );
        expect(material.source.evidence.segments[0].url).toBe(full);
      }
      if (scenario.mediaFailure || scenario.speechFailure) {
        expect(result.diagnostics[full].stage).toBe(
          scenario.mediaFailure ? "access" : "transcription",
        );
        expect(result.diagnostics[full].evidence.failureCode).toBe(
          scenario.mediaFailure
            ? "access_parameters_invalid"
            : "process_failed",
        );
        expect(material.diagnostic).toEqual(result.diagnostics[full]);
      } else expect(material.diagnostic).toBeUndefined();
      if (scenario.referenceFailure) {
        expect(result.diagnostics[result.reference].code).toBe(
          "login_required",
        );
        expect(result.diagnostics[result.reference].stage).toBe("captions");
        expect(result.diagnostics[full]).toBeUndefined();
      }
      await info.attach("controlled-xhs-reading.json", {
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
