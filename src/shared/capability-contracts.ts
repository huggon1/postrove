import type { SpeechIssueCode, SpeechReadiness } from "./speech-contracts";

export const capabilityChannels = {
  view: "capabilities:view",
  speechView: "speech-install:view",
  install: "speech-install:start",
  cancel: "speech-install:cancel",
  chrome: "capabilities:chrome-download",
} as const;

export interface CapabilityView {
  model: boolean;
  chrome: boolean;
  readers: { youtube: boolean; bilibili: boolean; xiaohongshu: boolean };
  speech: SpeechReadiness;
}

export interface SpeechInstallView {
  state:
    | "idle"
    | "preparing"
    | "downloading"
    | "verifying"
    | "ready"
    | "cancelled"
    | "failed";
  downloadedBytes: number;
  totalBytes: number;
  readiness: SpeechReadiness;
  error?: SpeechIssueCode;
}
