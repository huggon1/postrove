import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  BilibiliTranscriptReader,
  normalizeSrt,
  selectBilibiliTrack,
} from "../../src/main/services/bilibili-transcript";
import { youtubeRuntimeVersion } from "../../src/main/services/youtube-transcript";
import {
  bilibiliJsonUrl,
  bilibiliReadSession,
} from "../../src/main/services/video-session";
import {
  videoIdentity,
  videoMatchesUrl,
} from "../../src/shared/video-contracts";
import { sourceSchema } from "../../src/shared/source-contracts";

const bvid = "BV1234567890",
  url = `https://www.bilibili.com/video/${bvid}?p=2`;
const srt =
  "1\r\n00:00:01,125 --> 00:00:03,000\r\n原文第一行\r\n第二行\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,500\r\nNext caption.\r\n";
async function fixture(
  options: {
    noSubs?: boolean;
    login?: boolean;
    sessionSubs?: boolean;
    wrongIdentity?: boolean;
    mismatchCid?: boolean;
    failExtractor?: boolean;
    subtitleUrl?: string;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "postrove-bili-"));
  const runtime = join(root, "runtime", "youtube");
  await mkdir(runtime, { recursive: true });
  await writeFile(
    join(runtime, "runtime.json"),
    JSON.stringify(youtubeRuntimeVersion),
  );
  await writeFile(
    join(runtime, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
    "fixture",
    { mode: 0o700 },
  );
  const calls: string[][] = [],
    requests: string[] = [];
  const reader = new BilibiliTranscriptReader(
    join(root, "runtime"),
    join(root, "evidence"),
    async (_exec, args, _dir, signal) => {
      calls.push(args);
      if (signal.aborted) throw new Error("Cancelled");
      if (options.failExtractor)
        throw new Error("temporary signed URL must stay private");
      return JSON.stringify({
        id: options.wrongIdentity ? "BV9999999999_p2" : `${bvid}_p2`,
        subtitles:
          options.noSubs || options.sessionSubs
            ? { danmaku: [{ ext: "xml", data: "chat" }] }
            : { "ai-zh": [{ ext: "srt", data: srt }] },
        formats: [{ url: "https://private.test/signed" }],
      });
    },
  );
  const session = {
    getJson: async (address: string, signal: AbortSignal) => {
      requests.push(address);
      if (signal.aborted) throw new Error("Cancelled");
      if (address.includes("/view?"))
        return {
          code: 0,
          data: {
            bvid,
            aid: 123,
            title: "Fixture video",
            owner: { name: "Fixture creator" },
            desc: "Source description",
            pages: [
              { page: 1, cid: 456, duration: 10 },
              { page: 2, cid: 789, duration: 8 },
            ],
          },
        };
      if (address.includes("/v2?"))
        return {
          code: 0,
          data: {
            cid: options.mismatchCid ? 456 : 789,
            need_login_subtitle: options.login,
            subtitle: {
              subtitles: options.sessionSubs
                ? [
                    {
                      lan: "zh-CN",
                      subtitle_url:
                        options.subtitleUrl ??
                        "//aisubtitle.hdslb.com/bfs/subtitle/fixture.json?access=private",
                    },
                  ]
                : [],
            },
          },
        };
      return { body: [{ from: 1.125, to: 3, content: "Session subtitle" }] };
    },
  };
  return { root, reader, calls, requests, session };
}

test("Bilibili SRT keeps source order, original text, selected part and safe timestamps", () => {
  const video = videoIdentity(url)!;
  const segments = normalizeSrt(srt, video, 8);
  assert.equal(segments[0].text, "原文第一行\n第二行");
  assert.equal(segments[0].url, `${url}&t=1`);
  assert.equal(segments[1].end, 6.5);
  assert.throws(() => normalizeSrt(srt, video, 1), /invalid_caption_time/);
  assert.throws(
    () => normalizeSrt("1\n00:00:03,000 --> 00:00:01,000\nBad", video),
    /invalid_caption_time/,
  );
  assert.equal(
    selectBilibiliTrack({
      subtitles: { danmaku: [{ ext: "xml", data: "Chat" }] },
    }),
    undefined,
  );
});

