import { Img, staticFile } from "remotion";
import React, { type CSSProperties, type ReactNode } from "react";

/**
 * Procedural artwork for the story film. Coordinates are CSS pixels.
 * All motion is a pure function of the supplied time (seconds) or progress.
 * Device children occupy the screen below the status bar and above the home bar.
 * At the default 360 × 730 size that content area is 334 × 655 px.
 */
export type StoryLanguage = "zh-CN" | "en";
const C = {
  paper: "#F6F4EE",
  ink: "#1F293D",
  blue: "#5375EA",
  coral: "#EA8B75",
  yellow: "#EFCB76",
  muted: "#8B8D94",
  line: "#E9E8E4",
};
const FONT = '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
const text = (l: StoryLanguage, zh: string, en: string) =>
  l === "zh-CN" ? zh : en;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;

type IconName =
  | "back"
  | "heart"
  | "bookmark"
  | "share"
  | "search"
  | "chevron"
  | "send"
  | "check"
  | "link";
const Icon = ({
  name,
  size = 20,
  fill = false,
  color = "currentColor",
}: {
  name: IconName;
  size?: number;
  fill?: boolean;
  color?: string;
}) => {
  const paths: Record<IconName, ReactNode> = {
    back: <path d="m14 5-7 7 7 7" />,
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
    share: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5" />
        <path d="M5 13v7h14v-7" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    send: (
      <>
        <path d="m3 3 19 9-19 9 4-9-4-9Z" />
        <path d="M7 12h15" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    link: (
      <>
        <path
          d="m10 14 4-4m-6 6-2 2a4.2 4.2 0 0 1-6-6l5-5a4.2 4.2 0 0 1 6 0m2 1 2-2a4.2 4.2 0 0 1 6 6l-5 5a4.2 4.2 0 0 1-6 0"
          transform="translate(1 -1)"
        />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? color : "none"}
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};

export interface PhoneFrameProps {
  children?: ReactNode;
  width?: number;
  height?: number;
  style?: CSSProperties;
  time?: number;
  label?: string;
}

/**
 * An unbranded, front-facing device. Parent can transform/rotate the whole phone.
 * Screen bounds: left/right 13, top 49, bottom 26. Children may use 100% sizing.
 * `time` gently moves a small glass reflection, with no camera shake.
 */
export const PhoneFrame = ({
  children,
  width = 360,
  height = 730,
  style,
  time = 0,
  label,
}: PhoneFrameProps) => (
  <div
    style={{
      position: "relative",
      width,
      height,
      flexShrink: 0,
      fontFamily: FONT,
      color: C.ink,
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: "9px -3px -2px 6px",
        borderRadius: 52,
        background: "#292D35",
        boxShadow: "0 36px 60px -22px #28334455, 0 5px 10px #1F293D19",
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 3,
        height: 42,
        background: "#8D9195",
        left: -3,
        top: 140,
        borderRadius: "3px 0 0 3px",
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 3,
        height: 59,
        background: "#8D9195",
        right: -3,
        top: 158,
        borderRadius: "0 3px 3px 0",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: 9,
        border: "1px solid #B0B2B2",
        borderRadius: 51,
        background:
          "linear-gradient(130deg, #E1E0DB 0%, #8D939A 16%, #E3E2DD 46%, #9B9EA1 85%, #DADBD8 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 4,
          border: "1px solid #F9F9F36B",
          borderRadius: 47,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 9,
          borderRadius: 42,
          background: "#171B24",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 13,
          borderRadius: 38,
          background: "#FFFFFF",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "#FFF" }} />
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 23,
            right: 22,
            height: 19,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            fontWeight: 700,
            zIndex: 5,
          }}
        >
          <span>9:41</span>
          <svg width="45" height="14" viewBox="0 0 45 14" fill="currentColor">
            <rect x="0" y="8" width="3" height="4" rx=".6" />
            <rect x="5" y="5" width="3" height="7" rx=".6" />
            <rect x="10" y="2" width="3" height="10" rx=".6" />
            <path d="M18 4a9 9 0 0 1 13 0l-1.5 1.5a7 7 0 0 0-10 0Zm3 3a5 5 0 0 1 7 0l-1.5 1.5a3 3 0 0 0-4 0Zm3.5 2 2 2-2 2-2-2Z" />
            <rect x="34" y="3" width="9" height="9" rx="2" />
            <rect x="44" y="6" width="1" height="3" rx=".5" />
          </svg>
        </div>
        <div
          style={{
            position: "absolute",
            width: 84,
            height: 23,
            borderRadius: 18,
            background: "#141820",
            left: "50%",
            top: 8,
            transform: "translateX(-50%)",
            zIndex: 6,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 8,
              top: 7,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#202C3B",
              boxShadow: "inset 0 0 0 2px #2C3D50",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 36,
            bottom: 13,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 5,
            left: "50%",
            width: 104,
            height: 4,
            transform: "translateX(-50%)",
            background: "#1F293D",
            borderRadius: 8,
            zIndex: 8,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: "2px 2px auto 2px",
          height: 180,
          borderRadius: "49px 49px 0 0",
          background: `linear-gradient(${108 + Math.sin(time * 0.35) * 4}deg, #FFFFFF1B, #FFFFFF00 42%)`,
          pointerEvents: "none",
        }}
      />
    </div>
    {label && (
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 26px)",
          width: "100%",
          textAlign: "center",
          color: "#787C85",
          fontSize: 17,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
    )}
  </div>
);

