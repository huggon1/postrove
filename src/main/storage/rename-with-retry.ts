import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export async function renameWithRetry(source: string, destination: string) {
  const deadline = Date.now() + 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (
        process.platform !== "win32" ||
        !["EPERM", "EBUSY", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        ) ||
        Date.now() >= deadline
      )
        throw error;
      await delay(Math.min(25 * 2 ** attempt, 200));
    }
  }
}
