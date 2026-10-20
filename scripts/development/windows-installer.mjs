import { spawn } from "node:child_process";

// NSIS consumes its final directory argument from the raw Windows command line.
export const invokeNsis = (file, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      argv0: `"${file}"`,
      windowsVerbatimArguments: true,
      windowsHide: true,
      stdio: "ignore",
      timeout: 180000,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(Error(`NSIS exited with ${signal ?? code}`));
    });
  });
