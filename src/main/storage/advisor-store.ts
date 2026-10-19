import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  advisorSettingsSchema,
  saveAdvisorSettingsSchema,
  type AdvisorSettings,
} from "../../shared/advisor-contracts";

export class AdvisorStore {
  private state: AdvisorSettings = { version: 1, enabled: [] };
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  async open(migrated: AdvisorSettings["enabled"] = []) {
    try {
      this.state = advisorSettingsSchema.parse(
        JSON.parse(await readFile(this.file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Advisor settings could not be read; original file retained",
        );
      await this.save({ enabled: migrated });
    }
  }
  view() {
    return structuredClone(this.state);
  }
  save(raw: unknown) {
    const input = saveAdvisorSettingsSchema.parse(raw);
    const operation = this.queue.then(async () => {
      const next = { version: 1 as const, ...input };
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      await writeFile(this.file + ".tmp", JSON.stringify(next), {
        mode: 0o600,
      });
      await rename(this.file + ".tmp", this.file);
      this.state = next;
      return this.view();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
