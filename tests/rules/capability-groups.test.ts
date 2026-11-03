import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityGroups,
  capabilityPlatforms,
} from "../../src/renderer/workspace/capability-groups";
import type { CapabilityView } from "../../src/shared/capability-contracts";

const configured: CapabilityView = {
  model: true,
  chrome: true,
  readers: { youtube: true, bilibili: true, xiaohongshu: true },
  speech: { backend: "whisper.cpp", runtime: "ready", model: "ready" },
};
const platform = (id: string) =>
  capabilityPlatforms.find((item) => item.id === id)!;

test("guest Reddit AI uses enabled experts while X AI retains its account requirement", () => {
  const reddit = capabilityGroups(platform("reddit"), configured, false, [
    "reddit-ai-en",
  ]);
  assert.equal(
    reddit.find((item) => item.name === "Reddit AI 提问")!.ready,
    true,
  );
  const x = capabilityGroups(platform("x"), configured, false, ["x-grok-en"]);
  assert.equal(x.find((item) => item.name === "Grok 提问")!.ready, false);
  assert.equal(x.find((item) => item.name === "公开帖子")!.ready, true);
});

test("speech-model setup gates transcription while native captions stay configured", () => {
  const missing = {
    ...configured,
    speech: { ...configured.speech, model: "missing" as const },
  };
  for (const id of ["youtube", "bilibili"]) {
    const groups = capabilityGroups(platform(id), missing, false, []);
    assert.equal(groups.find((item) => item.name === "原始字幕")!.ready, true);
    assert.equal(groups.find((item) => item.name === "视频转录")!.ready, false);
  }
});

test("Xiaohongshu guest reading and transcription keep account access separate", () => {
  const groups = capabilityGroups(
    platform("xiaohongshu"),
    configured,
    false,
    [],
  );
  assert.equal(
    groups.find((item) => item.name === "公开图文笔记")!.ready,
    true,
  );
  assert.equal(
    groups.find((item) => item.name === "增强图文读取")!.ready,
    true,
  );
  assert.equal(groups.find((item) => item.name === "视频转录")!.ready, true);
  assert.equal(
    groups.find((item) => item.name === "账号可见笔记")!.ready,
    false,
  );
});

test("signed-in accounts and installed speech retain the common background-model requirement", () => {
  const missing = { ...configured, model: false };
  for (const source of capabilityPlatforms) {
    const groups = capabilityGroups(source, missing, true, [
      "x-grok-en",
      "reddit-ai-en",
      "youtube-gemini-en",
      "xiaohongshu-diandian-zh",
    ]);
    assert.equal(
      groups.some((item) => item.ready),
      false,
    );
  }
});