test("Bilibili explicitly queries captions, validates part/CID, and retains its immutable attempt", async () => {
  const f = await fixture();
  try {
    const attempt = randomUUID(),
      signal = new AbortController().signal;
    const result = await f.reader.read(url, attempt, signal, f.session);
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    const evidence = result.source.evidence!;
    assert.ok("video" in evidence);
    assert.equal(evidence.video.cid, "789");
    assert.equal(evidence.provenance.source, "platform_captions");
    assert.equal(evidence.provenance.kind, "automatic");
    assert.equal(
      videoMatchesUrl(
        evidence.video,
        "https://www.bilibili.com/video/av123?p=2",
      ),
      true,
    );
    assert.equal(
      videoMatchesUrl(
        evidence.video,
        "https://www.bilibili.com/video/av123?p=1",
      ),
      false,
    );
    assert.equal(
      sourceSchema.safeParse({
        ...result.source,
        sourceUrl: "https://www.bilibili.com/video/av123?p=2",
        sourceKey: "bilibili:video:av123:p:2",
      }).success,
      true,
    );
    assert.equal(f.calls.length, 1);
    assert.ok(
      f.calls[0].includes("--write-subs") &&
        f.calls[0].includes("--dump-single-json"),
    );
    assert.ok(f.calls[0].includes("all,-danmaku"));
    assert.equal(f.calls[0].at(-1), url);
    assert.equal(f.requests.length, 1);
    assert.equal(
      await readFile(
        join(
          f.reader.evidenceRoot,
          attempt,
          "bilibili",
          `${bvid}-p2`,
          "captions.srt",
        ),
        "utf8",
      ),
      srt,
    );
    assert.deepEqual(
      await f.reader.read(`${url}&t=3`, attempt, signal, f.session),
      result,
    );
    assert.equal(f.calls.length, 1);
    const stop = new AbortController();
    stop.abort();
    await assert.rejects(
      f.reader.read(url, attempt, stop.signal, f.session),
      /Cancelled/,
    );
    assert.deepEqual(
      await f.reader.read(url, attempt, signal, f.session),
      result,
    );
    const { ResultPublisher } =
      await import("../../src/main/services/result-publisher");
    const publisher = new ResultPublisher(
      join(f.root, "results"),
      undefined,
      f.reader.evidenceRoot,
    );
    await publisher.publishReading({
      task: {
        taskId: randomUUID(),
        resultId: randomUUID(),
        attemptId: attempt,
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        target: { sourceUrl: url },
        state: "completed",
      },
      partial: {
        materials: [
          {
            id: "main",
            role: "main",
            url,
            title: "Fixture",
            source: result.source,
            chunks: [],
            summary: "",
            state: "partial",
          },
        ],
      },
    } as any);
    const manifest = JSON.parse(
      await readFile(
        join(f.root, "results/reading", attempt, "manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.evidence[0].video.cid, "789");
    assert.equal(manifest.evidence[0].provenance.source, "platform_captions");
    assert.ok(
      manifest.evidenceFiles.some((file: any) =>
        file.path.endsWith("/captions.srt"),
      ),
    );
    const metadata = await readFile(
      join(
        f.reader.evidenceRoot,
        attempt,
        "bilibili",
        `${bvid}-p2`,
        "metadata.json",
      ),
      "utf8",
    );
    assert.doesNotMatch(metadata, /private.test|signed/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const scenario of [
  { login: true, expected: "need_login_subtitle" },
  { login: false, expected: "bilibili_subtitles_unavailable" },
])
  test(`Bilibili keeps ${scenario.expected} distinct from extraction and website login`, async () => {
    const f = await fixture({ noSubs: true, login: scenario.login });
    try {
      const id = randomUUID(),
        signal = new AbortController().signal;
      assert.deepEqual(await f.reader.read(url, id, signal, f.session), {
        outcome: "unavailable",
        reason: scenario.expected,
      });
      await f.reader.read(url, id, signal, f.session);
      assert.equal(f.calls.length, 1);
      assert.equal(f.requests.length, 2);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

test("Bilibili uses the application session subtitle endpoint after anonymous extraction fails", async () => {
  const f = await fixture({ sessionSubs: true, failExtractor: true });
  try {
    const id = randomUUID();
    const result = await f.reader.read(
      url,
      id,
      new AbortController().signal,
      f.session,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(result.source.evidence?.trackKind, "unknown");
    assert.equal(result.source.evidence?.segments[0].text, "Session subtitle");
    assert.match(
      await readFile(
        join(
          f.reader.evidenceRoot,
          id,
          "bilibili",
          `${bvid}-p2`,
          "captions.json",
        ),
        "utf8",
      ),
      /Session subtitle/,
    );
    assert.doesNotMatch(
      await readFile(
        join(
          f.reader.evidenceRoot,
          id,
          "bilibili",
          `${bvid}-p2`,
          "metadata.json",
        ),
        "utf8",
      ),
      /access=private|signed URL/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Bilibili rejects extractor/CID changes and subtitle destinations outside its source boundary", async () => {
  for (const options of [
    { wrongIdentity: true },
    { sessionSubs: true, mismatchCid: true },
    {
      sessionSubs: true,
      subtitleUrl: "https://evil.test/bfs/subtitle/fixture.json",
    },
  ]) {
    const f = await fixture(options);
    try {
      const result = await f.reader.read(
        url,
        randomUUID(),
        new AbortController().signal,
        f.session,
      );
      assert.equal(result.outcome, "unavailable");
      assert.equal(
        result.outcome === "unavailable" && result.reason,
        "subtitleUrl" in options
          ? "transcript_access_url_rejected"
          : "transcript_identity_changed",
      );
      assert.equal(
        f.requests.some((url) => url.includes("evil.test")),
        false,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
  assert.throws(() =>
    bilibiliJsonUrl("https://api.bilibili.com@evil.test/x/player/wbi/v2"),
  );
});

test("Bilibili session cookies remain in memory and scope requests to their actual host", async () => {
  const original = globalThis.fetch,
    seen: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    seen.push({ url: String(url), ...init });
    return new Response('{"code":0,"data":{}}');
  }) as typeof fetch;
  try {
    const session = bilibiliReadSession({
      cookies: async (url: string) => {
        assert.equal(new URL(url).hostname, "api.bilibili.com");
        return [{ name: "SESSDATA", value: "fixture-private" }];
      },
    } as any);
    await session.getJson(
      "https://api.bilibili.com/x/player/wbi/v2?bvid=BV1234567890&cid=789",
      new AbortController().signal,
    );
    await session.getJson(
      "https://aisubtitle.hdslb.com/bfs/subtitle/fixture.json",
      new AbortController().signal,
    );
    assert.equal(seen[0].headers.Cookie, "SESSDATA=fixture-private");
    assert.equal(seen[1].headers.Cookie, undefined);
    const stop = new AbortController();
    stop.abort();
    const f = await fixture();
    try {
      await assert.rejects(
        f.reader.read(url, randomUUID(), stop.signal, f.session),
        /Cancelled/,
      );
      assert.equal(f.calls.length, 0);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("Bilibili active cancellation retains captured metadata and classified attempt state", async () => {
  const f = await fixture();
  try {
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const reader = new BilibiliTranscriptReader(
      join(f.root, "runtime"),
      f.reader.evidenceRoot,
      async (_exe, _args, _directory, signal) => {
        started();
        return new Promise<string>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("Cancelled")),
            { once: true },
          ),
        );
      },
    );
    const stop = new AbortController(),
      id = randomUUID();
    const result = reader.read(url, id, stop.signal, f.session);
    await running;
    stop.abort();
    await assert.rejects(result, /Cancelled/);
    const directory = join(reader.evidenceRoot, id, "bilibili", `${bvid}-p2`);
    assert.equal(
      JSON.parse(await readFile(join(directory, "reader-attempt.json"), "utf8"))
        .reason,
      "cancelled",
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, "metadata.json"), "utf8")).video
        .cid,
      "789",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Bilibili HTTP failures retain the observed status independently of login", async () => {
  const { fetchBilibiliJson } =
    await import("../../src/main/services/video-session");
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("denied", { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(
      fetchBilibiliJson(
        "https://api.bilibili.com/x/web-interface/view?bvid=BV1234567890",
        new AbortController().signal,
      ),
      /^Error: bilibili_http_403$/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Bilibili unavailable state preserves the original failing stage", async () => {
  const f = await fixture({ noSubs: true, login: true });
  try {
    const id = randomUUID();
    await f.reader.read(url, id, new AbortController().signal, f.session);
    const state = JSON.parse(
      await readFile(
        join(
          f.reader.evidenceRoot,
          id,
          "bilibili",
          `${bvid}-p2/reader-attempt.json`,
        ),
        "utf8",
      ),
    );
    assert.equal(state.stage, "captions");
    const sourceId = randomUUID();
    await f.reader.read(url, sourceId, new AbortController().signal, {
      getJson: async () => ({ code: -403 }),
    });
    const sourceState = JSON.parse(
      await readFile(
        join(
          f.reader.evidenceRoot,
          sourceId,
          "bilibili",
          `${bvid}-p2/reader-attempt.json`,
        ),
        "utf8",
      ),
    );
    assert.equal(sourceState.stage, "source");
    assert.equal(sourceState.reason, "bilibili_api_-403");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
