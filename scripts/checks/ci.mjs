import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function checkTier({ eventName, baseRef, ref }) {
  if (eventName === "pull_request" && ["dev", "main"].includes(baseRef))
    return baseRef === "main" ? "full" : "quick";
  if (
    eventName === "push" &&
    ["refs/heads/dev", "refs/heads/main"].includes(ref)
  )
    return "quick";
  if (eventName === "workflow_dispatch") return "full";
  throw new Error(`Unsupported check event: ${eventName} ${baseRef || ref}`);
}

export function verifyResults(tier, jobs) {
  if (!["quick", "full"].includes(tier))
    throw new Error("Check scope must complete before the CI gate can pass");
  const expected = {
    static: "success",
    application: "success",
    windows: tier === "full" ? "success" : "skipped",
    windows_package: tier === "full" ? "success" : "skipped",
  };
  const failures = Object.entries(expected)
    .filter(([job, result]) => jobs?.[job]?.result !== result)
    .map(
      ([job, result]) =>
        `${job}: expected ${result}, received ${jobs?.[job]?.result ?? "missing"}`,
    );
  if (failures.length) throw new Error(failures.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "scope") {
    const tier = checkTier({
      eventName: process.env.GITHUB_EVENT_NAME,
      baseRef: process.env.GITHUB_BASE_REF,
      ref: process.env.GITHUB_REF,
    });
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
    console.log(`Check scope: ${tier}`);
  } else if (process.argv[2] === "gate") {
    verifyResults(process.env.CI_TIER, JSON.parse(process.env.CI_RESULTS));
    console.log(`CI gate passed: ${process.env.CI_TIER}`);
  } else {
    throw new Error("Choose scope or gate");
  }
}