export interface ArticleCoverProps {
  tone: "yellow" | "blue";
  style?: CSSProperties;
}

/** Consistent fictional source covers. Yellow identifies the saved long article. */
export const ArticleCover = ({ tone, style }: ArticleCoverProps) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      aspectRatio: "1.5",
      borderRadius: 15,
      overflow: "hidden",
      background: tone === "yellow" ? "#EFCB76" : "#9DB3EF",
      ...style,
    }}
  >
    <Img
      src={staticFile(`demo-cover-${tone}.png`)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  </div>
);

export interface SocialFeedProps {
  language: StoryLanguage;
  platform: "x" | "xiaohongshu";
  /** Vertical article scroll in pixels. Header and action bar stay fixed. */
  scroll: number;
  saved: boolean;
  saveAge?: number;
  time: number;
}

/** A readable long technical source; all author names and article contents are fictional. */
export const SocialFeed = ({
  language,
  platform,
  scroll,
  saved,
  saveAge = 5,
  time,
}: SocialFeedProps) => {
  const x = platform === "x";
  const title = x
    ? text(
        language,
        "先把角色移动和跳跃做出来",
        "Start with movement and jumping",
      )
    : text(
        language,
        "我用 AI 做了一个像素小游戏",
        "My first pixel game with AI",
      );
  const color = x ? C.ink : "#F05B69";
  const paragraphs =
    language === "zh-CN"
      ? [
          "我想用 AI 做个像素游戏。先只做一个场景，让角色能移动、跳跃，再收集一枚金币。",
          "01 先让角色动起来",
          "用简单方块测试移动和碰撞。确定角色能落地以后，再换上像素素材。",
          "02 每加一个动作就运行一次",
          "把速度和跳跃高度分开调整。遇到问题时，告诉 Agent 角色在哪里卡住，以及预期的动作。",
          "03 最后再补地图和美术",
          "下面是每一步的实现记录，包括移动、平台碰撞，以及金币计数。",
        ]
      : [
          "I wanted to build a pixel game with AI. I started with one scene: move, jump, and collect a coin.",
          "01 Get the character moving",
          "Test movement and collisions with simple blocks. Add pixel art after the character can land reliably.",
          "02 Run it after each change",
          "Tune speed and jump height separately. Tell your agent where the character gets stuck and what should happen.",
          "03 Add the map and art later",
          "Here is each step, from movement and platform collisions to collecting the first coin.",
        ];
  const pulse = saved ? 1 + Math.max(0, Math.sin(time * 4)) * 0.035 : 1;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFF",
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 58,
          padding: "0 17px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#FFFFFFF5",
          borderBottom: `1px solid ${C.line}`,
          zIndex: 3,
        }}
      >
        <Icon name="back" size={21} />
        <div
          style={{
            width: 29,
            height: 29,
            borderRadius: 10,
            background: x ? C.ink : C.coral,
            color: "#FFF",
            display: "grid",
            placeItems: "center",
            fontSize: 17,
            fontWeight: 700,
          }}
        >
          {x ? "𝕏" : "小"}
        </div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 650 }}>
          {x
            ? "lin · building things"
            : text(language, "林同学的开发笔记", "Lin · game notes")}
        </div>
        <span style={{ fontSize: 13, color }}>
          {x ? "•••" : text(language, "关注", "Follow")}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 58,
          left: 0,
          right: 0,
          bottom: 53,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "15px 17px 50px",
            transform: `translateY(${-Math.max(0, scroll)}px)`,
          }}
        >
          <ArticleCover
            tone={x ? "blue" : "yellow"}
            style={{ borderRadius: 12, marginBottom: 17 }}
          />
          <div
            style={{
              fontSize: language === "zh-CN" ? 22 : 21,
              lineHeight: 1.44,
              letterSpacing: -0.5,
              fontWeight: 750,
              marginBottom: 12,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 10.5, color: "#9A9BA1", marginBottom: 16 }}>
            {text(
              language,
              "游戏开发 · 开发记录 · 8 分钟阅读",
              "Game dev · Devlog · 8 min read",
            )}
          </div>
          {paragraphs.map((s, i) => (
            <React.Fragment key={s}>
              <p
                style={{
                  fontSize: i % 2 ? 17 : 14.3,
                  lineHeight: i % 2 ? 1.5 : 1.85,
                  fontWeight: i % 2 ? 700 : 400,
                  margin: i % 2 ? "22px 0 8px" : "0 0 14px",
                  color: i % 2 ? C.ink : "#606574",
                }}
              >
                {s}
              </p>
              {i === 2 && (
                <div
                  style={{
                    background: "#222C3D",
                    padding: "15px 13px",
                    borderRadius: 10,
                    fontFamily: "monospace",
                    fontSize: 11.3,
                    lineHeight: 1.9,
                    color: "#D9E2F4",
                    margin: "15px 0",
                  }}
                >
                  <span style={{ color: "#A1BAEF" }}>const</span> player = {"{"}
                  <br />
                  &nbsp; speed: <span style={{ color: "#EFCB76" }}>180</span>,
                  <br />
                  &nbsp; jump: <span style={{ color: "#EFCB76" }}>320</span>,
                  <br />
                  &nbsp; grounded:{" "}
                  <span style={{ color: "#F0B6A4" }}>true</span>
                  <br />
                  {"}"};
                </div>
              )}
            </React.Fragment>
          ))}
          <ArticleCover
            tone="blue"
            style={{ borderRadius: 12, marginTop: 18 }}
          />
        </div>
      </div>
      {saved && saveAge >= 0 && saveAge < 1.15 && (
        <div
          style={{
            position: "absolute",
            bottom: 77,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1F293DEB",
            color: "white",
            padding: "11px 20px",
            borderRadius: 11,
            fontSize: 15,
            zIndex: 8,
            opacity:
              Math.min(1, saveAge / 0.12) *
              (1 - Math.max(0, (saveAge - 0.85) / 0.3)),
          }}
        >
          {text(language, "已收藏", "Saved")}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 53,
          borderTop: `1px solid ${C.line}`,
          background: "#FFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 9px",
          zIndex: 5,
        }}
      >
        <div
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 18,
            padding: "8px 13px",
            color: "#AAAAB0",
            fontSize: 11,
            minWidth: 100,
          }}
        >
          {text(language, "说点什么…", "Add a comment…")}
        </div>
        <div
          style={{
            display: "flex",
            gap: 5,
            alignItems: "center",
            fontSize: 10,
            color: "#777D88",
          }}
        >
          <Icon name="heart" size={19} />
          <span>128</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 5,
            alignItems: "center",
            fontSize: 10,
            color: saved ? "#AD7E21" : "#777D88",
            transform: `scale(${pulse})`,
          }}
        >
          <Icon
            name="bookmark"
            size={20}
            fill={saved}
            color={saved ? C.yellow : "currentColor"}
          />
          <span>{saved ? "257" : "256"}</span>
        </div>
        <Icon name="share" size={19} />
      </div>
    </div>
  );
};

