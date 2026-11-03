/** Main-process audio service contract. Times are seconds in the original media. */
export type SpeechIssueCode =
  | "unsupported_runtime"
  | "runtime_missing"
  | "runtime_integrity"
  | "model_missing"
  | "model_integrity"
  | "media_unavailable"
  | "media_budget"
  | "duration_budget"
  | "download_failed"
  | "download_integrity"
  | "decode_failed"
  | "invalid_output"
  | "process_failed"
  | "output_budget"
  | "timeout"
  | "cancelled"
  | "busy"
  | "storage_failed";

export interface SpeechSegment {
  id: string;
  start: number;
  end: number;
  /** Original-media recognizer end, retained when its estimate extends past the chunk. */
  recognizerEnd?: number;
  /** Exact recognized text, including source punctuation and whitespace. */
  text: string;
}

export interface SpeechChunk {
  index: number;
  start: number;
  end: number;
  state: "speech" | "no_speech";
  detectedLanguage?: string;
  segments: SpeechSegment[];
}

export interface SpeechResult {
  status: "completed" | "partial" | "unavailable" | "cancelled";
  provenance: "application_asr";
  backend: "whisper.cpp";
  runtimeVersion: string;
  model: string;
  modelSha256: string;
  language: string;
  mediaSha256?: string;
  duration?: number;
  totalChunks?: number;
  chunks: SpeechChunk[];
  segments: SpeechSegment[];
  issue?: { code: SpeechIssueCode; chunkIndex?: number };
}

export interface SpeechReadiness {
  backend: "whisper.cpp";
  runtime: "ready" | "missing" | "invalid" | "unsupported";
  model: "ready" | "missing" | "invalid";
  issue?: SpeechIssueCode;
}
