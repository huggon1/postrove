import {
  sourceSchema,
  webUrlSchema,
  xhsShortUrlSchema,
  type SourceContent,
} from "../../shared/source-contracts";
import {
  videoIdentity,
  videoMatchesUrl,
  parseVideoArtifactKey,
} from "../../shared/video-contracts";
import type { BrowserCapture } from "./browser-agent";

export interface CollectionIdentity {
  url: string;
  browserUrl: string;
  includeReferences: boolean;
}
export interface SourceReaderCapture {
  requestedUrl: string;
  attemptId: string;
  source: SourceContent;
}

/** Recover only a completed, Main-owned source-reader capture of this main video. */
export function recoverCapturedVideo(
  collection: CollectionIdentity | undefined,
  attemptId: string,
  readers: Map<string, SourceReaderCapture>,
  captures: Map<string, BrowserCapture>,
  navigations: Map<string, string>,
) {
  if (!collection) return;
  const candidates = [...readers].filter(([id, reader]) => {
    const capture = captures.get(id);
    const parsed = sourceSchema.safeParse(reader.source);
    if (
      !capture?.sourceReader ||
      !parsed.success ||
      reader.attemptId !== attemptId ||
      !capture.markdown.trim() ||
      capture.markdown !== parsed.data.markdown
    )
      return false;
    const source = parsed.data;
    const evidence = source.evidence;
    const video =
      evidence && "video" in evidence
        ? evidence.video
        : videoIdentity(source.resolvedSourceUrl ?? source.sourceUrl);
    if (!video || video.platform !== source.platform) return false;
    if (
      evidence &&
      (parseVideoArtifactKey(evidence.artifactKey)?.attemptId !== attemptId ||
        evidence.captureId !== id)
    )
      return false;
    const matches = (url: string) =>
      evidence && "video" in evidence
        ? videoMatchesUrl(evidence.video, url)
        : videoIdentity(url)?.sourceKey === video.sourceKey;
    if (!matches(reader.requestedUrl)) return false;
    const mainPage =
      navigations.get(collection.browserUrl) ?? collection.browserUrl;
    if (!matches(mainPage)) return false;
    if (videoIdentity(collection.url)) return matches(collection.url);
    return (
      xhsShortUrlSchema.safeParse(collection.url).success &&
      navigations.has(collection.browserUrl) &&
      video.platform === "xiaohongshu"
    );
  });
  // Repeated reads can include a metadata checkpoint and a later speech capture.
  const coverage = (source: SourceContent) =>
    source.evidence
      ? source.evidence.transcriptCoverage === "complete"
        ? 2
        : 1
      : 0;
  candidates.sort(
    ([, left], [, right]) =>
      coverage(right.source) - coverage(left.source) ||
      (right.source.evidence?.segments.reduce(
        (size, segment) => size + segment.text.length,
        0,
      ) ?? 0) -
        (left.source.evidence?.segments.reduce(
          (size, segment) => size + segment.text.length,
          0,
        ) ?? 0) ||
      (right.source.markdown?.length ?? 0) -
        (left.source.markdown?.length ?? 0),
  );
  const selected = candidates[0];
  if (!selected) return;
  const [id, reader] = selected;
  const source = reader.source;
  const materials: {
    role: string;
    url: string;
    title: string;
    sourceIdentity?: string;
    sourceCaptureIds?: string[];
    completeness?: string;
    completenessNote?: string;
    citedFromCaptureId?: string;
    error?: string;
  }[] = [
    {
      role: "main",
      url: collection.url,
      title: source.title || source.sourceIdentity || source.sourceUrl,
      sourceIdentity: source.sourceIdentity,
      sourceCaptureIds: [id],
      completeness: source.completeness,
      completenessNote: source.completenessNote,
    },
  ];
  if (collection.includeReferences) {
    const seen = new Set([collection.url, source.sourceUrl]);
    for (const link of captures.get(id)!.links) {
      if (
        !webUrlSchema.safeParse(link.url).success ||
        seen.has(link.url) ||
        (!!videoIdentity(link.url) &&
          videoIdentity(link.url)?.sourceKey ===
            videoIdentity(source.resolvedSourceUrl ?? source.sourceUrl)
              ?.sourceKey)
      )
        continue;
      seen.add(link.url);
      materials.push({
        role: "reference",
        url: link.url,
        title: link.title.slice(0, 500),
        citedFromCaptureId: id,
        error: "pending",
      });
    }
  }
  return { materials };
}
