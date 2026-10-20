import type { Language } from "./language";

export const sourceProfiles = {
  x: {
    name: "X",
    revision: 1,
    enhancement: {
      "zh-CN": "请基于相关 X 帖子回答，并附原帖链接。",
      en: "Answer using relevant X posts and include links to the original posts.",
    },
  },
  xiaohongshu: {
    name: "小红书",
    revision: 1,
    enhancement: {
      "zh-CN": "请基于相关小红书笔记回答，并附原笔记链接。",
      en: "Answer using relevant Xiaohongshu notes and include links to the original notes.",
    },
  },
  youtube: {
    name: "YouTube",
    revision: 1,
    enhancement: {
      "zh-CN":
        "请搜索 YouTube 相关视频并据此回答，附原视频链接和适用的时间点。",
      en: "Search YouTube for relevant videos, answer from them, and include original video links with timestamps where applicable.",
    },
  },
  reddit: {
    name: "Reddit",
    revision: 1,
    enhancement: {
      "zh-CN": "请基于相关 Reddit 帖子和评论回答，并附原始链接。",
      en: "Answer using relevant Reddit posts and comments and include their original links.",
    },
  },
} as const;
export type SourceProfileId = keyof typeof sourceProfiles;
export const sourceEnhancement = (id: SourceProfileId, language: Language) =>
  sourceProfiles[id].enhancement[language];

function secureUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
export function youtubeVideo(raw: string) {
  const url = secureUrl(raw);
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  const id = ["youtu.be", "www.youtu.be"].includes(host)
    ? url.pathname.slice(1).replace(/\/$/, "")
    : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)
      ? url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(
            /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/,
          )?.[1]
      : undefined;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return undefined;
  const rawTime =
    url.searchParams.get("t") ??
    url.searchParams.get("start") ??
    url.hash.match(/^#t=(.+)$/)?.[1];
  let seconds = 0;
  if (rawTime && /^\d+(?:s)?$/.test(rawTime)) seconds = parseInt(rawTime, 10);
  else if (rawTime && /^(?:\d+h)?(?:\d+m)?(?:\d+s)?$/.test(rawTime)) {
    seconds =
      Number(rawTime.match(/(\d+)h/)?.[1] ?? 0) * 3600 +
      Number(rawTime.match(/(\d+)m/)?.[1] ?? 0) * 60 +
      Number(rawTime.match(/(\d+)s/)?.[1] ?? 0);
  }
  if (!Number.isSafeInteger(seconds) || seconds < 0) seconds = 0;
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  return {
    id,
    key: `youtube:video:${id}`,
    url: canonical,
    locator: seconds > 0 ? `${canonical}&t=${seconds}s` : canonical,
  };
}
export function redditPost(raw: string) {
  const url = secureUrl(raw);
  if (
    !url ||
    ![
      "reddit.com",
      "www.reddit.com",
      "old.reddit.com",
      "new.reddit.com",
      "sh.reddit.com",
    ].includes(url.hostname)
  )
    return undefined;
  const match = url.pathname.match(
    /^\/(?:r\/([A-Za-z0-9_]+)\/)?comments\/([a-z0-9]+)(?:\/([^/]*)(?:\/([a-z0-9]+))?)?\/?$/i,
  );
  if (!match) return undefined;
  const [, community, post, , comment] = match;
  const base = `https://www.reddit.com/${community ? `r/${community}/` : ""}comments/${post.toLowerCase()}/`;
  return {
    key: `reddit:${comment ? "comment" : "post"}:${(comment || post).toLowerCase()}`,
    url: comment ? `${base}_/${comment.toLowerCase()}/` : base,
  };
}
export function sourcePlatform(
  raw: string,
): SourceProfileId | "github" | "web" {
  const url = secureUrl(raw);
  if (!url) return "web";
  if (
    ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
      url.hostname,
    )
  )
    return "x";
  if (["xiaohongshu.com", "www.xiaohongshu.com"].includes(url.hostname))
    return "xiaohongshu";
  if (youtubeVideo(raw)) return "youtube";
  if (redditPost(raw)) return "reddit";
  return url.hostname === "github.com" ? "github" : "web";
}
