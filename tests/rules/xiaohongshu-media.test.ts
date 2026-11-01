import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { youtubeRuntimeVersion } from "../../src/main/services/youtube-transcript";
import {
  XiaohongshuMediaReader,
  XhsMediaError,
  classifyXhsFailure,
  normalizeXhsVideoMetadata,
  resolveXhsNote,
  xhsCookieFile,
  xhsNoteIdentity,
  type XhsCookie,
  type XhsProcessRunner,
} from "../../src/main/services/xiaohongshu-media";
import { normalizeXhsDetail } from "../../src/platforms/adapters/xhs";

const id = "abcdef1234567890abcdef12";
const url = `https://www.xiaohongshu.com/explore/${id}`;
const full = `${url}?xsec_token=fictional-access&xsec_source=pc_share`;
const note = xhsNoteIdentity(full)!;
const metadata = {
  id,
  title: "Fictional video",
  description: "The written description",
  uploader_id: "fictional-author",
  thumbnails: [{ url: "https://sns-webpic.example.test/cover.jpg" }],
  formats: [
    {
      url: "https://sns-video-bd.xhscdn.com/fictional.mp4",
      duration: 12,
      acodec: "aac",
    },
  ],
};
const cookie: XhsCookie = {
  name: "a1",
  value: "fictional-guest-cookie",
  domain: ".xiaohongshu.com",
  path: "/",
  expires: -1,
  secure: true,
};
async function fixture(run: XhsProcessRunner) {
  const root = await mkdtemp(join(tmpdir(), "postrove-xhs-media-"));
  await mkdir(join(root, "youtube"));
  await writeFile(
    join(root, "youtube", "runtime.json"),
    JSON.stringify(youtubeRuntimeVersion),
  );
  await writeFile(
    join(
      root,
      "youtube",
      `yt-dlp${process.platform === "win32" ? ".exe" : ""}`,
    ),
    "fixture",
    { mode: 0o700 },
  );
  return {
    root,
    reader: new XiaohongshuMediaReader(root, run),
    directory: join(root, "evidence"),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
test("XHS request identity retains full share parameters across supported note routes", () => {
  for (const path of ["explore", "discovery/item", "search_result"]) {
    const result = xhsNoteIdentity(
      `https://xiaohongshu.com/${path}/${id}?xsec_token=fictional-access&xsec_source=pc_share#ignored`,
    );
    assert.equal(result?.id, id);
    assert.equal(result?.url, url);
    assert.equal(result?.requestUrl, full);
  }
  for (const raw of [
    url.replace("https:", "http:"),
    url.replace("www.xiaohongshu.com", "evil.test"),
    `https://user@www.xiaohongshu.com/explore/${id}`,
    `${url}:bad`,
    url.replace(id, "another-id"),
  ])
    assert.equal(xhsNoteIdentity(raw), undefined);
});
test("XHS share short links resolve only through known share hosts", async () => {
  const seen: string[] = [];
  const fetcher = (async (input: URL | RequestInfo, options: RequestInit) => {
    seen.push(String(input));
    assert.equal(options.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: {
        location: seen.length === 1 ? "https://xhslink.cn/o/fictional" : full,
      },
    });
  }) as typeof fetch;
  assert.equal(
    (
      await resolveXhsNote(
        "https://xhslink.com/a/fictional",
        new AbortController().signal,
        fetcher,
      )
    ).requestUrl,
    full,
  );
  assert.equal(seen.length, 2);
  await assert.rejects(
    resolveXhsNote(
      "https://xhslink.com/fictional",
      new AbortController().signal,
      (async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test/" },
        })) as typeof fetch,
    ),
    /identity_changed/,
  );
});
test("XHS short-link loops and cancellation have bounded outcomes", async () => {
  let calls = 0;
  await assert.rejects(
    resolveXhsNote(
      "https://xhslink.com/fictional",
      new AbortController().signal,
      (async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "/fictional" },
        });
      }) as typeof fetch,
    ),
    /source_unavailable/,
  );
  assert.equal(calls, 5);
  await assert.rejects(resolveXhsNote(full, AbortSignal.abort()), /Cancelled/);
});
test("XHS cookies keep guest transport separate and exclude unrelated or malformed credentials", () => {
  const text = xhsCookieFile([
    cookie,
    { ...cookie, domain: "evilxiaohongshu.com", value: "unrelated" },
    { ...cookie, value: "line\ninjection" },
    { ...cookie, expires: 1, value: "expired" },
  ]);
  assert.match(text, /fictional-guest-cookie/);
  assert.doesNotMatch(text, /unrelated|injection|expired/);
});
test("XHS metadata validates identity, selects audio-bearing CDN media and strips request credentials", () => {
  const result = normalizeXhsVideoMetadata(
    {
      ...metadata,
      http_headers: {
        Cookie: "secret",
        Authorization: "secret",
        "User-Agent": "Fixture",
      },
      formats: [
        { url: "https://evil.test/media.mp4", acodec: "aac" },
        { url: "https://sns-video-bd.xhscdn.com/silent.mp4", acodec: "none" },
        ...metadata.formats,
      ],
    },
    note,
  );
  assert.equal(result.metadata.duration, 12);
  assert.equal(result.metadata.description, metadata.description);
  assert.equal(result.media?.url, metadata.formats[0].url);
  assert.deepEqual(result.media?.allowedHosts, ["sns-video-bd.xhscdn.com"]);
  assert.equal(result.media?.headers.Referer, full);
  assert.equal(result.media?.headers.Cookie, undefined);
  assert.throws(
    () => normalizeXhsVideoMetadata({ ...metadata, id: "b".repeat(24) }, note),
    /identity_changed/,
  );
});
test("XHS metadata-only results keep written content and covers", () => {
  const result = normalizeXhsVideoMetadata({ ...metadata, formats: [] }, note);
  assert.equal(result.media, undefined);
  assert.equal(result.metadata.images.length, 1);
  assert.equal(result.metadata.title, metadata.title);
});
test("XHS failure classification requires an observed access challenge", () => {
  assert.equal(classifyXhsFailure("HTTP Error 403"), "extraction_failed");
  assert.equal(
    classifyXhsFailure("Unable to extract initial state"),
    "extraction_failed",
  );
  assert.equal(classifyXhsFailure("Login required to view"), "login_required");
  assert.equal(classifyXhsFailure("安全验证"), "verification_required");
  assert.equal(
    classifyXhsFailure("xsec_token expired"),
    "access_parameters_invalid",
  );
  assert.equal(classifyXhsFailure("300031"), "source_unavailable");
});
test("XHS extractor uses the pinned runtime, full URL and ephemeral profile cookies", async () => {
  const f = await fixture(async (_executable, args, directory) => {
    assert.equal(args.at(-1), full);
    assert.equal(args.at(-2), "--");
    const file = args[args.indexOf("--cookies") + 1];
    assert.equal(file, join(directory, "cookies.txt"));
    assert.match(await readFile(file, "utf8"), /fictional-guest-cookie/);
    if (process.platform !== "win32")
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    return JSON.stringify({
      ...metadata,
      http_headers: { Cookie: "secret" },
      nested: { cookies: "secret" },
    });
  });
  try {
    assert.equal(await f.reader.available(), true);
    const result = await f.reader.read({
      url: full,
      directory: f.directory,
      signal: new AbortController().signal,
      cookies: [cookie],
    });
    assert.equal(result.cookies, "guest");
    assert.equal(result.issue, undefined);
    assert.ok(result.media);
    assert.deepEqual(await readdir(f.directory), ["metadata.json"]);
    assert.doesNotMatch(
      await readFile(join(f.directory, "metadata.json"), "utf8"),
      /secret/,
    );
  } finally {
    await f.cleanup();
  }
});
test("XHS failed media extraction retains same-note page metadata without inferring sign-in", async () => {
  const f = await fixture(async () => {
    throw new XhsMediaError("extraction_failed");
  });
  try {
    const fallback = normalizeXhsVideoMetadata(metadata, note).metadata;
    const result = await f.reader.read({
      url: full,
      directory: f.directory,
      signal: new AbortController().signal,
      fallback,
      cookies: [{ ...cookie, name: "web_session" }],
    });
    assert.equal(result.metadata?.description, metadata.description);
    assert.equal(result.issue, "extraction_failed");
    assert.equal(result.cookies, "account_session_present");
    assert.deepEqual(await readdir(f.directory), []);
  } finally {
    await f.cleanup();
  }
});
test("XHS output budgets and identity mismatches preserve only the verified fallback", async () => {
  for (const [raw, expected] of [
    ["x".repeat(8 * 1024 * 1024 + 1), "output_budget"],
    [JSON.stringify({ ...metadata, id: "b".repeat(24) }), "identity_changed"],
  ]) {
    const f = await fixture(async () => raw);
    try {
      const result = await f.reader.read({
        url: full,
        directory: f.directory,
        signal: new AbortController().signal,
      });
      assert.equal(result.issue, expected);
      assert.equal(result.metadata, undefined);
      assert.equal(result.media, undefined);
      assert.deepEqual(await readdir(f.directory), []);
    } finally {
      await f.cleanup();
    }
  }
});
test("XHS sparse extractor metadata retains the verified page text and cover", async () => {
  const f = await fixture(async () =>
    JSON.stringify({ id, formats: metadata.formats }),
  );
  try {
    const fallback = normalizeXhsVideoMetadata(metadata, note).metadata;
    const result = await f.reader.read({
      url: full,
      directory: f.directory,
      signal: new AbortController().signal,
      fallback,
    });
    assert.equal(result.metadata?.title, metadata.title);
    assert.equal(result.metadata?.description, metadata.description);
    assert.equal(result.metadata?.images.length, 1);
    assert.ok(result.media);
  } finally {
    await f.cleanup();
  }
});
test("XHS cancellation drains the injected extractor and removes temporary cookies", async () => {
  const controller = new AbortController();
  const f = await fixture(async (_executable, _args, _directory, signal) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    throw new Error("Cancelled");
  });
  try {
    await assert.rejects(
      f.reader.read({
        url: full,
        directory: f.directory,
        signal: controller.signal,
        cookies: [cookie],
      }),
      /Cancelled/,
    );
    assert.deepEqual(await readdir(f.directory), []);
  } finally {
    await f.cleanup();
  }
});
test("XHS image/text normalization retains the existing body and image order", () => {
  const source = normalizeXhsDetail(
    {
      data: {
        note: {
          type: "normal",
          title: "Image note",
          desc: "Body",
          imageList: [
            { urlDefault: "https://example.test/one.jpg" },
            { urlDefault: "https://example.test/two.jpg" },
          ],
        },
      },
    },
    id,
  );
  assert.equal(source.sourceUrl, url);
  assert.equal(source.images.length, 2);
  assert.deepEqual(
    source.contentBlocks
      .filter((block) => block.type === "image")
      .map((block) => block.imageId),
    ["xhs-image-0", "xhs-image-1"],
  );
});
