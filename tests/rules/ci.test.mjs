import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkTier,
  readChangedFiles,
  verifyResults,
} from "../../scripts/checks/ci.mjs";

const mainPR = { eventName: "pull_request", baseRef: "main" };
const devPR = { eventName: "pull_request", baseRef: "dev" };
const push = { eventName: "push", ref: "refs/heads/main" };
const manual = { eventName: "workflow_dispatch", ref: "refs/heads/dev" };

test("application changes and unavailable diffs retain event-based checks", () => {
  for (const [event, expected] of [
    [devPR, "quick"],
    [mainPR, "full"],
    [push, "quick"],
    [{ ...push, ref: "refs/heads/dev" }, "quick"],
    [manual, "full"],
    [{ ...manual, ref: "refs/heads/feat/example" }, "full"],
  ]) {
    for (const changedFiles of [
      undefined,
      ["src/main/main.ts"],
      ["docs/development.md", "package-lock.json"],
    ])
      assert.equal(checkTier({ ...event, changedFiles }), expected);
  }
  for (const event of [
    { ...mainPR, baseRef: "other" },
    { ...push, ref: "refs/tags/v1.2.3" },
    { eventName: "unknown" },
  ])
    assert.throws(() => checkTier({ ...event, labels: ["ci:skip-app"] }));
});

test("documentation and homepage-only changes skip all application jobs", () => {
  const files = [
    "README.md",
    "README.zh-CN.md",
    "AGENTS.md",
    "docs/product-spec.md",
    "docs/releases/0.2.4.md",
    "src/main/README.md",
    "tests/README.md",
    "tests/update-failures.md",
    "website/main.js",
    "website/styles.css",
    "website/media/demo.mp4",
    "scripts/homepage/build.mjs",
    "assets/screenshots/topic-en.png",
  ];
  for (const event of [mainPR, devPR, push, manual]) {
    for (const changedFiles of [[], files, ...files.map((file) => [file])])
      assert.equal(checkTier({ ...event, changedFiles }), "static");
  }
});

test("runtime Markdown, shared artwork, tooling, tests and unknown paths keep application checks", () => {
  for (const file of [
    "src/platforms/browser/skills/web-reading/SKILL.md",
    "src/platforms/browser/prompts/search.md",
    "src/renderer/App.tsx",
    "assets/postrove-icon.svg",
    "assets/postrove-mark.svg",
    "assets/new.png",
    "package.json",
    "package-lock.json",
    "electron-builder.yml",
    "scripts/checks/ci.mjs",
    "scripts/app-build/app.mjs",
    ".github/workflows/checks.yml",
    ".github/workflows/pages.yml",
    "tests/rules/homepage.test.mjs",
    "tests/e2e/application.spec.ts",
    "new-file.txt",
  ]) {
    const changedFiles = ["docs/development.md", "website/main.js", file];
    assert.equal(checkTier({ ...mainPR, changedFiles }), "full", file);
    assert.equal(checkTier({ ...devPR, changedFiles }), "quick", file);
  }
  const changedFiles = Array.from({ length: 350 }, (_, i) => `docs/${i}.md`);
  changedFiles.push("src/main/main.ts");
  assert.equal(checkTier({ ...mainPR, changedFiles }), "full");
});

test("PR overrides give full checks priority and apply only to PRs", () => {
  for (const event of [mainPR, devPR]) {
    for (const changedFiles of [
      undefined,
      ["website/main.js"],
      ["src/main/main.ts"],
    ]) {
      assert.equal(
        checkTier({ ...event, changedFiles, labels: ["ci:full"] }),
        "full",
      );
      assert.equal(
        checkTier({ ...event, changedFiles, labels: ["ci:skip-app"] }),
        "static",
      );
      assert.equal(
        checkTier({
          ...event,
          changedFiles,
          labels: ["ci:skip-app", "ci:full"],
        }),
        "full",
      );
    }
  }
  assert.equal(checkTier({ ...push, labels: ["ci:full"] }), "quick");
  assert.equal(checkTier({ ...manual, labels: ["ci:skip-app"] }), "full");
  assert.equal(checkTier({ ...mainPR, labels: ["unrelated"] }), "full");
});

