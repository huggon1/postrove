import { z } from "zod";
import { youtubeVideo, bilibiliVideo } from "./source-profiles";

export const videoPlatforms = ["youtube", "bilibili", "xiaohongshu"] as const;
export type VideoPlatform = (typeof videoPlatforms)[number];

export function videoIdentity(raw: string) {
  const youtube = youtubeVideo(raw);
  if (youtube)
    return {
      platform: "youtube" as const,
      id: youtube.id,
      sourceKey: youtube.key,
      url: youtube.url,
    };
  const bilibili = bilibiliVideo(raw);
  if (bilibili)
    return {
      platform: "bilibili" as const,
      id: bilibili.id,
      part: bilibili.part,
      sourceKey: bilibili.key,
      url: bilibili.url,
    };
  try {
    const url = new URL(raw);
    const id = url.pathname.match(
      /^\/(?:explore|discovery\/item|search_result)\/([A-Za-z0-9_-]{8,80})\/?$/,
    )?.[1];
    if (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      ["www.xiaohongshu.com", "xiaohongshu.com"].includes(url.hostname) &&
      id
    )
      return {
        platform: "xiaohongshu" as const,
        id,
        sourceKey: `xiaohongshu:note:${id}`,
        url: `https://www.xiaohongshu.com/explore/${id}`,
      };
  } catch {
    /* Invalid URLs have no video identity. */
  }
  return undefined;
}
export const videoIdentitySchema = z
  .object({
    platform: z.enum(videoPlatforms),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    sourceKey: z.string().max(300),
    url: z.string().url(),
    part: z.number().int().positive().max(999999).optional(),
    aid: z
      .string()
      .regex(/^[1-9]\d{0,19}$/)
      .optional(),
    bvid: z
      .string()
      .regex(/^BV[A-Za-z0-9]{10}$/)
      .optional(),
    cid: z
      .string()
      .regex(/^[1-9]\d{0,19}$/)
      .optional(),
  })
  .strict()
  .refine((value) => {
    const parsed = videoIdentity(value.url);
    return (
      parsed?.platform === value.platform &&
      parsed.id === value.id &&
      parsed.sourceKey === value.sourceKey &&
      parsed.url === value.url &&
      parsed.part === value.part &&
      (value.platform === "bilibili"
        ? value.id.startsWith("BV")
          ? value.bvid === undefined || value.bvid === value.id
          : value.aid === undefined || value.aid === value.id.slice(2)
        : value.cid === undefined &&
          value.aid === undefined &&
          value.bvid === undefined)
    );
  });
export type VideoIdentity = z.infer<typeof videoIdentitySchema>;

export function videoTimestampUrl(video: VideoIdentity, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("invalid_caption_time");
  const time = Math.floor(seconds);
  if (video.platform === "youtube") return `${video.url}&t=${time}s`;
  if (video.platform === "bilibili") return `${video.url}&t=${time}`;
  return video.url;
}
export function parseVideoArtifactKey(key: string) {
  const match = key.match(
    /^([a-f0-9-]{36})\/(youtube|bilibili|xiaohongshu)\/([A-Za-z0-9_-]{1,160})$/,
  );
  return match
    ? {
        attemptId: match[1],
        platform: match[2] as VideoPlatform,
        resource: match[3],
        path: `evidence/${match[2]}/${match[3]}`,
      }
    : undefined;
}
export function videoArtifactKey(
  attemptId: string,
  video: VideoIdentity,
  suffix = "",
) {
  const key = `${attemptId}/${video.platform}/${video.id}${video.part ? `-p${video.part}` : ""}${suffix ? `-${suffix}` : ""}`;
  if (!parseVideoArtifactKey(key))
    throw new Error("Invalid video artifact identity");
  return key;
}

/** BV/av equivalence comes from verified source metadata, while parts stay distinct. */
export function videoMatchesUrl(video: VideoIdentity, raw: string) {
  const other = videoIdentity(raw);
  return (
    !!other &&
    other.platform === video.platform &&
    other.part === video.part &&
    (other.id === video.id ||
      (video.platform === "bilibili" &&
        (other.id === video.bvid ||
          (video.aid !== undefined && other.id === `av${video.aid}`))))
  );
}
