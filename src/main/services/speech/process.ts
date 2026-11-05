import { spawn } from "node:child_process";
import type { SpeechIssueCode } from "../../../shared/speech-contracts";

export class SpeechError extends Error {
  constructor(public readonly code: SpeechIssueCode) {
    super(code);
    this.name = "SpeechError";
  }
}

export interface SpeechProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes?: number;
}
export type SpeechProcessRunner = (
  request: SpeechProcessRequest,
) => Promise<void>;

/** A stopped call settles after the child exits, so cleanup never races its writes. */
export const runSpeechProcess: SpeechProcessRunner = async (request) => {
  if (request.signal.aborted) throw new SpeechError("cancelled");
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        LANG: "en_US.UTF-8",
      },
    });
    let failure: SpeechIssueCode | undefined;
    let size = 0;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (code: SpeechIssueCode) => {
      if (failure) return;
      failure = code;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
      killTimer.unref();
    };
    const abort = () => stop("cancelled");
    request.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("timeout"), request.timeoutMs);
    timer.unref();
    const consume = (bytes: Buffer) => {
      size += bytes.length;
      if (size > (request.maxOutputBytes ?? 1_048_576)) stop("output_budget");
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", () => {
      failure ??= "process_failed";
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      request.signal.removeEventListener("abort", abort);
      if (failure || code !== 0)
        reject(new SpeechError(failure ?? "process_failed"));
      else resolve();
    });
    if (request.signal.aborted) abort();
  });
};
