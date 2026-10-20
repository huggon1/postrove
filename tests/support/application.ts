import { _electron as electron } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Chinese-control tests own their fixture language rather than the host's locale.
// Saved preferences, including selections made during a test, keep precedence.
export async function launchChineseApplication(
  options: Parameters<typeof electron.launch>[0],
) {
  const profile = options?.env?.POSTROVE_TEST_DATA;
  if (profile) {
    await mkdir(profile, { recursive: true });
    try {
      await writeFile(
        join(profile, "preferences.json"),
        JSON.stringify({ language: "zh-CN" }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return electron.launch(options);
}
