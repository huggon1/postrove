export {
  SpeechService,
  parseWhisperOutput,
  type SpeechBudget,
  type SpeechTranscriber,
  type SpeechTranscriptionRequest,
} from "./service";
export {
  acquireSpeechMedia,
  type StoredMedia,
  type SpeechFetch,
} from "./media";
export { SpeechRuntime, speechRuntimePins } from "./runtime";
export {
  SpeechError,
  runSpeechProcess,
  type SpeechProcessRunner,
} from "./process";
export type {
  SpeechResult,
  SpeechChunk,
  SpeechSegment,
  SpeechReadiness,
  SpeechIssueCode,
} from "../../../shared/speech-contracts";