test("manual quick and full override automatic file detection", () => {
  for (const scope of ["quick", "full"]) {
    for (const changedFiles of [
      undefined,
      [],
      ["website/main.js"],
      ["src/main/main.ts"],
    ])
      assert.equal(checkTier({ ...manual, scope, changedFiles }), scope);
  }
  assert.equal(
    checkTier({ ...manual, scope: "auto", changedFiles: ["README.md"] }),
    "static",
  );
  assert.throws(() => checkTier({ ...manual, scope: "unknown" }));
});

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "postrove-ci-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const write = (file, text = file) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), text);
  };
  const commit = () => {
    git("add", "--all");
    git(
      "-c",
      "user.name=CI",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  git("init", "-qb", "main");
  write("src/main.ts");
  const base = commit();
  git("update-ref", "refs/remotes/origin/main", base);
  return { cwd, git, write, commit, base };
}

test("Git diff covers every pushed commit and both sides of renames", (t) => {
  const { cwd, git, write, commit, base } = repository(t);
  write("docs/文档 with spaces.md");
  const docs = commit();
  let changedFiles = readChangedFiles(
    { ...push, sha: docs, event: { before: base } },
    cwd,
  );
  assert.deepEqual(changedFiles, ["docs/文档 with spaces.md"]);
  assert.equal(checkTier({ ...push, changedFiles }), "static");

  write("src/main.ts", "changed");
  const application = commit();
  write("website/index.html");
  const homepage = commit();
  changedFiles = readChangedFiles(
    { ...push, sha: homepage, event: { before: docs } },
    cwd,
  );
  assert.deepEqual(changedFiles, ["src/main.ts", "website/index.html"]);
  assert.equal(checkTier({ ...push, changedFiles }), "quick");

  git("mv", "src/main.ts", "docs/moved.md");
  const renamed = commit();
  changedFiles = readChangedFiles(
    { ...push, sha: renamed, event: { before: homepage } },
    cwd,
  );
  assert.deepEqual(changedFiles, ["docs/moved.md", "src/main.ts"]);
  assert.equal(checkTier({ ...mainPR, changedFiles }), "full");
  assert.throws(() =>
    readChangedFiles(
      { ...push, sha: application, event: { before: "0".repeat(40) } },
      cwd,
    ),
  );
});

test("PR diff uses its base and tested merge result; manual auto compares with main", (t) => {
  const { cwd, git, write, commit, base } = repository(t);
  git("checkout", "-qb", "feature");
  write("website/index.html");
  const feature = commit();
  git("checkout", "-q", "main");
  write("src/main.ts", "base changed");
  const currentBase = commit();
  git(
    "-c",
    "user.name=CI",
    "-c",
    "user.email=ci@example.invalid",
    "merge",
    "--no-ff",
    "-qm",
    "fixture merge",
    "feature",
  );
  const sha = git("rev-parse", "HEAD");
  const changedFiles = readChangedFiles(
    { ...mainPR, sha, event: { pull_request: { base: { sha: currentBase } } } },
    cwd,
  );
  assert.deepEqual(changedFiles, ["website/index.html"]);
  assert.equal(checkTier({ ...mainPR, changedFiles }), "static");
  assert.deepEqual(
    readChangedFiles({ ...manual, sha: feature, event: {} }, cwd),
    ["website/index.html"],
  );
  assert.deepEqual(
    readChangedFiles(
      { ...manual, ref: "refs/heads/main", sha, event: {} },
      cwd,
    ),
    ["website/index.html"],
  );
  assert.deepEqual(readChangedFiles({ ...manual, sha, event: {} }, cwd), [
    "src/main.ts",
    "website/index.html",
  ]);
  assert.deepEqual(
    readChangedFiles({ ...push, sha, event: { before: sha } }, cwd),
    [],
  );
  assert.throws(() =>
    readChangedFiles({ ...mainPR, sha: base, event: {} }, cwd),
  );
});

test("scope CLI connects GitHub events, labels, manual choices, fallback and outputs", (t) => {
  const { cwd, write, commit, base } = repository(t);
  write("website/index.html");
  const sha = commit();
  const script = fileURLToPath(
    new URL("../../scripts/checks/ci.mjs", import.meta.url),
  );
  const eventPath = join(cwd, "event.json");
  const output = join(cwd, "output");
  const summary = join(cwd, "summary");
  for (const [event, env, expected] of [
    [{ before: base }, { GITHUB_EVENT_NAME: "push" }, "static"],
    [
      { pull_request: { base: { sha: base }, labels: [{ name: "ci:full" }] } },
      { GITHUB_EVENT_NAME: "pull_request" },
      "full",
    ],
    [
      {
        pull_request: {
          base: { sha: base },
          labels: [{ name: "ci:skip-app" }],
        },
      },
      { GITHUB_EVENT_NAME: "pull_request" },
      "static",
    ],
    [
      { pull_request: { base: { sha: base }, labels: [] } },
      { GITHUB_EVENT_NAME: "pull_request" },
      "static",
    ],
    [
      {},
      { GITHUB_EVENT_NAME: "workflow_dispatch", CI_SCOPE: "quick" },
      "quick",
    ],
    [{}, { GITHUB_EVENT_NAME: "workflow_dispatch", CI_SCOPE: "full" }, "full"],
    [
      {},
      {
        GITHUB_EVENT_NAME: "workflow_dispatch",
        CI_SCOPE: "auto",
        GITHUB_REF: "refs/heads/feature",
      },
      "static",
    ],
    [{ before: "0".repeat(40) }, { GITHUB_EVENT_NAME: "push" }, "quick"],
  ]) {
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(output, "");
    writeFileSync(summary, "");
    execFileSync(process.execPath, [script, "scope"], {
      cwd,
      stdio: "pipe",
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_BASE_REF: "main",
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: sha,
        CI_SCOPE: "",
        ...env,
      },
    });
    assert.equal(readFileSync(output, "utf8"), `tier=${expected}\n`);
    assert.equal(readFileSync(summary, "utf8"), `Check scope: ${expected}\n`);
  }
});

test("CI gate rejects failed, cancelled, missing and unexpectedly skipped required jobs", () => {
  for (const tier of ["static", "quick", "full"]) {
    const jobs = {
      static: { result: "success" },
      application: { result: tier === "static" ? "skipped" : "success" },
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
