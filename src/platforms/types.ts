import type { ReadingDiagnostic } from "../shared/reading-diagnostics";
import type { SourceContent } from "../shared/source-contracts";
export type Platform = SourceContent["platform"];
export type ReadResult = {
  taskId: string;
  platform: Platform;
  sourceUrl: string;
  diagnostic?: ReadingDiagnostic;
} & (
  | { outcome: "content"; content: SourceContent }
  | { outcome: "not_covered" | "failed"; message: string }
);
export interface PlatformAdapter {
  platform: Platform;
  readCapability: "available";
  read(taskId: string, url: string, signal: AbortSignal): Promise<ReadResult>;
}
