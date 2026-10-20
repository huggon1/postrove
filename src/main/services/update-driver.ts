import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { CancellationToken } from "builder-util-runtime";
import type { AppUpdater } from "electron-updater";
import type { autoUpdater as nativeUpdater } from "electron";
import type { UpdateDriver } from "./application-updates";

type Transport = Pick<
  AppUpdater,
  | "autoDownload"
  | "autoInstallOnAppQuit"
  | "allowDowngrade"
  | "allowPrerelease"
  | "disableWebInstaller"
  | "logger"
  | "on"
  | "removeListener"
  | "checkForUpdates"
  | "downloadUpdate"
  | "quitAndInstall"
>;
type NativeStaging = Pick<
  typeof nativeUpdater,
  "once" | "removeListener" | "checkForUpdates"
>;

export function createUpdateDriver(
  platform: NodeJS.Platform,
  updater: Transport,
  native: NativeStaging,
): UpdateDriver {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  // Errors can contain private paths and signed URLs. The update service owns UI feedback.
  updater.logger = null;
  updater.on("error", () => {});
  let staged = false;
  let installer: { path: string; sha512: string } | undefined;
  let expectedDigest: string | undefined;
  return {
    async check() {
      const result = await updater.checkForUpdates();
      if (!result || !result.isUpdateAvailable) return;
      const info = result.updateInfo;
      const file = info.files.find((file) =>
        file.url.endsWith(platform === "win32" ? ".exe" : ".zip"),
      );
      if (!file) throw Error("Update is missing its platform package");
      expectedDigest = file.sha512;
      return {
        version: info.version,
        notes:
          typeof info.releaseNotes === "string"
            ? info.releaseNotes
            : (info.releaseNotes
                ?.map((note) => `## ${note.version}\n\n${note.note}`)
                .join("\n\n") ?? ""),
        size: file.size,
        publishedAt: info.releaseDate,
      };
    },
    async download(signal, progress) {
      const token = new CancellationToken();
      const cancel = () => token.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      updater.on("download-progress", progress);
      installer = undefined;
      try {
        const paths = await updater.downloadUpdate(token);
        if (platform === "win32") {
          const path = paths.find((path) =>
            path.toLowerCase().endsWith(".exe"),
          );
          if (!path || !expectedDigest)
            throw Error("Downloaded installer is missing");
          installer = { path, sha512: expectedDigest };
        }
      } finally {
        signal.removeEventListener("abort", cancel);
        updater.removeListener("download-progress", progress);
      }
    },
    async prepareInstall() {
      if (platform === "win32") {
        // NSIS already verifies download and configured publisher identity. Recheck
        // the staged bytes after any wait for active application work to finish.
        if (!installer) throw Error("Downloaded installer is missing");
        const hash = createHash("sha512");
        for await (const bytes of createReadStream(installer.path))
          hash.update(bytes);
        if (hash.digest("base64") !== installer.sha512)
          throw Error("Installer checksum differs");
        return;
      }
      if (staged) return;
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          native.removeListener("update-downloaded", ready);
          native.removeListener("error", failed);
        };
        const ready = () => {
          staged = true;
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(Error("Native update validation failed"));
        };
        const timeout = setTimeout(failed, 120000);
        native.once("update-downloaded", ready);
        native.once("error", failed);
        try {
          native.checkForUpdates();
        } catch {
          failed();
        }
      });
    },
    quitAndInstall() {
      if (platform === "win32") updater.quitAndInstall(true, true);
      else updater.quitAndInstall();
    },
  };
}