export interface BotMessagesProps {
  language: StoryLanguage;
  /** Seconds into the sending sequence. */ time: number;
}

/** Feishu-like phone chat showing the configured bot's processing acknowledgment. */
export const BotMessages = ({ language, time }: BotMessagesProps) => {
  const sent = ease((time - 0.25) / 0.35);
  const received = ease((time - 1.3) / 0.5);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#F3F5F8",
        fontFamily: FONT,
        color: C.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 62,
          padding: "0 18px",
          gap: 14,
          background: "#FFFFFF",
          borderBottom: "1px solid #E4E8EE",
        }}
      >
        <Icon name="back" size={21} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Postrove</div>
          <div style={{ color: "#949BA8", fontSize: 10, marginTop: 3 }}>
            {text(language, "机器人", "Bot")}
          </div>
        </div>
        <span style={{ fontSize: 20, letterSpacing: 2 }}>•••</span>
      </div>
      <div style={{ padding: "21px 17px" }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: "#A3A8B2",
            marginBottom: 22,
          }}
        >
          09:41
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            opacity: sent,
            transform: `translateY(${18 * (1 - sent)}px)`,
          }}
        >
          <div
            style={{
              maxWidth: 238,
              padding: "13px 14px",
              borderRadius: "14px 3px 14px 14px",
              background: "#DFE7FF",
              boxShadow: "0 2px 4px #1F293D05",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: "#3F63C6",
                lineHeight: 1.7,
                wordBreak: "break-all",
              }}
            >
              https://www.xiaohongshu.com/explore/67f0a34b000000001a012345
            </div>
            <div
              style={{
                fontSize: 9,
                textAlign: "right",
                color: "#8D9CBF",
                marginTop: 5,
              }}
            >
              09:41 <span style={{ color: C.blue }}>✓</span>
            </div>
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              background: C.yellow,
              display: "grid",
              placeItems: "center",
              color: "#6A512C",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            L
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 24,
            opacity: received,
            transform: `translateY(${15 * (1 - received)}px)`,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              background: C.blue,
              color: "#FFF",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 19V5h7a5 5 0 0 1 0 10H6m4-6h4" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ fontSize: 10, color: "#9098A7", margin: "0 0 7px 2px" }}
            >
              Postrove
            </div>
            <div
              style={{
                background: "#FFF",
                border: "1px solid #E5E9F0",
                padding: "12px 13px",
                borderRadius: "3px 13px 13px 13px",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {text(
                language,
                "已收取，正在处理。你可以在 Postrove 中查看进度。",
                "Received and processing. You can check progress in Postrove.",
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "11px 13px",
          borderTop: "1px solid #DFE4EC",
          background: "#FFF",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 23,
            fontSize: 23,
            color: "#A7AFBD",
            textAlign: "center",
          }}
        >
          ＋
        </span>
        <div
          style={{
            height: 33,
            borderRadius: 8,
            border: "1px solid #E5E9F0",
            flex: 1,
            background: "#F9FAFC",
          }}
        />
        <span style={{ color: C.blue }}>
          <Icon name="send" size={20} />
        </span>
      </div>
    </div>
  );
};

