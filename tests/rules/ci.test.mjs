import test from "node:test";
import assert from "node:assert/strict";
import { checkTier, verifyResults } from "../../scripts/checks/ci.mjs";

test("CI selects full verification for main PRs and manual runs, and quick verification for development and branch pushes", () => {
  for (const [eventName, baseRef, ref, expected] of [
    ["pull_request", "dev", "refs/pull/1/merge", "quick"],
    ["pull_request", "main", "refs/pull/1/merge", "full"],
    ["push", "", "refs/heads/dev", "quick"],
    ["push", "", "refs/heads/main", "quick"],
    ["workflow_dispatch", "", "refs/heads/dev", "full"],
    ["workflow_dispatch", "", "refs/heads/feat/example", "full"],
  ])
    assert.equal(checkTier({ eventName, baseRef, ref }), expected);
  assert.throws(() =>
    checkTier({ eventName: "pull_request", baseRef: "other" }),
  );
  assert.throws(() =>
    checkTier({ eventName: "push", ref: "refs/tags/v1.2.3" }),
  );
  assert.throws(() => checkTier({ eventName: "unknown" }));
});

test("CI gate rejects failed, cancelled, missing and unexpectedly skipped required jobs", () => {
  for (const tier of ["quick", "full"]) {
    const jobs = {
      static: { result: "success" },
      application: { result: "success" },
      windows: { result: tier === "full" ? "success" : "skipped" },
      windows_package: { result: tier === "full" ? "success" : "skipped" },
    };
    assert.doesNotThrow(() => verifyResults(tier, jobs));
    for (const name of Object.keys(jobs)) {
      for (const result of [
        "failure",
        "cancelled",
        "timed_out",
        "skipped",
        "success",
      ]) {
        if (result === jobs[name].result) continue;
        assert.throws(() =>
          verifyResults(tier, { ...jobs, [name]: { result } }),
        );
      }
      const missing = { ...jobs };
      delete missing[name];
      assert.throws(() => verifyResults(tier, missing));
    }
  }
  assert.throws(() => verifyResults("", {}));
  assert.throws(() => verifyResults("full", null));
});
