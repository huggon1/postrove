import { randomUUID } from "node:crypto";
import { executionSchema } from "../shared/model-contracts";
import { contentRequestSchema } from "../shared/content-contracts";
import { runWithPi, resolveModel } from "./pi-runtime";
import { executeContent } from "./content/capabilities";
import { piTraceContext } from "./pi-trace-context";
import { splitMarkdown } from "./content/chunks";

const port = process.parentPort!;
const controller = new AbortController();
let started = false;
port.on("message", ({ data }) => {
  if (data.type === "cancel") {
    controller.abort();
    return;
  }
  if (data.type !== "content" || started) return;
  started = true;
  const run = async () => {
    const config = executionSchema.parse(data.config);
    try {
      const input = contentRequestSchema.parse(data.input);
      const model = await resolveModel(config);
      const budget = Math.max(
        800,
        Math.floor(
          Math.min(
            (model.contextWindow || 32768) / 4,
            (model.maxTokens || 8192) / 2,
          ),
        ),
      );
      const chunks = splitMarkdown(input.text, budget);
      let chunkIndex: number | undefined;
      const call = (text: string, system: string) =>
        runWithPi(
          config,
          randomUUID(),
          controller.signal,
          text,
          system,
          undefined,
          undefined,
          [],
          undefined,
          1,
          undefined,
          {
            trace: {
              taskId: data.taskId,
              stage: input.operation,
              targetLanguage: input.targetLanguage,
              chunkIndex,
              repair: system.includes(" Repair the draft using the original."),
            },
          },
        );
      if (
        input.operation === "translate_question" ||
        input.operation === "structure_content" ||
        input.operation === "introduce_content"
      ) {
        if (input.text.length > budget * 3)
          throw new Error("Content exceeds structured operation budget");
        port.postMessage({
          type: "result",
          value: await executeContent(input, call),
        });
      } else {
        const output: string[] = [];
        for (const [index, text] of chunks.entries()) {
          chunkIndex = chunks.length > 1 ? index : undefined;
          output.push(await executeContent({ ...input, text }, call));
        }
        port.postMessage({ type: "result", value: output.join("\n\n") });
      }
    } finally {
      config.credential = "";
    }
  };
  void (
    data.traceRoot
      ? piTraceContext.run(
          { traceRoot: data.traceRoot, taskId: data.taskId },
          run,
        )
      : run()
  ).catch(() =>
    port.postMessage({
      type: "failed",
      message: controller.signal.aborted
        ? "cancelled"
        : "content_processing_failed",
    }),
  );
});
