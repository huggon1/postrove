import {
  advisors,
  type AdvisorId,
  type PlatformConnectionId,
} from "../../shared/advisor-contracts";
import type { CapabilityView } from "../../shared/capability-contracts";

export const capabilityPlatforms = [
  { id: "x", name: "X", mark: "𝕏", connection: "x-grok" },
  {
    id: "xiaohongshu",
    name: "小红书",
    mark: "红",
    connection: "xiaohongshu-diandian",
  },
  { id: "youtube", name: "YouTube", mark: "▶", connection: "gemini-web" },
  { id: "reddit", name: "Reddit", mark: "r", connection: "reddit-web" },
  { id: "github", name: "GitHub", mark: "⌘" },
  { id: "bilibili", name: "Bilibili", mark: "哔" },
  { id: "web", name: "其他网页", mark: "↗" },
] as const;
export type CapabilityPlatform = (typeof capabilityPlatforms)[number];
export type RequirementId =
  "model" | "chrome" | "account" | "experts" | "reader" | "speech";
export interface CapabilityRequirement {
  id: RequirementId;
  label: string;
  ready: boolean;
}
export interface CapabilityGroup {
  name: string;
  requirements: CapabilityRequirement[];
  ready: boolean;
}
export function capabilityGroups(
  platform: CapabilityPlatform,
  view: CapabilityView,
  signedIn: boolean,
  enabled: readonly AdvisorId[],
): CapabilityGroup[] {
  const base: CapabilityRequirement[] = [
    { id: "model", label: "后台模型", ready: view.model },
    { id: "chrome", label: "Chrome", ready: view.chrome },
  ];
  const account: CapabilityRequirement = {
    id: "account",
    label: "平台账号",
    ready: signedIn,
  };
  const speech: CapabilityRequirement = {
    id: "speech",
    label: "语音转文字",
    ready: view.speech.runtime === "ready" && view.speech.model === "ready",
  };
  const reader: CapabilityRequirement = {
    id: "reader",
    label: platform.id === "xiaohongshu" ? "视频读取组件" : "字幕读取组件",
    ready:
      platform.id === "bilibili" ? view.readers.bilibili : view.readers.youtube,
  };
  const group = (
    name: string,
    extra: CapabilityRequirement[] = [],
  ): CapabilityGroup => {
    const requirements = [...base, ...extra];
    return {
      name,
      requirements,
      ready: requirements.every((item) => item.ready),
    };
  };
  const groups: CapabilityGroup[] =
    platform.id === "x"
      ? [group("公开帖子"), group("账号可见帖子", [account])]
      : platform.id === "xiaohongshu"
        ? [
            group("公开图文笔记"),
            group("账号可见笔记", [account]),
            group("增强图文读取", [
              {
                id: "reader",
                label: "图文读取组件",
                ready: view.readers.xiaohongshu,
              },
            ]),
            group("视频转录", [reader, speech]),
          ]
        : platform.id === "youtube"
          ? [
              group("视频信息与网页字幕"),
              group("原始字幕", [reader]),
              group("视频转录", [reader, speech]),
            ]
          : platform.id === "reddit"
            ? [group("帖子与评论"), group("账号可见内容", [account])]
            : platform.id === "github"
              ? [group("仓库 README")]
              : platform.id === "bilibili"
                ? [
                    group("视频信息"),
                    group("原始字幕", [reader]),
                    group("视频转录", [reader, speech]),
                  ]
                : [group("网页正文与图片")];
  if ("connection" in platform) {
    const connection: PlatformConnectionId = platform.connection;
    const selected = advisors.filter(
      (item) => item.connectionId === connection && enabled.includes(item.id),
    );
    const experts: CapabilityRequirement = {
      id: "experts",
      label: "语言专家",
      ready: selected.length > 0,
    };
    const names = {
      "x-grok": "Grok 提问",
      "xiaohongshu-diandian": "点点提问",
      "gemini-web": "Gemini 提问",
      "reddit-web": "Reddit AI 提问",
    };
    groups.push(
      group(names[connection], [
        ...(connection === "reddit-web" ? [] : [account]),
        experts,
      ]),
    );
  }
  return groups;
}

export const capabilityRanges: Record<CapabilityPlatform["id"], string> = {
  x: "公开帖子与串文的可见范围由来源页面决定。",
  xiaohongshu: "视频转录读取音频中的口述内容；画面内容另行查看。",
  youtube: "缺少字幕时转录可访问的音频；画面内容另行查看。",
  reddit: "读取目标帖子或评论及必要上下文。账号访问范围由社区决定。",
  github: "读取公开仓库的默认 README。",
  bilibili: "字幕与音频权限分别确认；转录保留分 P 和时间点。",
  web: "读取可访问的页面和一层直接引用。",
};
