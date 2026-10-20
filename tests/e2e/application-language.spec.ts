import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string;
let application: ElectronApplication | undefined;

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "postrove-system-language-"));
});
test.afterEach(async () => {
  await application?.close();
  application = undefined;
  await rm(root, { recursive: true, force: true });
});

async function launch(languages: string[]) {
  const entry = join(root, "launch.cjs");
  // Replace only the OS-language boundary. Initialization, IPC, UI and storage
  // use the production application with a fresh isolated profile.
  await writeFile(
    entry,
    `const {app}=require("electron");app.getPreferredSystemLanguages=()=>${JSON.stringify(languages)};require(${JSON.stringify(resolve("dist/main/main.cjs"))});`,
  );
  application = await electron.launch({
    args: [entry],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: join(root, "profile"),
      POSTROVE_EVAL_DENY_KEYCHAIN: "1",
    },
  });
  return application.firstWindow();
}

for (const scenario of [
  {
    languages: ["en-US", "zh-CN"],
    language: "en",
    settings: "Settings",
    menu: "Show window",
  },
  {
    languages: ["fr-FR"],
    language: "en",
    settings: "Settings",
    menu: "Show window",
  },
  { languages: [], language: "en", settings: "Settings", menu: "Show window" },
  {
    languages: ["zh-Hans-CN"],
    language: "zh-CN",
    settings: "设置",
    menu: "显示窗口",
  },
  {
    languages: ["zh-Hant-TW"],
    language: "zh-CN",
    settings: "设置",
    menu: "显示窗口",
  },
]) {
  test(`fresh profile selects ${scenario.language} for ${scenario.languages.join(", ") || "unavailable system languages"}`, async ({}, info) => {
    const page = await launch(scenario.languages);
    await expect(
      page.getByRole("button", { name: scenario.settings, exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      scenario.language,
    );
    expect(await page.evaluate(() => window.postrove.preferences())).toEqual({
      language: scenario.language,
      readingLanguage: "app",
      taskBrowserVisible: false,
    });
    expect(
      JSON.parse(await readFile(join(root, "profile/preferences.json"), "utf8"))
        .language,
    ).toBe(scenario.language);
    const menu = await application!.evaluate(
      ({ Menu }) => Menu.getApplicationMenu()?.items[0].submenu?.items[0].label,
    );
    expect(menu).toBe(scenario.menu);
    await page.screenshot({ path: info.outputPath("initial-language.png") });
  });
}

test("initial and manual language selections persist across system-language changes", async ({}, info) => {
  let page = await launch(["fr-FR"]);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await application!.close();
  application = undefined;
  page = await launch(["zh-CN"]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByLabel("Interface language", { exact: true }),
  ).toHaveValue("en");
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("zh-CN");
  await expect(page.getByLabel("界面语言", { exact: true })).toHaveValue(
    "zh-CN",
  );
  await expect(page.getByLabel("阅读语言", { exact: true })).toHaveValue("app");
  await application!.close();
  application = undefined;
  page = await launch(["en-US"]);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await expect(page.getByLabel("界面语言", { exact: true })).toHaveValue(
    "zh-CN",
  );
  expect(
    await application!.evaluate(
      ({ Menu }) => Menu.getApplicationMenu()?.items[0].submenu?.items[0].label,
    ),
  ).toBe("显示窗口");
  await page.screenshot({ path: info.outputPath("retained-language.png") });
});
