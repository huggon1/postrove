import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithRetry } from "../storage/rename-with-retry";
import {
  initialLanguage,
  languageSchema,
  type Language,
} from "../../shared/language";
import {
  preferencesSchema,
  type ApplicationPreferences,
} from "../../shared/preferences-contracts";
import { z } from "zod";
export class Preferences {
  language: Language;
  taskBrowserVisible = false;
  readingLanguage: ApplicationPreferences["readingLanguage"] = "app";
  get resolvedReadingLanguage(): Language {
    return this.readingLanguage === "app"
      ? this.language
      : this.readingLanguage;
  }
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private directory: string,
    systemLanguages: readonly string[] = [],
  ) {
    this.language = initialLanguage(systemLanguages);
  }
  async open() {
    try {
      const saved = JSON.parse(
        await readFile(join(this.directory, "preferences.json"), "utf8"),
      );
      const value = preferencesSchema
        .extend({ language: languageSchema.default(this.language) })
        .parse(saved);
      this.language = value.language;
      this.readingLanguage = value.readingLanguage;
      this.taskBrowserVisible = value.taskBrowserVisible;
      if (saved.language === undefined) await this.update({});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.update({});
    }
  }
  save(language: unknown): Promise<void> {
    const value = languageSchema.parse(language);
    return this.update({ language: value });
  }
  saveTaskBrowserVisible(visible: unknown): Promise<void> {
    return this.update({ taskBrowserVisible: z.boolean().parse(visible) });
  }
  saveReadingLanguage(value: unknown) {
    return this.update({
      readingLanguage: preferencesSchema.shape.readingLanguage.parse(value),
    });
  }
  view(): ApplicationPreferences {
    return {
      language: this.language,
      readingLanguage: this.readingLanguage,
      taskBrowserVisible: this.taskBrowserVisible,
    };
  }
  private update(patch: Partial<ApplicationPreferences>): Promise<void> {
    const operation = this.queue.then(async () => {
      const value = { ...this.view(), ...patch };
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = join(this.directory, "preferences.json");
      await writeFile(path + ".tmp", JSON.stringify(value), {
        mode: 0o600,
      });
      await renameWithRetry(path + ".tmp", path);
      this.language = value.language;
      this.readingLanguage = value.readingLanguage;
      this.taskBrowserVisible = value.taskBrowserVisible;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