export interface TapRippleProps {
  x: number;
  y: number;
  /** 0–1 over roughly 0.6 seconds. */ progress: number;
}

export const TapRipple = ({ x, y, progress }: TapRippleProps) => {
  const p = clamp(progress);
  if (p <= 0 || p >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 24 + p * 62,
          height: 24 + p * 62,
          left: -(24 + p * 62) / 2,
          top: -(24 + p * 62) / 2,
          borderRadius: "50%",
          border: `${2.5 - p}px solid #5375EA`,
          opacity: (1 - p) * 0.8,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -8,
          top: -8,
          width: 16,
          height: 16,
          background: C.blue,
          border: "3px solid #FFFFFF",
          boxShadow: "0 2px 6px #33498224",
          borderRadius: "50%",
          transform: `scale(${1 - p * 0.5})`,
          opacity: (1 - p) * 0.85,
        }}
      />
    </div>
  );
};

export interface PointerProps {
  x: number;
  y: number;
  /** 0–1; 1 depresses the pointer. */ click?: number;
}

export const Pointer = ({ x, y, click = 0 }: PointerProps) => (
  <svg
    width="32"
    height="38"
    viewBox="0 0 32 38"
    style={{
      position: "absolute",
      left: x,
      top: y,
      zIndex: 40,
      pointerEvents: "none",
      overflow: "visible",
      transform: `scale(${1 - click * 0.12})`,
      transformOrigin: "4px 3px",
      filter: "drop-shadow(1px 3px 3px #1F293D33)",
    }}
  >
    <path
      d="M4 3v27l7-7 6 12 6-3-6-12h11L4 3Z"
      fill="#1F293D"
      stroke="#FFF"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);

