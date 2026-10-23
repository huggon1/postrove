import { test, expect, _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readPiLogSessionDetails } from "../../src/main/services/tasks/pi-log-document";

test("shared content service uses isolated Pi calls, bounded concurrency, cancellation and task traces", async ({}, info) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "postrove-content-e2e-"));
  let active = 0,
    peak = 0,
    held = false;
  const calls: any[] = [];
  const messageText = (body: any) =>
    typeof body === "string"
      ? body
      : body.map((part: any) => part.text ?? "").join("");
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const input = JSON.parse(raw);
    calls.push({
      tools: input.tools ?? [],
      messages: input.messages.map((item: any) => ({
        role: item.role,
        content: item.content,
      })),
    });
    active++;
    peak = Math.max(peak, active);
    res.on("close", () => {
      active--;
    });
    if (JSON.stringify(input.messages).includes("Hold this content")) {
      held = true;
      return;
    }
    const body = input.messages.at(-1).content;
    let content = messageText(body);
    if (
      JSON.stringify(input.messages[0]).includes("Translate a search question")
    )
      content = JSON.stringify({
        sourceLanguage: "en",
        question: "A model rewrite that the same-language path discards.",
      });
    else if (JSON.stringify(input.messages[0]).includes("JSON sourceMarkdown"))
      content = JSON.parse(content).sourceMarkdown.replace("Read", "阅读");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [delta, reason] of [
      [{ role: "assistant", content }, null],
      [{}, "stop"],
    ])
      res.write(
        `data: ${JSON.stringify({ id: "content", object: "chat.completion.chunk", model: "fixture", created: 1, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`,
      );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1`;
  const app = await electron.launch({
    args: [resolve("dist/main/content-test.cjs")],
    env: { ...process.env, POSTROVE_CONTENT_FIXTURE_ROOT: root },
  });
  try {
    await app.firstWindow();
    const text = "Read [source](https://example.org/post). Keep `exact_id`.";
    const inputs = Array.from({ length: 4 }, () => ({
      id: randomUUID(),
      endpoint,
      request: { operation: "translate_content", text, targetLanguage: "en" },
    }));
    const results = await app.evaluate(
      async (_electron, inputs) =>
        Promise.all(
          inputs.map((input) => (globalThis as any).contentFixture(input)),
        ),
      inputs,
    );
    await info.attach("content-results", {
      body: JSON.stringify({ results, calls }),
      contentType: "application/json",
    });
    expect(results.every((result) => result.value === text)).toBe(true);
    expect(Math.max(...results.map((result) => result.released))).toBe(4);
    // Worker startup varies by OS. Admission concurrency is measured at the
    // service lease boundary; HTTP requests may overlap less than their workers.
    expect(Math.max(...results.map((result) => result.peakLeases))).toBe(2);
    expect(peak).toBeLessThanOrEqual(2);
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.tools.length === 0)).toBe(true);
    const id = randomUUID();
    const stopped = app.evaluate(
      async (_electron, input) => (globalThis as any).contentFixture(input),
      {
        id,
        endpoint,
        request: {
          operation: "format_content",
          text: "Hold this content",
          targetLanguage: "en",
        },
      },
    );
    await expect.poll(() => held).toBe(true);
    await app.evaluate(
      (_electron, id) => (globalThis as any).cancelContentFixture(id),
      id,
    );
    const stoppedResult = await stopped;
    expect(stoppedResult.error).toBeTruthy();
    expect(stoppedResult.released).toBe(5);
    const question =
      "Find 2 Godot 4 tutorials.\n\nCompare their intended audiences.";
    const questionId = randomUUID();
    const translated = await app.evaluate(
      async (_electron, input) => (globalThis as any).contentFixture(input),
      {
        id: questionId,
        endpoint,
        request: {
          operation: "translate_question",
          text: question,
          targetLanguage: "en",
        },
      },
    );
    expect(translated.value).toBe(question);
    expect(translated.released).toBe(6);
    const questionCalls = calls.filter((call) =>
      JSON.stringify(call.messages[0]).includes("Translate a search question"),
    );
    expect(questionCalls).toHaveLength(1);
    const readingId = randomUUID();
    const reading = await app.evaluate(
      async (_electron, input) => (globalThis as any).contentFixture(input),
      {
        id: readingId,
        endpoint,
        request: {
          operation: "prepare_reading",
          text,
          targetLanguage: "zh-CN",
        },
      },
    );
    expect(reading.value).toBe(text.replace("Read", "阅读"));
    expect(reading.released).toBe(7);
    const readingCalls = calls.filter((call) =>
      JSON.stringify(call.messages[0]).includes("JSON sourceMarkdown"),
    );
    expect(readingCalls).toHaveLength(1);
    expect(readingCalls[0].tools).toEqual([]);
    expect(
      JSON.parse(messageText(readingCalls[0].messages.at(-1).content))
        .sourceMarkdown,
    ).toBe(text);
    const files = await readdir(join(root, "traces"), { recursive: true });
    for (const input of [...inputs, { id: questionId }, { id: readingId }])
      expect(
        files.some((file) => file.includes(input.id) && file.endsWith(".html")),
      ).toBe(true);
    const readingFile = files.find(
      (file) => file.includes(readingId) && file.endsWith("session.html"),
    )!;
    const readingDetails = readPiLogSessionDetails(
      await readFile(join(root, "traces", readingFile), "utf8"),
      readingId,
    );
    expect(readingDetails.stage).toBe("prepare_reading");
    expect(readingDetails.targetLanguage).toBe("zh-CN");
    await info.attach("content-service-boundary", {
      body: JSON.stringify({
        isolatedCalls: calls.length,
        peakLeaseConcurrency: Math.max(
          ...results.map((result) => result.peakLeases),
        ),
        peakRequestConcurrency: peak,
        releasedLeases: 7,
        taskTraceIds: [
          ...inputs.map((input) => input.id),
          questionId,
          readingId,
        ],
      }),
      contentType: "application/json",
    });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
