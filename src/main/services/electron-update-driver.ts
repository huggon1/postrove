import { autoUpdater as nativeUpdater } from "electron";
import { autoUpdater } from "electron-updater";
import { createUpdateDriver } from "./update-driver";

export function createElectronUpdateDriver() {
  return createUpdateDriver(process.platform, autoUpdater, nativeUpdater);
}