export interface BookmarkStackProps {
  count: number;
  style?: CSSProperties;
}

/** 210 × 210 artwork: the visible paper count caps at six, while badge shows count. */
export const BookmarkStack = ({ count, style }: BookmarkStackProps) => {
  const n = Math.max(0, Math.floor(count));
  return (
    <div
      style={{
        position: "relative",
        width: 210,
        height: 210,
        fontFamily: FONT,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 168,
          height: 25,
          left: 20,
          bottom: 17,
          background: "#1F293D13",
          filter: "blur(10px)",
          borderRadius: "50%",
        }}
      />
      {Array.from({ length: Math.min(n, 6) }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 149,
            height: 177,
            left: 29 + (i % 2 ? -3 : 3),
            bottom: 24 + i * 3,
            borderRadius: 10,
            background: "#FFF",
            border: "1px solid #E1DFD6",
            boxShadow: "0 3px 6px #1F293D09",
            transform: `rotate(${(i % 2 ? -1 : 1) * (2 + i * 1.6)}deg)`,
            transformOrigin: "50% 85%",
            overflow: "hidden",
            padding: 12,
          }}
        >
          <div
            style={{
              height: 77,
              background:
                i % 3 === 0 ? C.yellow : i % 3 === 1 ? "#B1C1ED" : "#EFB7A5",
              borderRadius: 5,
              marginBottom: 13,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: 68,
                height: 53,
                position: "absolute",
                left: 18,
                top: 16,
                background: "#FFFFFFAA",
                border: "1px solid #1F293D22",
                borderRadius: 5,
                transform: "rotate(-8deg)",
              }}
            />
            <div
              style={{
                width: 36,
                height: 32,
                position: "absolute",
                left: 72,
                top: 37,
                background: "#FFFFFFDD",
                borderRadius: 4,
                transform: "rotate(11deg)",
              }}
            />
          </div>
          {[91, 112, 71].map((w, j) => (
            <div
              key={j}
              style={{
                width: w,
                height: j ? 4 : 6,
                background: j ? "#E9E9E5" : "#B2B5BC",
                borderRadius: 3,
                marginBottom: 8,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              width: 14,
              height: 24,
              top: 0,
              right: 12,
              background: C.coral,
              clipPath: "polygon(0 0,100% 0,100% 100%,50% 75%,0 100%)",
            }}
          />
        </div>
      ))}
      {n > 0 && (
        <div
          style={{
            position: "absolute",
            right: 3,
            bottom: 3,
            height: 38,
            minWidth: 38,
            padding: "0 11px",
            borderRadius: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: C.ink,
            border: `3px solid ${C.paper}`,
            color: "#FFF",
            fontSize: 16,
            fontWeight: 650,
            boxShadow: "0 4px 9px #1F293D13",
          }}
        >
          {n}
        </div>
      )}
    </div>
  );
};

