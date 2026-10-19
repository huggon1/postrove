import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { join, basename, resolve, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { FocusSearchReport } from "../../shared/focus-search-contracts";
import type { ForwardingTaskDetail } from "../../shared/forwarding-view-contracts";

export type ResultKind = "search" | "reading";
type Package = {
  kind: ResultKind;
  runId: string;
  admittedAt: string;
  input: unknown;
  markdown: string;
  sources: { name: string; markdown: string }[];
  status: string;
  assets?: { url: string; cachedUrl?: string }[];
};

function rebaseLinks(markdown: string, prefix: string) {
  return markdown.replace(/(\]\(\s*<?)(assets|sources)\//g, `$1${prefix}$2/`);
}

/** Terminal packages are immutable; latest follows admission order, including after restart. */
export class ResultPublisher {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private root: string,
    private imageRoot?: string,
  ) {}
  path(kind: ResultKind, runId: string) {
    return join(this.root, kind, runId, "result.md");
  }
  publishSearch(report: FocusSearchReport) {
    if (!report.finishedAt) return Promise.resolve(undefined);
    const sources = report.sections.flatMap((section) =>
      section.candidates.map((source) => ({
        name: source.candidateId,
        markdown: `# ${source.title}\n\n${source.url}\n\n${source.description}\n`,
      })),
    );
    const markdown =
      `# ${report.question}\n\n${report.createdAt} · ${report.status}\n\n` +
      report.sections
        .map((section) => {
          const name = section.platform === "x" ? "Grok" : "点点";
          return (
            `## ${name} · ${section.promptLanguage}\n\n${section.readingReply || section.rawReply || section.error || section.state}\n\n` +
            (section.processingIssue
              ? `Processing: ${section.processingIssue}\n\n`
              : "") +
            (section.readingReply
              ? `<details><summary>Original reply</summary>\n\n${section.rawReply}\n\n</details>\n\n`
              : "") +
            (section.candidates.length
              ? `### Sources\n\n` +
                section.candidates
                  .map(
                    (source) =>
                      `- [${source.title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${source.url}) — [saved reference](sources/${source.candidateId}.md)`,
                  )
                  .join("\n") +
                "\n\n"
              : "") +
            `Receipt: ${section.state}; citations: ${section.citationExtraction?.state ?? "unknown"}${section.failureStage ? `; stage: ${section.failureStage}` : ""}\n`
          );
        })
        .join("\n");
    return this.publish({
      kind: "search",
      runId: report.taskId,
      admittedAt: report.createdAt,
      input: {
        question: report.question,
        outputLanguage: report.outputLanguage,
        sections: report.sections.map(
          ({
            sectionId,
            advisorId,
            connectionId,
            promptLanguage,
            prompt,
            skillRevision,
            promptRevision,
            checkpoint,
          }) => ({
            sectionId,
            advisorId,
            connectionId,
            promptLanguage,
            prompt,
            skillRevision,
            promptRevision,
            checkpoint,
          }),
        ),
      },
      markdown,
      sources,
      status: report.status ?? "failed",
    });
  }
  publishReading(detail: ForwardingTaskDetail) {
    const task = detail.task;
    if (!task.finishedAt) return Promise.resolve(undefined);
    const materials = task.report?.materials ?? detail.partial.materials ?? [];
    const sources = materials.map((material, index) => ({
      name: `material-${index + 1}`,
      markdown: `# ${material.title}\n\n${material.url}\n\n${material.source?.markdown ?? material.chunks.map((chunk) => chunk.original).join("\n\n")}\n`,
    }));
    const markdown =
      `# ${materials[0]?.title || task.target.sourceUrl}\n\n${task.target.sourceUrl}\n\n${task.createdAt} · ${task.state}\n\n` +
      materials
        .map(
          (material, index) =>
            `## ${material.title}\n\n${material.summary}\n\n${material.chunks.map((chunk) => chunk.translated || chunk.original).join("\n\n") || material.source?.markdown || ""}\n\n[Original](sources/material-${index + 1}.md) · ${material.state}\n${material.issue ? `\n${material.issue}\n` : ""}`,
        )
        .join("\n") +
      (task.message ? `\nReceipt: ${task.message}\n` : "");
    return this.publish({
      kind: "reading",
      runId: task.attemptId ?? task.resultId,
      admittedAt: task.attemptStartedAt ?? task.createdAt,
      input: {
        url: task.target.sourceUrl,
        outputLanguage: task.outputLanguage,
        taskId: task.taskId,
      },
      markdown,
      sources,
      status: task.state,
      assets: materials.flatMap((material) => material.source?.images ?? []),
    });
  }
  private publish(input: Package): Promise<string> {
    const operation = this.queue.then(async () => {
      const parent = join(this.root, input.kind);
      const destination = join(parent, input.runId);
      await mkdir(parent, { recursive: true, mode: 0o700 });
      let exists = false;
      try {
        await readFile(join(destination, "manifest.json"));
        exists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (!exists) {
        const staging = join(parent, `.publish-${randomUUID()}`);
        await mkdir(join(staging, "sources"), { recursive: true, mode: 0o700 });
        try {
          const localize = async (markdown: string) => {
            if (!this.imageRoot) return markdown;
            for (const asset of input.assets ?? [])
              if (asset.cachedUrl)
                markdown = markdown.split(asset.url).join(asset.cachedUrl);
            for (const match of markdown.matchAll(
              /postrove-image:\/\/[^\s)"<>]+/g,
            )) {
              let name: string;
              try {
                name = decodeURIComponent(
                  new URL(match[0]).pathname.replace(/^\//, "") ||
                    new URL(match[0]).hostname,
                );
              } catch {
                continue;
              }
              const source = resolve(this.imageRoot, name);
              if (
                !source.startsWith(resolve(this.imageRoot) + sep) ||
                basename(name) !== name
              )
                continue;
              let extension = "";
              try {
                const mime = await readFile(source + ".type", "utf8");
                extension =
                  (
                    {
                      "image/png": ".png",
                      "image/jpeg": ".jpg",
                      "image/gif": ".gif",
                      "image/webp": ".webp",
                      "image/avif": ".avif",
                    } as Record<string, string>
                  )[mime] ?? "";
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                  throw error;
              }
              const localName = basename(source) + extension;
              try {
                await mkdir(join(staging, "assets"), {
                  recursive: true,
                  mode: 0o700,
                });
                await copyFile(source, join(staging, "assets", localName));
                markdown = markdown.split(match[0]).join(`assets/${localName}`);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                  throw error;
              }
            }
            return markdown;
          };
          const markdown = await localize(input.markdown);
          await writeFile(join(staging, "result.md"), markdown, {
            mode: 0o600,
          });
          await writeFile(
            join(staging, "input.json"),
            JSON.stringify(input.input, null, 2),
            { mode: 0o600 },
          );
          for (const source of input.sources)
            await writeFile(
              join(staging, "sources", `${source.name}.md`),
              rebaseLinks(await localize(source.markdown), "../"),
              { mode: 0o600 },
            );
          await writeFile(
            join(staging, "manifest.json"),
            JSON.stringify(
              {
                version: 1,
                kind: input.kind,
                runId: input.runId,
                admittedAt: input.admittedAt,
                publishedAt: new Date().toISOString(),
                status: input.status,
                sha256: createHash("sha256").update(markdown).digest("hex"),
                resultPath: this.path(input.kind, input.runId),
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
          await rename(staging, destination);
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      const published = JSON.parse(
        await readFile(join(destination, "manifest.json"), "utf8"),
      );
      let latest: { admittedAt: string; runId: string } | undefined;
      try {
        latest = JSON.parse(
          await readFile(join(parent, "latest.json"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        !latest ||
        `${published.admittedAt}/${input.runId}` >=
          `${latest.admittedAt}/${latest.runId}`
      ) {
        const markdown =
          `<!-- Canonical result: ${this.path(input.kind, input.runId)} -->\n\n` +
          (await readFile(this.path(input.kind, input.runId), "utf8"));
        await writeFile(
          join(parent, "latest.md.tmp"),
          rebaseLinks(markdown, `${input.runId}/`),
          { mode: 0o600 },
        );
        await rename(join(parent, "latest.md.tmp"), join(parent, "latest.md"));
        await writeFile(
          join(parent, "latest.json.tmp"),
          JSON.stringify({
            admittedAt: published.admittedAt,
            runId: input.runId,
          }),
          { mode: 0o600 },
        );
        await rename(
          join(parent, "latest.json.tmp"),
          join(parent, "latest.json"),
        );
      }
      return this.path(input.kind, input.runId);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
