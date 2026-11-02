import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PlatformAccess } from "../../src/main/services/platform-access";
import type { BrowserAgent } from "../../src/main/services/browser-agent";
import { readingDiagnostic } from "../../src/shared/reading-diagnostics";

test("source diagnostics stay with their observed source and follow redirect aliases", async () => {
  const url = "https://example.org/article";
  const reference = "https://example.org/reference";
  const redirected = "https://example.org/final-reference";
  const uncaptured = "https://example.org/uncaptured";
  const unrelated = readingDiagnostic("login_required", "access");
  const observed = readingDiagnostic("http_error", "source", {
    httpStatus: 403,
  });
  const agent = {
    run: async () => ({
      output: {
        materials: [
          {
            role: "main",
            url,
            sourceCaptureIds: ["main"],
            completeness: "partial",
          },
          {
            role: "reference",
            url: reference,
            citedFromCaptureId: "main",
            sourceCaptureIds: ["reference"],
            completeness: "partial",
          },
          {
            role: "reference",
            url: uncaptured,
            citedFromCaptureId: "main",
            sourceCaptureIds: [],
            error: "failed",
          },
        ],
      },
      navigations: new Map([[reference, redirected]]),
      diagnostic: unrelated,
      sourceDiagnostics: new Map([[redirected, observed]]),
      captureData: new Map([
        [
          "main",
          {
            pageUrl: url,
            markdown: "Saved main",
            links: [
              { url: reference, title: "Reference" },
              { url: uncaptured, title: "Uncaptured" },
            ],
            images: [],
          },
        ],
        [
          "reference",
          {
            pageUrl: redirected,
            markdown: "Saved reference",
            links: [],
            images: [],
          },
        ],
      ]),
    }),
  } as unknown as BrowserAgent;
  const config = {
    method: "generic_api" as const,
    modelId: "fixture",
    api: "openai-completions" as const,
    baseUrl: "http://127.0.0.1:9/v1",
    credential: "fictional",
  };
  const progress: unknown[] = [];
  const materials = await new PlatformAccess(agent).collect(
    randomUUID(),
    url,
    config,
    new AbortController().signal,
    true,
    async (materials) => {
      progress.push(structuredClone(materials));
    },
  );
  // The initial admission checks uncaptured references before their independent retry.
  const admitted = progress[0] as typeof materials;
  assert.equal(admitted.length, 3);
  assert.equal(admitted[0].diagnostic, undefined);
  assert.deepEqual(admitted[1].diagnostic, observed);
  assert.equal(admitted[2].diagnostic?.code, "capture_incomplete");
  assert.equal(materials[0].source?.markdown, "Saved main");
  assert.deepEqual(materials[1].diagnostic, observed);
});
