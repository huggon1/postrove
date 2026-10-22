import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  piLogExecutionSchema,
  type PiLogExecution,
} from "../../../shared/pi-log-contracts";

export { buildPiLogDocument } from "./pi-log-view";

export interface PiLogTask {
  title: string;
  kind?: "focus_search" | "forwarding";
  state?: string;
  sourceUrl?: string;
  createdAt?: string;
}

export interface PiLogSessionDetails {
  stage?: PiLogExecution["stage"];
  platform?: PiLogExecution["platform"];
  materialTitle?: string;
  sourceUrl?: string;
  chunkIndex?: number;
  repair?: boolean;
  attempt?: number;
  recordedName?: string;
  state?: "failed" | "cancelled";
  model?: string;
  startedAt?: string;
  namingSource?: "recorded" | "legacy";
}

export interface PiLogPage {
  file: string;
  runId?: string;
  executionId: string;
  updatedAt: string;
  /** Base64 preserves the complete native document, including inline scripts. */
  html: string;
  details?: PiLogSessionDetails;
}

export interface PiLogDocument {
  taskId: string;
  task?: PiLogTask;
  exportedAt: string;
  sessions: PiLogPage[];
}

export async function readTaskPiLogPages(
  traceRoots: string[],
  taskId: string,
  runIds: string[] = [],
): Promise<PiLogPage[]> {
  const id = z.string().uuid().parse(taskId);
  const identities = new Set([
    id,
    ...runIds.map((runId) => z.string().uuid().parse(runId)),
  ]);
  const pages: PiLogPage[] = [];
  const readDirectory = async (directory: string) => {
    try {
      return await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  for (const [rootIndex, root] of traceRoots.entries()) {
    for (const runId of identities) {
      const taskRoot = join(root, runId);
      const collect = async (directory: string, executionId: string) => {
        for (const entry of await readDirectory(directory)) {
          if (
            !entry.isFile() ||
            !/^(?:session|attempt-\d+)\.html$/.test(entry.name)
          )
            continue;
          const source = join(directory, entry.name);
          const html = await readFile(source, "base64");
          pages.push({
            file: `${rootIndex}-${runId}-${executionId}-${entry.name}`,
            runId,
            executionId,
            updatedAt: (await stat(source)).mtime.toISOString(),
            html,
            details: readPiLogSessionDetails(
              Buffer.from(html, "base64").toString("utf8"),
              runId,
            ),
          });
        }
      };
      await collect(join(taskRoot, "html"), "legacy");
      for (const execution of await readDirectory(
        join(taskRoot, "executions"),
      )) {
        if (
          execution.isDirectory() &&
          z.string().uuid().safeParse(execution.name).success
        )
          await collect(
            join(taskRoot, "executions", execution.name, "html"),
            execution.name,
          );
      }
    }
  }
  return pages.sort(
    (a, b) =>
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.file.localeCompare(b.file, "en", { numeric: true }),
  );
}

const nativeSessionSchema = z.object({
  header: z
    .object({ id: z.string().optional(), timestamp: z.string().optional() })
    .optional(),
  systemPrompt: z.string().optional(),
  entries: z.array(
    z.object({
      type: z.string(),
      customType: z.string().optional(),
      data: z.unknown().optional(),
      name: z.string().optional(),
      message: z
        .object({
          role: z.string(),
          content: z.unknown().optional(),
          model: z.string().optional(),
          stopReason: z.string().optional(),
          diagnostics: z.array(z.object({ type: z.string() })).optional(),
        })
        .optional(),
    }),
  ),
});

/** Read naming evidence from native records; source documents remain intact. */
export function readPiLogSessionDetails(
  html: string,
  taskId: string,
): PiLogSessionDetails {
  try {
    const encoded =
      /<script\b[^>]*\bid=["']session-data["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      )?.[1];
    if (!encoded) return {};
    const parsed = nativeSessionSchema.safeParse(
      JSON.parse(Buffer.from(encoded.trim(), "base64").toString("utf8")),
    );
    if (!parsed.success) return {};
    const native = parsed.data;
    const metadata = native.entries
      .filter(
        (entry) =>
          entry.type === "custom" && entry.customType === "postrove-execution",
      )
      .map((entry) => piLogExecutionSchema.safeParse(entry.data))
      .find((entry) => entry.success && entry.data.taskId === taskId);
    const recorded = metadata?.success ? metadata.data : undefined;
    const system = native.systemPrompt ?? "";
    const user = native.entries.find((entry) => entry.message?.role === "user")
      ?.message?.content;
    const text =
      typeof user === "string"
        ? user
        : Array.isArray(user)
          ? user
              .filter((part) => part?.type === "text")
              .map((part) => part.text)
              .join("\n")
          : "";
    const legacyStage = system.startsWith(
      "Translate the supplied source Markdown faithfully",
    )
      ? "translation"
      : system.startsWith(
            "Write a plain reading introduction for this one material.",
          )
        ? "summary"
        : system.startsWith("You operate shared Chrome for one Postrove task.")
          ? text.startsWith("Collect reading materials for ")
            ? "collect"
            : /Search platform: (x|xiaohongshu)\./.test(text)
              ? "search"
              : undefined
          : undefined;
    const stage = recorded?.stage ?? legacyStage;
    let materialTitle = recorded?.materialTitle;
    if (!materialTitle && stage === "summary") {
      try {
        const input = JSON.parse(text);
        if (typeof input.title === "string")
          materialTitle = input.title.slice(0, 500);
      } catch {
        /* Older inputs can be plain text. */
      }
    }
    const messages = native.entries.flatMap((entry) =>
      entry.message ? [entry.message] : [],
    );
    const last = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    return {
      stage,
      platform:
        recorded?.platform ??
        (stage === "search"
          ? (/Search platform: (x|xiaohongshu)\./.exec(text)?.[1] as
              "x" | "xiaohongshu" | undefined)
          : undefined),
      materialTitle,
      sourceUrl: recorded?.sourceUrl,
      chunkIndex: recorded?.chunkIndex,
      repair: recorded?.repair,
      attempt:
        recorded?.attempt ??
        (Number(/-attempt-(\d+)$/.exec(native.header?.id ?? "")?.[1]) ||
          undefined),
      recordedName: [...native.entries]
        .reverse()
        .find((entry) => entry.type === "session_info")?.name,
      state:
        messages.some((message) =>
          message.diagnostics?.some(
            (diagnostic) => diagnostic.type === "postrove_model_failure",
          ),
        ) || last?.stopReason === "error"
          ? "failed"
          : last?.stopReason === "aborted"
            ? "cancelled"
            : undefined,
      model: last?.model,
      startedAt: native.header?.timestamp,
      namingSource: recorded ? "recorded" : stage ? "legacy" : undefined,
    };
  } catch {
    return {};
  }
}
