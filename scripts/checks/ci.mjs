import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function isDocumentationOrHomepage(file) {
  return (
    file.startsWith("docs/") ||
    /^(?:.*\/)?README(?:\.[\w-]+)?\.md$/.test(file) ||
    file === "AGENTS.md" ||
    /^tests\/[^/]+\.md$/.test(file) ||
    file.startsWith("website/") ||
    file.startsWith("scripts/homepage/") ||
    file.startsWith("assets/screenshots/")
  );
}

export function checkTier({
  eventName,
  baseRef,
  ref,
  changedFiles,
  labels = [],
  scope = "auto",
}) {
  let tier;
  if (eventName === "pull_request" && ["dev", "main"].includes(baseRef))
    tier = baseRef === "main" ? "full" : "quick";
  else if (
    eventName === "push" &&
    ["refs/heads/dev", "refs/heads/main"].includes(ref)
  )
    tier = "quick";
  else if (eventName === "workflow_dispatch") {
    if (!["auto", "quick", "full"].includes(scope))
      throw new Error(`Unsupported manual check scope: ${scope}`);
    if (scope !== "auto") return scope;
    tier = "full";
  } else {
    throw new Error(`Unsupported check event: ${eventName} ${baseRef || ref}`);
  }

  if (eventName === "pull_request") {
    if (labels.includes("ci:full")) return "full";
    if (labels.includes("ci:skip-app")) return "static";
  }
  return changedFiles?.every(isDocumentationOrHomepage) ? "static" : tier;
}

// Read the whole Git diff, including both sides of a rename. Missing history
// makes scope selection fall back to application checks in the CLI below.
export function readChangedFiles({ eventName, event, sha, ref }, cwd) {
  const isCommit = (value) =>
    /^[a-f\d]{40}$/i.test(value ?? "") && !/^0+$/.test(value);
  if (!isCommit(sha)) throw new Error("Missing checkout revision");
  let from;
  if (eventName === "pull_request") {
    from = event.pull_request?.base?.sha;
    if (!isCommit(from)) throw new Error("Missing PR base revision");
  } else if (eventName === "push") {
    from = event.before;
    if (!isCommit(from)) throw new Error("Missing push base revision");
  } else if (eventName === "workflow_dispatch") {
    from = ref === "refs/heads/main" ? `${sha}^` : "refs/remotes/origin/main";
  } else {
    throw new Error(`Unsupported diff event: ${eventName}`);
  }
  const revisions =
    eventName === "workflow_dispatch" && ref !== "refs/heads/main"
      ? [`${from}...${sha}`]
      : [from, sha];
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", ...revisions, "--"],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
}

export function verifyResults(tier, jobs) {
  if (!["static", "quick", "full"].includes(tier))
    throw new Error("Check scope must complete before the CI gate can pass");
  const expected = {
    static: "success",
    application: tier === "static" ? "skipped" : "success",
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
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    let changedFiles;
    try {
      changedFiles = readChangedFiles({
        eventName: process.env.GITHUB_EVENT_NAME,
        event,
        sha: process.env.GITHUB_SHA,
        ref: process.env.GITHUB_REF,
      });
    } catch {
      console.warn(
        "Changed files unavailable; automatic scope uses application checks.",
      );
    }
    const tier = checkTier({
      eventName: process.env.GITHUB_EVENT_NAME,
      baseRef: process.env.GITHUB_BASE_REF,
      ref: process.env.GITHUB_REF,
      changedFiles,
      labels: event.pull_request?.labels?.map(({ name }) => name),
      scope: process.env.CI_SCOPE || "auto",
    });
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
    const summary = `Check scope: ${tier}`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  } else if (process.argv[2] === "gate") {
    verifyResults(process.env.CI_TIER, JSON.parse(process.env.CI_RESULTS));
    console.log(`CI gate passed: ${process.env.CI_TIER}`);
  } else {
    throw new Error("Choose scope or gate");
  }
}
