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
  assert.equal(observed.category, "unknown");
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
