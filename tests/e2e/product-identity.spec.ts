import { test, expect, _electron as electron } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ChromeProfiles } from "../../src/main/services/chrome-profiles";
import {
  savedReading,
  savedImageId,
  savedImagePng,
} from "../fixtures/saved-reading";

// Failure cases: a fresh profile uses another product's directory; an existing
// profile is shadowed; encryption uses a different identity; saved image URLs
// stop loading; browser login is lost; a restart changes the selected profile.
test("Postrove opens a fresh profile with its own product identity", async ({}, info) => {
  const root = await mkdtemp(join(tmpdir(), "postrove-fresh-"));
  const unrelated = join(root, "OtherProduct/profiles/default");
  await mkdir(unrelated, { recursive: true });
  await writeFile(join(unrelated, "preferences.json"), "other-product-data");
  const entry = join(root, "launch.cjs");
  await writeFile(
    entry,
    `const {app}=require("electron");app.setPath("appData",${JSON.stringify(root)});require(${JSON.stringify(resolve("dist/main/main.cjs"))});`,
  );
  let application;
  try {
    application = await electron.launch({
      args: [entry],
      env: { ...process.env, POSTROVE_RUN_MODE: "review" },
    });
    const page = await application.firstWindow();
    await expect(page.getByRole("navigation")).toBeVisible();
    const identity = await application.evaluate(({ app, Menu }) => ({
      name: app.getName(),
      profile: app.getPath("userData"),
      menu: Menu.getApplicationMenu()?.items[0].label,
    }));
    expect(identity).toEqual({
      name: "Postrove",
      profile: join(root, "Postrove/profiles/default"),
      menu: "Postrove",
    });
    await expect(page.locator(".topbar .brand")).toContainText("postrove");
    expect(await readFile(join(unrelated, "preferences.json"), "utf8")).toBe(
      "other-product-data",
    );
    await page.screenshot({ path: info.outputPath("postrove-fresh.png") });
    await info.attach("fresh-identity", {
      body: JSON.stringify(identity),
      contentType: "application/json",
    });
  } finally {
    await application?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Postrove retains an installed profile, encrypted connection, images and browser login", async ({}, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), "postrove-retained-"));
  const profile = join(root, "Postrove/profiles/default");
  await mkdir(join(profile, "material-images"), { recursive: true });
  await writeFile(
    join(profile, "business-generation.json"),
    JSON.stringify({ generation: "search-follow-v1", state: "committed" }),
  );
  await writeFile(
    join(profile, "preferences.json"),
    JSON.stringify({ language: "en", taskBrowserVisible: false }),
  );
  const retained = JSON.stringify({
    question: "Saved original question",
    answer: "Original platform answer",
    source: "https://x.com/fictional/status/123",
  });
  await writeFile(join(profile, "retained-record.json"), retained);
  const imageId = savedImageId;
  await writeFile(join(profile, "material-images", imageId), savedImagePng);
  await writeFile(
    join(profile, "material-images", imageId + ".type"),
    "image/png",
  );
  await writeFile(
    join(profile, "forwarding.json"),
    JSON.stringify(savedReading()),
  );
  const chrome = new ChromeProfiles();
  const browserRoot = join(profile, "platform-browser/shared");
  const browser = await chrome.connect(browserRoot);
  await browser.contexts()[0].addCookies([
    {
      name: "auth_token",
      value: "fictional-retained-login",
      domain: ".x.com",
      path: "/",
      expires: Date.now() / 1000 + 3600,
    },
  ]);
  await chrome.close(browserRoot, browser);
  const seed = join(root, "seed.cjs");
  await writeFile(
    seed,
    `const {app,BrowserWindow}=require("electron");app.setName("Postrove");app.setPath("userData",${JSON.stringify(profile)});app.whenReady().then(()=>new BrowserWindow({show:false}));`,
  );
  const producer = await electron.launch({
    args: [seed, "--use-mock-keychain"],
  });
  const connection = {
    method: "generic_api",
    baseUrl: "http://127.0.0.1:1",
    api: "openai-completions",
    modelId: "fixture",
    apiKey: "fictional-retained-key",
  };
  await producer.evaluate(
    ({ safeStorage }, input) => {
      process
        .getBuiltinModule("fs")!
        .writeFileSync(
          input.file,
          safeStorage.encryptString(JSON.stringify(input.connection)),
          { mode: 0o600 },
        );
    },
    { file: join(profile, "model-connection.enc"), connection },
  );
  await producer.close();
  const entry = join(root, "launch.cjs");
  await writeFile(
    entry,
    `const {app}=require("electron");app.setPath("appData",${JSON.stringify(root)});require(${JSON.stringify(resolve("dist/main/main.cjs"))});globalThis.fixtureEncryptionIdentity=app.getName();`,
  );
  let application;
  try {
    for (let launch = 0; launch < 2; launch++) {
      application = await electron.launch({
        args: [entry, "--use-mock-keychain"],
        env: { ...process.env, POSTROVE_RUN_MODE: "review" },
      });
      const page = await application.firstWindow();
      await expect(page.getByRole("navigation")).toBeVisible();
      const identity = await application.evaluate(({ app }) => ({
        name: app.getName(),
        profile: app.getPath("userData"),
        encryption: (globalThis as any).fixtureEncryptionIdentity,
      }));
      expect(identity).toEqual({
        name: "Postrove",
        profile,
        encryption: "Postrove",
      });
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Reading", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Retained reading", exact: true }),
      ).toBeVisible();
      const cover = page.locator(".reading-cover img");
      await expect(cover).toHaveAttribute("src", `postrove-image://${imageId}`);
      await expect
        .poll(() =>
          cover.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(1);
      await page.screenshot({
        path: info.outputPath(`retained-reading-${launch}.png`),
      });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("button", { name: "Preferences", exact: true })
        .click();
      await expect(
        page.getByLabel("Interface language", { exact: true }),
      ).toHaveValue("en");
      const width = await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image.naturalWidth;
      }, `postrove-image://${imageId}`);
      expect(width).toBe(1);
      const migrated = JSON.parse(
        await readFile(join(profile, "pi", "connections.json"), "utf8"),
      );
      const native = migrated.connections.find(
        (item: any) => item.id === migrated.activeId,
      );
      expect(native.modelId).toBe(connection.modelId);
      const credential = JSON.parse(
        await readFile(
          join(profile, "pi", "connections", native.id, "auth.json"),
          "utf8",
        ),
      );
      expect(credential["postrove-api"].key).toBe(connection.apiKey);
      const evidence = JSON.parse(
        await readFile(join(profile, "model-connection.migrated.json"), "utf8"),
      );
      expect(evidence).toMatchObject({
        modelId: connection.modelId,
        migratedTo: "pi",
      });
      expect(evidence.apiKey).toBeUndefined();
      expect(
        await readFile(join(profile, "retained-record.json"), "utf8"),
      ).toBe(retained);
      await access(profile);
      const owner = JSON.parse(
        await readFile(join(profile, ".postrove-owner.json"), "utf8"),
      );
      expect(owner.pid).toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath(`retained-settings-${launch}.png`),
      });
      await application.close();
      application = undefined;
      await expect(
        access(join(profile, ".postrove-owner.json")),
      ).rejects.toThrow();
    }
    const restored = await chrome.connect(browserRoot);
    expect(
      (await restored.contexts()[0].cookies()).some(
        (cookie) =>
          cookie.name === "auth_token" &&
          cookie.value === "fictional-retained-login",
      ),
    ).toBe(true);
    await chrome.close(browserRoot, restored);
    await info.attach("retained-profile", {
      body: JSON.stringify({
        result: "passed",
        restarts: 2,
        encryptedConnection: true,
        originalRecordBytes: true,
        cachedImages: true,
        retainedReading: true,
        chromeLogin: true,
        boundary:
          "Fictional credentials and browser cookie; encryption uses Electron's mock keychain",
      }),
      contentType: "application/json",
    });
  } finally {
    await application?.close();
    await rm(root, { recursive: true, force: true });
  }
});
