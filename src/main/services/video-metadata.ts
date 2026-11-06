import type { SourceContent } from "../../shared/source-contracts";
import {
  videoIdentity,
  type VideoIdentity,
} from "../../shared/video-contracts";

export interface VideoMetadata {
  title: string;
  uploader?: string;
  description?: string;
  partTitle?: string;
  images?: SourceContent["images"];
  duration?: number;
}

export function videoMetadataMarkdown(metadata: VideoMetadata) {
  return [
    `# ${metadata.title}`,
    metadata.uploader,
    metadata.partTitle && metadata.partTitle !== metadata.title
      ? `## ${metadata.partTitle}`
      : undefined,
    metadata.description,
    ...(metadata.images ?? []).map(
      (image) =>
        `![${image.alt.replaceAll("[", "\\[").replaceAll("]", "\\]")}](<${image.url}>)`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function videoDescriptionReferences(
  description: string,
  video: VideoIdentity,
) {
  return [
    ...new Set(description.match(/https:\/\/[^\s<>"\u0000-\u001f]+/g) ?? []),
  ]
    .map((raw) => raw.replace(/[),.;]+$/, ""))
    .filter((raw) => {
      try {
        const url = new URL(raw);
        return (
          !url.username &&
          !url.password &&
          url.protocol === "https:" &&
          videoIdentity(raw)?.sourceKey !== video.sourceKey
        );
      } catch {
        return false;
      }
    })
    .slice(0, 30)
    .map((url) => ({ url, title: url }));
}
