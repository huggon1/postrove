import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialLanguage } from "../../src/shared/language";
import { Preferences } from "../../src/main/runtime/preferences";

test("initial language follows the primary system language rather than region or secondary languages", () => {
  for (const locale of [
    "zh",
    "zh-CN",
    "zh-Hans-CN",
    "zh-Hant-TW",
    "zh_HK",
    "ZH-SG",
  ])
    assert.equal(initialLanguage([locale]), "zh-CN", locale);
  for (const languages of [
    [],
    ["en-US"],
    ["fr-FR"],
    ["en-CN"],
    ["en-US", "zh-CN"],
  ])
    assert.equal(initialLanguage(languages), "en", JSON.stringify(languages));
});

test("first selection is saved and manual preferences survive a different system language", async () => {
  const directory = await mkdtemp(join(tmpdir(), "postrove-language-"));
  try {
    const initial = new Preferences(directory, ["zh-Hant-TW"]);
    await initial.open();
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, "preferences.json"), "utf8")),
      {
        language: "zh-CN",
        readingLanguage: "app",
        taskBrowserVisible: false,
      },
    );
    const englishSystem = new Preferences(directory, ["en-US"]);
    await englishSystem.open();
    assert.equal(englishSystem.language, "zh-CN");
    assert.equal(englishSystem.resolvedReadingLanguage, "zh-CN");
    await englishSystem.save("en");
    await englishSystem.saveReadingLanguage("zh-CN");
    await englishSystem.saveTaskBrowserVisible(true);
    const chineseSystem = new Preferences(directory, ["zh-CN"]);
    await chineseSystem.open();
    assert.deepEqual(chineseSystem.view(), {
      language: "en",
      readingLanguage: "zh-CN",
      taskBrowserVisible: true,
    });
    assert.equal(chineseSystem.resolvedReadingLanguage, "zh-CN");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a preference file without language gains the system default and keeps its other settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "postrove-language-"));
  try {
    const path = join(directory, "preferences.json");
    await writeFile(
      path,
      JSON.stringify({ readingLanguage: "en", taskBrowserVisible: true }),
    );
    const preferences = new Preferences(directory, ["zh-CN"]);
    await preferences.open();
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      language: "zh-CN",
      readingLanguage: "en",
      taskBrowserVisible: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid saved preferences fail loading and retain the original bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "postrove-language-"));
  try {
    const path = join(directory, "preferences.json");
    for (const raw of ["{broken", "null", '"en"', '{"language":"fr"}']) {
      await writeFile(path, raw);
      await assert.rejects(new Preferences(directory, ["zh-CN"]).open());
      assert.equal(await readFile(path, "utf8"), raw);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
