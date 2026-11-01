import assert from "node:assert/strict";
import test from "node:test";
import {
  diagnoseReadingError,
  materialDiagnostic,
  readingDiagnostic,
  ReadingFailure,
} from "../../src/shared/reading-diagnostics";
import { readingMaterialSchema } from "../../src/shared/reading-contracts";
import { ExecutionFailure } from "../../src/shared/task-failure";

test("typed reading causes survive wrappers and HTTP observations retain uncertainty", () => {
  const observed = readingDiagnostic("http_error", "source", {
    httpStatus: 403,
  });
  assert.deepEqual(
    diagnoseReadingError(
      new Error("wrapper", { cause: new ReadingFailure(observed, "HTTP 403") }),
      "source",
    ),
    observed,
  );
  const wrapper = Object.assign(
    new Error("transport wrapper", {
      cause: new ReadingFailure(observed, "HTTP 403"),
    }),
    { code: "ECONNRESET" },
  );
  assert.deepEqual(diagnoseReadingError(wrapper, "source"), observed);
  assert.equal(observed.category, "unknown");
  assert.equal(
    diagnoseReadingError(new Error("fetch failed"), "source", true).code,
    "unknown",
  );
  assert.equal(observed.actions.includes("sign_in"), false);
  assert.equal(
    diagnoseReadingError(new Error("login failed"), "source").code,
    "unknown",
  );
  assert.equal(
    diagnoseReadingError(
      new Error("fetch failed", {
        cause: Object.assign(new Error(), { code: "ECONNRESET" }),
      }),
      "source",
    ).code,
    "network_failed",
  );
});
test("readiness, access parameters and captions carry separate recovery actions", () => {
  assert.deepEqual(
    readingDiagnostic("component_missing", "readiness").actions,
    ["setup_component"],
  );
  assert.deepEqual(
    readingDiagnostic("access_parameters_missing", "access").actions,
    ["provide_access_link"],
  );
  assert.equal(
    readingDiagnostic("captions_missing", "captions").category,
    "captions",
  );
  assert.deepEqual(readingDiagnostic("login_required", "access").actions, [
    "sign_in",
  ]);
});
test("processing errors resume saved content and legacy strings remain readable", () => {
  const diagnostic = diagnoseReadingError(
    new ExecutionFailure("model_network"),
    "translation",
    true,
  );
  assert.equal(diagnostic.stage, "translation");
  assert.ok(diagnostic.actions.includes("resume_processing"));
  const legacy = {
    id: "main",
    role: "main",
    url: "https://example.com/article",
    title: "Example",
    chunks: [],
    summary: "",
    state: "failed",
    issue: "old login issue",
  };
  const parsed = readingMaterialSchema.parse(legacy);
  assert.equal(parsed.issue, legacy.issue);
  assert.equal(materialDiagnostic(parsed)?.code, "unknown");
  assert.equal(parsed.diagnostic, undefined);
  assert.deepEqual(
    readingMaterialSchema.parse({ ...legacy, diagnostic }).diagnostic,
    diagnostic,
  );
});

test("page observations distinguish login, verification and account action from arbitrary URLs", async () => {
  const { observedPageDiagnostic, transcriptDiagnostic } =
    await import("../../src/shared/reading-observations");
  assert.equal(
    observedPageDiagnostic("https://x.com/i/flow/login")?.code,
    "login_required",
  );
  assert.equal(
    observedPageDiagnostic(
      "https://accounts.google.com/v3/signin/challenge/totp",
    )?.code,
    "verification_required",
  );
  assert.equal(
    observedPageDiagnostic("https://accounts.google.com/signin/oauth/consent")
      ?.code,
    "account_action_required",
  );
  assert.equal(
    observedPageDiagnostic("https://reddit.com.evil.test/login"),
    undefined,
  );
  assert.equal(
    observedPageDiagnostic("https://example.org/article?error=403"),
    undefined,
  );
  assert.equal(
    transcriptDiagnostic("transcript_captions_missing").code,
    "captions_missing",
  );
  assert.equal(
    transcriptDiagnostic("need_login_subtitle").code,
    "login_required",
  );
  assert.equal(transcriptDiagnostic("bilibili_http_403").category, "unknown");
  assert.equal(transcriptDiagnostic("transcript_unavailable").code, "unknown");
  assert.equal(
    transcriptDiagnostic("transcript_caption_artifact_missing").code,
    "unknown",
  );
  assert.equal(
    transcriptDiagnostic("bilibili_subtitles_unavailable").code,
    "captions_missing",
  );
  assert.equal(
    transcriptDiagnostic("transcript_runtime_unavailable").code,
    "component_missing",
  );
  assert.equal(
    transcriptDiagnostic("transcript_extraction_failed").code,
    "unknown",
  );
});

test("Xiaohongshu component and missing access parameters are independent of website login", async () => {
  const { createXhsAdapter } =
    await import("../../src/platforms/adapters/xhs/index");
  const url = "https://www.xiaohongshu.com/explore/1234567890abcdef12345678";
  const missing = await createXhsAdapter().read(
    "fixture",
    url,
    new AbortController().signal,
  );
  assert.equal(missing.diagnostic?.code, "component_unavailable");
  assert.equal("message" in missing && missing.message.includes("登录"), false);
  const access = await createXhsAdapter({
    url: "http://127.0.0.1:9",
    token: "fictional",
  }).read("fixture", url, new AbortController().signal);
  assert.equal(access.diagnostic?.code, "access_parameters_missing");
});

test("Xiaohongshu HTTP 403 and generic service failure preserve observed facts", async () => {
  const { createServer } = await import("node:http");
  const { createXhsAdapter } =
    await import("../../src/platforms/adapters/xhs/index");
  let status = 403;
  const server = createServer((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "fictional response" }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const adapter = createXhsAdapter({
      url: `http://127.0.0.1:${address.port}`,
      token: "fictional",
    });
    const url =
      "https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=fictional";
    const forbidden = await adapter.read(
      "fixture",
      url,
      new AbortController().signal,
    );
    assert.equal(forbidden.diagnostic?.code, "http_error");
    assert.equal(forbidden.diagnostic?.evidence?.httpStatus, 403);
    assert.equal(forbidden.diagnostic?.category, "unknown");
    status = 200;
    const unknown = await adapter.read(
      "fixture",
      url,
      new AbortController().signal,
    );
    assert.equal(unknown.diagnostic?.code, "unknown");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
