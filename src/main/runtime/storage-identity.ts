import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";

export const cachedImageSchemes = ["postrove-image"] as const;

export function installedStorage(appData: string) {
  const directory = join(appData, "Postrove", "profiles", "default");
  if (existsSync(directory)) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Application profile must be a regular directory");
  }
  return directory;
}