export interface DoodleCompanionProps {
  time: number;
  pose: "waiting" | "reading" | "searching";
  style?: CSSProperties;
}

/** Optional 170 × 190 hand-drawn companion; no human footage or raster assets. */
export const DoodleCompanion = ({
  time,
  pose,
  style,
}: DoodleCompanionProps) => {
  const bob = Math.sin(time * 2) * 2;
  const blink = Math.sin(time * 1.8) > 0.985 ? 0.15 : 1;
  return (
    <svg
      width="170"
      height="190"
      viewBox="0 0 170 190"
      style={{ overflow: "visible", ...style }}
    >
      <ellipse cx="84" cy="180" rx="45" ry="6" fill="#1F293D0D" />
      <g
        transform={`translate(0 ${bob})`}
        stroke={C.ink}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M66 151q-2 15-7 24m42-24q2 16 8 24" fill="none" />
        <path d="m49 178 14-3m39 2 17 1" fill="none" />
        <path
          d="M48 136q-6-29 5-51 8-19 31-19t32 21q9 19 4 49-2 21-36 21t-36-21Z"
          fill={C.yellow}
        />
        <path
          d="M55 82q-18-9-15-31 4-27 35-31 31-4 42 20 9 19-4 37-9 14-29 14-18 1-29-9Z"
          fill={C.paper}
        />
        <path d="M50 36q7-17 27-20m-5 7q14-16 28-8" fill="none" />
        <g transform={`translate(0 ${pose === "reading" ? 4 : 0})`}>
          <ellipse
            cx="70"
            cy="55"
            rx="2.1"
            ry={3.1 * blink}
            fill={C.ink}
            stroke="none"
          />
          <ellipse
            cx="94"
            cy="55"
            rx="2.1"
            ry={3.1 * blink}
            fill={C.ink}
            stroke="none"
          />
          <path
            d={pose === "searching" ? "M77 72q5-5 10 0" : "M75 70q7 5 14-1"}
            strokeWidth="2"
            fill="none"
          />
        </g>
        {pose === "reading" ? (
          <>
            <path d="m49 108 19 12m50-13-19 13" fill="none" />
            <path d="m62 100 23 7 24-7v32l-24 7-23-7Z" fill="#FFF" />
            <path d="M85 108v30" strokeWidth="1.5" />
            <path
              d="m68 111 10 3m-10 5 10 3m15-8 10-3m-10 11 10-3"
              strokeWidth="1.2"
              opacity=".4"
            />
          </>
        ) : pose === "searching" ? (
          <>
            <path d="m48 105-13 16m84-17 16-19" fill="none" />
            <circle cx="136" cy="68" r="16" fill="#E6EDFC" fillOpacity=".6" />
            <path d="m125 81-8 11" strokeWidth="5" />
            <path d="M131 61q4-4 9 0" stroke="#FFF" strokeWidth="3" />
          </>
        ) : (
          <>
            <path d="m48 108-15 19m87-20 10 20" fill="none" />
            <path d="m32 126-5 1m104 0 5 1" strokeWidth="2" />
          </>
        )}
      </g>
      {pose === "searching" && (
        <g
          fill={C.coral}
          fontFamily={FONT}
          fontSize="24"
          fontWeight="600"
          transform={`translate(${Math.sin(time) * 2} 0) rotate(9 145 20)`}
        >
          <text x="136" y="27">
            ?
          </text>
        </g>
      )}
    </svg>
  );
};
