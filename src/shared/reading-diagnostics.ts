import { z } from "zod";
import { ExecutionFailure } from "./task-failure";

export const readingIssueCodeSchema = z.enum([
  "login_required",
  "verification_required",
  "account_action_required",
  "source_unavailable",
  "access_parameters_missing",
  "captions_missing",
  "content_not_supported",
  "component_missing",
  "component_unavailable",
  "model_not_ready",
  "model_failed",
  "network_failed",
  "http_error",
  "page_parse_failed",
  "capture_incomplete",
  "processing_failed",
  "unknown",
]);
export type ReadingIssueCode = z.infer<typeof readingIssueCodeSchema>;
export const readingStageSchema = z.enum([
  "readiness",
  "access",
  "source",
  "captions",
  "media",
  "transcription",
  "translation",
  "summary",
]);
export type ReadingStage = z.infer<typeof readingStageSchema>;
export const readingRecoveryActionSchema = z.enum([
  "sign_in",
  "complete_verification",
  "complete_account_action",
  "open_source",
  "provide_access_link",
  "setup_component",
  "configure_model",
  "retry_capture",
  "retry_later",
  "resume_processing",
]);
export const readingDiagnosticSchema = z
  .object({
    version: z.literal(1),
    code: readingIssueCodeSchema,
    category: z.enum([
      "login",
      "account_action",
      "source_access",
      "captions",
      "content_type",
      "readiness",
      "network",
      "parsing",
      "processing",
      "unknown",
    ]),
    stage: readingStageSchema,
    actions: z.array(readingRecoveryActionSchema).max(4),
    // Only bounded protocol facts cross the public boundary. Raw errors may carry credentials.
    evidence: z
      .object({
        httpStatus: z.number().int().min(100).max(599).optional(),
        platformCode: z
          .string()
          .regex(/^[a-zA-Z0-9_.-]{1,64}$/)
          .optional(),
        transportCode: z
          .string()
          .regex(/^[a-zA-Z0-9_.-]{1,64}$/)
          .optional(),
        failureCode: z
          .string()
          .regex(/^[a-zA-Z0-9_.-]{1,64}$/)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ReadingDiagnostic = z.infer<typeof readingDiagnosticSchema>;

const categories: Record<ReadingIssueCode, ReadingDiagnostic["category"]> = {
  login_required: "login",
  verification_required: "account_action",
  account_action_required: "account_action",
  source_unavailable: "source_access",
  access_parameters_missing: "source_access",
  captions_missing: "captions",
  content_not_supported: "content_type",
  component_missing: "readiness",
  component_unavailable: "readiness",
  model_not_ready: "readiness",
  model_failed: "processing",
  network_failed: "network",
  http_error: "unknown",
  page_parse_failed: "parsing",
  capture_incomplete: "parsing",
  processing_failed: "processing",
  unknown: "unknown",
};
const actions: Record<ReadingIssueCode, ReadingDiagnostic["actions"]> = {
  login_required: ["sign_in"],
  verification_required: ["complete_verification"],
  account_action_required: ["complete_account_action"],
  source_unavailable: ["open_source"],
  access_parameters_missing: ["provide_access_link"],
  captions_missing: ["open_source"],
  content_not_supported: ["open_source"],
  component_missing: ["setup_component"],
  component_unavailable: ["setup_component", "retry_capture"],
  model_not_ready: ["configure_model"],
  model_failed: ["retry_later"],
  network_failed: ["retry_later"],
  http_error: ["retry_later", "open_source"],
  page_parse_failed: ["retry_capture", "open_source"],
  capture_incomplete: ["retry_capture", "open_source"],
  processing_failed: ["resume_processing"],
  unknown: ["retry_capture", "open_source"],
};
export function readingDiagnostic(
  code: ReadingIssueCode,
  stage: ReadingStage,
  evidence?: ReadingDiagnostic["evidence"],
  hasSource = false,
): ReadingDiagnostic {
  return readingDiagnosticSchema.parse({
    version: 1,
    code,
    category: categories[code],
    stage,
    actions:
      hasSource && (stage === "translation" || stage === "summary")
        ? [
            ...new Set([
              ...actions[code].filter(
                (action) =>
                  action !== "retry_capture" && action !== "open_source",
              ),
              "resume_processing",
            ]),
          ]
        : actions[code],
    ...(evidence ? { evidence } : {}),
  });
}

export class ReadingFailure extends Error {
  constructor(
    public readonly diagnostic: ReadingDiagnostic,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReadingFailure";
  }
}

/** Preserve typed causes before falling back to observed transport facts or unknown. */
export function diagnoseReadingError(
  error: unknown,
  stage: ReadingStage,
  hasSource = false,
): ReadingDiagnostic {
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof ReadingFailure) return current.diagnostic;
    if (current instanceof ExecutionFailure) {
      const code =
        current.code === "model_network"
          ? "network_failed"
          : current.code === "model_auth"
            ? "model_not_ready"
            : "model_failed";
      return readingDiagnostic(
        code,
        stage,
        {
          failureCode: current.code,
          ...(current.diagnostic?.httpStatus
            ? { httpStatus: current.diagnostic.httpStatus }
            : {}),
          ...(current.diagnostic?.transportCode
            ? { transportCode: current.diagnostic.transportCode }
            : {}),
        },
        hasSource,
      );
    }
    if (typeof current !== "object") break;
    const value = current as { code?: unknown; cause?: unknown };
    if (
      typeof value.code === "string" &&
      /^(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/.test(
        value.code,
      )
    )
      return readingDiagnostic(
        "network_failed",
        stage,
        { transportCode: value.code },
        hasSource,
      );
    current = value.cause;
  }
  return readingDiagnostic(
    hasSource ? "processing_failed" : "unknown",
    stage,
    undefined,
    hasSource,
  );
}

/** Legacy issue text remains evidence as saved; its wording establishes no inferred cause. */
export function materialDiagnostic(material: {
  diagnostic?: ReadingDiagnostic;
  issue?: string;
  source?: unknown;
  chunks: { complete: boolean }[];
}): ReadingDiagnostic | undefined {
  if (material.diagnostic) return material.diagnostic;
  if (!material.issue) return undefined;
  return readingDiagnostic(
    "unknown",
    material.source
      ? !material.chunks.length ||
        material.chunks.some((chunk) => !chunk.complete)
        ? "translation"
        : "summary"
      : "source",
    undefined,
    !!material.source,
  );
}
