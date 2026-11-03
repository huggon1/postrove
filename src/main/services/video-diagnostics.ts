import {
  readingDiagnostic,
  type ReadingDiagnostic,
  type ReadingStage,
} from "../../shared/reading-diagnostics";

/** Source-reader observations stay separate from background text-model failures. */
export function xiaohongshuVideoDiagnostic(
  reason: string,
  stage: ReadingStage = "source",
): ReadingDiagnostic {
  const evidence = /^[a-zA-Z0-9_.-]{1,64}$/.test(reason)
    ? { failureCode: reason }
    : undefined;
  if (reason === "login_required" || reason === "verification_required")
    return readingDiagnostic(reason, "access", evidence);
  if (reason === "source_unavailable")
    return readingDiagnostic("source_unavailable", "source", evidence);
  if (reason === "access_parameters_invalid")
    return {
      ...readingDiagnostic("unknown", "access", evidence),
      actions: ["provide_access_link"],
    };
  if (reason === "runtime_missing" || reason === "model_missing")
    return readingDiagnostic("component_missing", "readiness", evidence);
  if (
    [
      "runtime_unavailable",
      "speech_runtime_missing",
      "runtime_integrity",
      "model_integrity",
      "unsupported_runtime",
    ].includes(reason)
  )
    return {
      ...readingDiagnostic("unknown", "readiness", evidence),
      actions:
        reason === "unsupported_runtime"
          ? ["open_source"]
          : ["setup_component"],
    };
  if (
    [
      "media_unavailable",
      "xiaohongshu_media_unavailable",
      "media_budget",
      "duration_budget",
      "download_failed",
      "download_integrity",
      "decode_failed",
    ].includes(reason)
  )
    stage = "media";
  if (reason === "speech_output_budget" || reason === "speech_invalid_output")
    stage = "transcription";
  return readingDiagnostic("unknown", stage, evidence);
}
