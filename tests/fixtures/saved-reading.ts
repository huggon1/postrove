import { createHash } from "node:crypto";
import type { ForwardingState } from "../../src/main/services/forwarding/store";
import type { SourceContent } from "../../src/shared/source-contracts";

export const savedImageUrl = "https://example.com/retained-image.png";
export const savedImageId = createHash("sha256")
  .update(savedImageUrl)
  .digest("hex");
export const savedImagePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZyQAAAAASUVORK5CYII=",
  "base64",
);

export function savedReading(
  cachedUrl = `postrove-image://${savedImageId}`,
): ForwardingState {
  const now = "2026-10-22T00:00:00.000Z";
  const source: SourceContent = {
    sourceUrl: "https://example.com/retained-reading",
    platform: "web",
    title: "Retained reading",
    sourceIdentity: "Fictional author",
    fetchedAt: now,
    markdown: "The saved source stays readable.",
    contentBlocks: [
      { type: "text", text: "The saved source stays readable." },
      { type: "image", imageId: "cover" },
    ],
    images: [{ imageId: "cover", url: savedImageUrl, alt: "", cachedUrl }],
    completeness: "complete",
    completenessNote: "Fictional saved source",
  };
  const material = {
    id: "main",
    role: "main" as const,
    url: source.sourceUrl,
    title: source.title!,
    source,
    chunks: [
      {
        index: 0,
        original: source.markdown!,
        translated: source.markdown!,
        complete: true,
      },
    ],
    summary: "Retained source summary.",
    state: "completed" as const,
  };
  return structuredClone({
    version: 1,
    tasks: [
      {
        taskId: "11111111-1111-4111-8111-111111111111",
        materialId: "22222222-2222-4222-8222-222222222222",
        resultId: "33333333-3333-4333-8333-333333333333",
        target: { sourceUrl: source.sourceUrl, entry: "app" },
        state: "completed",
        phase: "已保存",
        source,
        materials: [material],
        report: { source, materials: [material], outputLanguage: "en" },
        activities: [],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      },
    ],
  });
}
