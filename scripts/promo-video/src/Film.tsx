import React from "react";
import narration from "../voice-assets/timing.json";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const FPS = 60;
export const DURATION = 48 * FPS;
export type Language = "zh-CN" | "en";
export type FilmProps = { language: Language; sound: boolean };
const C = {
  paper: "#F4F5F1",
  ink: "#172032",
  blue: "#426FE1",
  deep: "#10182B",
  muted: "#778298",
  line: "#D9DFEA",
  lime: "#DFF4A1",
};
const FONT = '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
const p = (l: Language, zh: string, en: string) => (l === "zh-CN" ? zh : en);
const r = (t: number, a: number, b: number) =>
  Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = (x: number) => 1 - (1 - x) ** 4;
const move = (t: number, a: number, b: number, x: number, y: number) =>
  x + (y - x) * ease(r(t, a, b));
const q = (l: Language) =>
  p(
    l,
    "我想用 AI 做一个像素小游戏，应该从哪里开始？",
    "I want to make a pixel game with AI. Where do I start?",
  );
const title = (l: Language) =>
  p(l, "用 AI 做第一个像素小游戏", "Your first pixel game with AI");
const routes = [
  {
    id: "x",
    platform: "X",
    ai: "Grok",
    mark: "𝕏",
    color: "#BAC4D7",
    sample: ["从一个可玩的原型开始", "Start with one playable prototype"],
    kind: ["开发记录", "DEV LOG"],
    finding: [
      "先做移动，再加跳跃与碰撞。",
      "Movement first. Then jumping and collision.",
    ],
    source: ["我的第一个 AI 游戏原型", "My first AI game prototype"],
  },
  {
    id: "xhs",
    platform: "小红书",
    ai: "点点",
    mark: "小",
    color: "#FA7586",
    sample: ["新手的第一份制作笔记", "A beginner’s build journal"],
    kind: ["入门笔记", "BEGINNER NOTES"],
    finding: [
      "把第一个关卡，缩小到一个场景。",
      "Keep the first level to a single scene.",
    ],
    source: [
      "零基础做像素小游戏的第一周",
      "My first week building a pixel game",
    ],
  },
  {
    id: "youtube",
    platform: "YouTube",
    ai: "Gemini",
    mark: "▶",
    color: "#FA8F80",
    sample: [
      "跟着视频，搭出第一个场景",
      "Build your first scene, step by step",
    ],
    kind: ["视频教程", "VIDEO TUTORIAL"],
    finding: [
      "教程从角色移动讲起，附视频来源。",
      "A movement tutorial, with the original video.",
    ],
    source: ["用 AI 做第一个像素小游戏", "Your first pixel game with AI"],
  },
  {
    id: "reddit",
    platform: "Reddit",
    ai: "Ask",
    mark: "r/",
    color: "#FDBA81",
    sample: ["先看开发者踩过的坑", "Learn from other developers’ mistakes"],
    kind: ["社区讨论", "COMMUNITY THREAD"],
    finding: [
      "先验证玩法，再扩展工具和功能。",
      "Test the game loop before adding features.",
    ],
    source: [
      "第一次用 AI 做游戏，我学到了什么",
      "What I learned making my first AI game",
    ],
  },
];
type Route = (typeof routes)[number];
const tr = (l: Language, v: string[]) => v[l === "zh-CN" ? 0 : 1];

const Arrow = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M4 12h16m-6-6 6 6-6 6" />
  </svg>
);
const Mark = ({
  dark = false,
  size = 34,
}: {
  dark?: boolean;
  size?: number;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: dark ? "#fff" : C.ink,
    }}
  >
    <Img
      src={staticFile("postrove-mark.svg")}
      style={{
        width: size,
        height: size,
        filter: dark ? "brightness(0) invert(1)" : undefined,
      }}
    />
    <span
      style={{ fontSize: size * 0.66, fontWeight: 650, letterSpacing: -0.8 }}
    >
      Postrove
    </span>
  </div>
);
const Rail = ({
  l,
  n,
  dark = false,
}: {
  l: Language;
  n: number;
  dark?: boolean;
}) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      right: 96,
      top: 48,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 3,
    }}
  >
    <Mark dark={dark} />
    <div
      style={{
        fontSize: 14,
        letterSpacing: 2,
        color: dark ? "#AAB8D2" : C.muted,
      }}
    >
      {p(l, "提问、收藏和阅读", "ASK, SAVE AND READ")}
      <span style={{ marginLeft: 34, opacity: 0.6 }}>0{n} / 06</span>
    </div>
  </div>
);
const Demo = ({ l, dark = false }: { l: Language; dark?: boolean }) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      bottom: 21,
      fontSize: 14,
      color: dark ? "#8090AC" : "#8690A1",
      letterSpacing: 0.3,
    }}
  >
    {p(
      l,
      "虚构演示问题、回复与材料",
      "Fictional demo question, replies and materials",
    )}
  </div>
);
const Grid = ({ dark = false }: { dark?: boolean }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `radial-gradient(${dark ? "#55698740" : "#9AA8C238"} 1px,transparent 1px)`,
      backgroundSize: "38px 38px",
      maskImage: "linear-gradient(90deg,transparent,#000 50%,transparent)",
      pointerEvents: "none",
    }}
  />
);
const Scene = ({
  children,
  bg = C.paper,
  seconds,
}: {
  children: React.ReactNode;
  bg?: string;
  seconds: number;
}) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill
      style={{
        background: bg,
        overflow: "hidden",
        opacity: Math.min(r(t, 0, 0.25), 1 - r(t, seconds - 0.28, seconds)),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
const Reveal = ({
  children,
  at = 0.2,
}: {
  children: React.ReactNode;
  at?: number;
}) => {
  const t = useCurrentFrame() / FPS;
  return (
    <div style={{ overflow: "hidden", paddingBottom: 8, marginBottom: -8 }}>
      <div
        style={{
          transform: `translateY(${move(t, at, at + 0.7, 110, 0)}%)`,
          opacity: r(t, at, at + 0.2),
        }}
      >
        {children}
      </div>
    </div>
  );
};
const Trial = ({ l, dark = false }: { l: Language; dark?: boolean }) => (
  <span
    style={{
      fontSize: 13,
      fontWeight: 500,
      color: dark ? "#C1CBE0" : "#7B879F",
      border: `1px solid ${dark ? "#FFFFFF35" : "#CAD4E7"}`,
      padding: "3px 7px",
      borderRadius: 5,
    }}
  >
    {p(l, "试用", "Preview")}
  </span>
);
const AIName = ({
  route,
  l,
  dark = false,
  compact = false,
}: {
  route: Route;
  l: Language;
  dark?: boolean;
  compact?: boolean;
}) => (
  <div
    style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 14 }}
  >
    <div
      style={{
        width: compact ? 38 : 48,
        height: compact ? 38 : 48,
        borderRadius: 12,
        background: dark ? "#FFFFFF12" : "#EDF1F8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: route.id === "x" && !dark ? C.ink : route.color,
        fontWeight: 700,
        fontSize: route.id === "reddit" ? 22 : 25,
      }}
    >
      {route.id === "xhs" ? p(l, "小", "D") : route.mark}
    </div>
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: dark ? "white" : C.ink,
          fontSize: compact ? 21 : 26,
          fontWeight: 600,
        }}
      >
        {route.id === "xhs" ? p(l, "小红书", "Xiaohongshu") : route.platform}
        {(route.id === "youtube" || route.id === "reddit") && (
          <Trial l={l} dark={dark} />
        )}
      </div>
      <div
        style={{
          marginTop: 4,
          color: dark ? "#ADBEDD" : C.muted,
          fontSize: compact ? 15 : 18,
        }}
      >
        {route.id === "xhs" ? p(l, "点点", "Diandian") : route.ai}
        {route.id === "youtube"
          ? p(l, " · 搜视频", " · video search")
          : p(l, " · 平台 AI", " · platform AI")}
      </div>
    </div>
  </div>
);

const GameArt = ({ t = 0 }: { t?: number }) => {
  const jump = Math.max(0, Math.sin(t * 2.5)) * 42;
  return (
    <svg
      viewBox="0 0 480 280"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        imageRendering: "pixelated",
      }}
      shapeRendering="crispEdges"
    >
      <rect width="480" height="280" fill="#E6EDF9" />
      <rect y="210" width="480" height="70" fill="#C7DABF" />
      <path d="M0 211h480M0 231h480" stroke="#9FBC9A" strokeWidth="4" />
      <rect x="310" y="152" width="110" height="16" rx="1" fill="#99B5D8" />
      <rect x="326" y="168" width="78" height="44" fill="#C1CFE1" />
      <rect x="50" y="80" width="78" height="12" fill="#F7FAFE" />
      <rect x="72" y="68" width="42" height="12" fill="#F7FAFE" />
      <rect x="349" y="44" width="18" height="18" fill="#EACD72" />
      <path
        d="M238 169q36-82 76-23"
        fill="none"
        stroke="#426FE177"
        strokeWidth="3"
        strokeDasharray="7 7"
      />
      <g transform={`translate(184 ${148 - jump})`}>
        <rect x="8" width="36" height="10" fill="#426FE1" />
        <rect y="10" width="52" height="38" fill="#426FE1" />
        <rect x="9" y="48" width="11" height="14" fill="#172032" />
        <rect x="34" y="48" width="11" height="14" fill="#172032" />
        <rect x="29" y="18" width="8" height="8" fill="white" />
        <rect x="34" y="19" width="4" height="6" fill="#172032" />
        <rect x="7" y="33" width="15" height="6" fill="#ABC1FF" />
      </g>
      <rect x="425" y="106" width="4" height="105" fill="#8797B0" />
      <path d="M429 107h29l-9 12 9 12h-29z" fill="#F19587" />
      <path d="M35 265h87M132 265h40" stroke="#94AA94" strokeWidth="3" />
    </svg>
  );
};
const Thumb = ({ video = false }: { video?: boolean }) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      borderRadius: 10,
    }}
  >
    <Img
      src={staticFile("demo-game.png")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    {video && (
      <div
        style={{
          position: "absolute",
          left: "44%",
          top: "34%",
          width: 43,
          height: 43,
          borderRadius: "50%",
          background: "#172032CC",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 19,
        }}
      >
        ▶
      </div>
    )}
  </div>
);
const ContentPreview = ({ route, l }: { route: Route; l: Language }) => {
  if (route.id === "youtube") return <Thumb video />;
  if (route.id === "xhs")
    return (
      <div style={{ height: "100%", position: "relative" }}>
        <Thumb />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            padding: "6px 10px",
            fontSize: 14,
            fontWeight: 600,
            color: "#FFFFFF",
            background: "#CC5267DD",
            borderRadius: 6,
          }}
        >
          {p(l, "我的像素游戏制作手记", "MY PIXEL GAME JOURNAL")}
        </div>
      </div>
    );
  if (route.id === "reddit")
    return (
      <div
        style={{
          height: "100%",
          boxSizing: "border-box",
          background: "#F7F5F1",
          padding: 17,
          color: C.ink,
        }}
      >
        <div style={{ color: "#D17735", fontSize: 13, marginBottom: 12 }}>
          r/gamedev · {p(l, "示例讨论", "DEMO DISCUSSION")}
        </div>
        <div style={{ fontSize: 19, fontWeight: 600 }}>
          {p(l, "第一个游戏，该做多大？", "How small should my first game be?")}
        </div>
        <div
          style={{
            marginTop: 14,
            borderLeft: "2px solid #D5CFC8",
            paddingLeft: 13,
            fontSize: 15,
            color: "#727A89",
            lineHeight: 1.6,
          }}
        >
          <div>
            {p(l, "先验证一个核心玩法。", "Start with one core mechanic.")}
          </div>
          <div>
            {p(l, "做完一个小场景，再继续。", "Finish a small scene first.")}
          </div>
        </div>
      </div>
    );
  return (
    <div
      style={{
        height: "100%",
        boxSizing: "border-box",
        background: "#F4F6FB",
        padding: 17,
        color: C.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 13,
          color: C.muted,
        }}
      >
        <span
          style={{
            background: C.blue,
            color: "white",
            borderRadius: 20,
            width: 23,
            height: 23,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          p
        </span>
        pixel_builder · {p(l, "演示帖子", "DEMO POST")}
      </div>
      <div
        style={{
          marginTop: 13,
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        {p(
          l,
          "第 1 天：角色终于动起来了。",
          "Day 1: the character finally moves.",
        )}
      </div>
      <div style={{ marginTop: 9, fontSize: 15, color: "#7D8A9F" }}>
        move → jump → collide
      </div>
      <div style={{ marginTop: 11, color: C.blue, fontSize: 14 }}>
        #gamedev #AI
      </div>
    </div>
  );
};
const SourceCard = ({
  l,
  width = 580,
  selected = false,
}: {
  l: Language;
  width?: number;
  selected?: boolean;
}) => (
  <div
    style={{
      width,
      minHeight: 132,
      display: "flex",
      alignItems: "center",
      gap: 22,
      padding: 18,
      boxSizing: "border-box",
      background: "white",
      border: `2px solid ${selected ? C.blue : "#D8E0EE"}`,
      borderRadius: 18,
      boxShadow: selected ? "0 18px 70px #426FE133" : "0 12px 40px #17203216",
    }}
  >
    <div style={{ width: 156, height: 98, flexShrink: 0 }}>
      <Thumb video />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          color: "#E76B5E",
          fontSize: 15,
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        YouTube · {p(l, "视频教程", "VIDEO TUTORIAL")}
      </div>
      <div
        style={{
          color: C.ink,
          fontSize: width < 580 ? 23 : 26,
          lineHeight: 1.35,
          fontWeight: 600,
        }}
      >
        {title(l)}
      </div>
      <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>
        {p(l, "原视频链接", "Original video link")}
      </div>
    </div>
    {selected && (
      <div style={{ color: C.blue, fontSize: 25, marginRight: 4 }}>✓</div>
    )}
  </div>
);

const Opening = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <Scene seconds={5.3}>
      <Grid />
      <Rail l={l} n={1} />
      <div style={{ position: "absolute", left: 105, top: 257, width: 890 }}>
        <div
          style={{
            color: C.blue,
            fontSize: 18,
            letterSpacing: 4,
            marginBottom: 28,
          }}
        >
          {p(l, "POSTROVE · 跨平台内容搜索", "POSTROVE · CONTENT SEARCH")}
        </div>
        <div
          style={{
            fontSize: l === "en" ? 86 : 94,
            lineHeight: 1.22,
            fontWeight: 650,
            letterSpacing: -4,
            color: C.ink,
          }}
        >
          <Reveal>{p(l, "用平台 AI", "Ask platform AIs")}</Reveal>
          <Reveal at={0.45}>{p(l, "查找内容。", "to find content.")}</Reveal>
        </div>
        <div
          style={{
            color: C.muted,
            fontSize: 30,
            marginTop: 38,
            opacity: r(t, 1.2, 1.8),
          }}
        >
          {p(
            l,
            "在一个话题里查看各平台的回复和来源。",
            "View platform replies and sources in one topic.",
          )}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1080,
          top: 235,
          width: 700,
          height: 568,
          borderRadius: 27,
          background: "white",
          border: "1px solid #D4DDED",
          boxShadow: "0 30px 80px #17203215",
          padding: 30,
          boxSizing: "border-box",
          transform: `translateY(${move(t, 0.25, 1.5, 80, 0)}px) rotate(${move(t, 0.25, 1.5, 3, -1)}deg)`,
          opacity: r(t, 0.2, 0.8),
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: C.muted,
            fontSize: 16,
            marginBottom: 28,
          }}
        >
          <span>{p(l, "内容与来源", "CONTENT + SOURCES")}</span>
          <span>↗</span>
        </div>
        {[
          {
            mark: "≡",
            label: p(l, "帖子与笔记", "Posts & notes"),
            source: p(l, "例如 X · 小红书", "e.g. X · Xiaohongshu"),
            color: "#E8EEF9",
          },
          {
            mark: "▶",
            label: p(l, "视频教程", "Video tutorials"),
            source: "YouTube",
            color: "#FCE8E4",
          },
          {
            mark: "r/",
            label: p(l, "社区讨论", "Community discussions"),
            source: "Reddit",
            color: "#FFF0DF",
          },
        ].map((item, i) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 22px",
              marginBottom: 14,
              border: "1px solid #E1E6EF",
              borderRadius: 15,
              opacity: r(t, 0.6 + i * 0.24, 1.1 + i * 0.24),
              transform: `translateX(${move(t, 0.6 + i * 0.24, 1.4 + i * 0.24, 35, 0)}px)`,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                background: item.color,
                color: C.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 29,
                fontWeight: 600,
              }}
            >
              {item.mark}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 27, fontWeight: 550, color: C.ink }}>
                {item.label}
              </div>
              <div style={{ marginTop: 8, fontSize: 17, color: C.muted }}>
                {item.source}
              </div>
            </div>
            <span style={{ fontSize: 24, color: C.blue }}>↗</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: C.blue,
            fontSize: 20,
            marginTop: 23,
            opacity: r(t, 1.7, 2.3),
          }}
        >
          <Mark size={32} />
          <span>{p(l, "提问 · 收藏 · 阅读", "Ask · Save · Read")}</span>
        </div>
      </div>
      <Demo l={l} />
    </Scene>
  );
};
const Dispatch = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  const typed = q(l).slice(0, Math.floor(move(t, 0.4, 1.65, 0, q(l).length)));
  return (
    <Scene seconds={5.5}>
      <Grid />
      <Rail l={l} n={2} />
      <div
        style={{
          position: "absolute",
          top: 148,
          width: "100%",
          textAlign: "center",
          fontSize: 66,
          color: C.ink,
          fontWeight: 600,
          letterSpacing: -2,
        }}
      >
        <Reveal>
          {p(
            l,
            "同一个问题，发给不同平台的 AI。",
            "Send the same question to different platform AIs.",
          )}
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 300,
          top: 314,
          width: 1320,
          padding: "39px 44px",
          boxSizing: "border-box",
          border: "1px solid #CDD8EE",
          borderRadius: 24,
          boxShadow: "0 28px 80px #426FE116",
          background: "white",
          transform: `translateY(${move(t, 0.1, 0.9, 35, 0)}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 15,
            color: C.blue,
            fontSize: 16,
            marginBottom: 22,
          }}
        >
          <Img src={staticFile("postrove-mark.svg")} style={{ width: 24 }} />
          <span>
            {p(
              l,
              "例如 · 一个游戏创作问题",
              "EXAMPLE · A GAME-MAKING QUESTION",
            )}
          </span>
        </div>
        <div
          style={{
            color: C.ink,
            fontSize: l === "en" ? 34 : 39,
            fontWeight: 500,
            letterSpacing: -0.6,
            minHeight: 60,
          }}
        >
          {typed}
          <span style={{ color: C.blue, opacity: t < 1.9 ? 1 : 0 }}>|</span>
        </div>
        <div
          style={{
            marginTop: 19,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 18,
            color: C.muted,
          }}
        >
          <span>
            {p(
              l,
              "同一个问题 · 各平台独立回答",
              "ONE QUESTION · INDEPENDENT PLATFORM REPLIES",
            )}
          </span>
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              background: C.blue,
              color: "white",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {p(l, "发送", "Send")}
            <Arrow size={21} />
          </div>
        </div>
      </div>
      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", inset: 0 }}
      >
        <path
          d="M960 558v45M310 654v-23q0-28 28-28h1244q28 0 28 28v23M745 603v51M1175 603v51"
          stroke="#7998DD"
          strokeWidth="2"
          fill="none"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - ease(r(t, 1.9, 3.1))}
        />
        {[310, 745, 1175, 1610].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={move(t, 2.3 + i * 0.12, 3.4 + i * 0.12, 603, 660)}
            r={6}
            fill={C.blue}
            opacity={r(t, 2.2 + i * 0.12, 2.5 + i * 0.12)}
          />
        ))}
      </svg>
      {routes.map((route, i) => (
        <div
          key={route.id}
          style={{
            position: "absolute",
            left: 115 + i * 435,
            top: 654,
            width: 385,
            height: 177,
            padding: 27,
            boxSizing: "border-box",
            borderRadius: 20,
            background: "white",
            border: "1px solid #D4DDEE",
            opacity: r(t, 2.4 + i * 0.12, 2.9 + i * 0.12),
            transform: `translateY(${move(t, 2.4 + i * 0.12, 3.2 + i * 0.12, 25, 0)}px)`,
          }}
        >
          <AIName route={route} l={l} />
          <div
            style={{
              fontSize: 16,
              color: C.blue,
              marginTop: 22,
              display: "flex",
              gap: 9,
            }}
          >
            <span>✓</span>
            {p(l, "接收同一个问题", "Receives the same question")}
          </div>
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          top: 884,
          left: 115,
          right: 115,
          display: "flex",
          alignItems: "center",
          gap: 22,
          fontSize: 18,
          color: C.muted,
          opacity: r(t, 3.2, 3.8),
        }}
      >
        <span>
          {p(l, "本次演示中的平台 AI", "PLATFORM AIs IN THIS EXAMPLE")}
        </span>
        <div style={{ flex: 1, borderTop: "1px dashed #B6C5DF" }} />
        <span style={{ fontSize: 31, letterSpacing: 6 }}>···</span>
      </div>
      <Demo l={l} />
    </Scene>
  );
};

const DiscoveryLane = ({
  route,
  i,
  l,
  t,
  ready,
}: {
  route: Route;
  i: number;
  l: Language;
  t: number;
  ready: boolean;
}) => {
  const a = r(t, 0.5 + i * 0.13, 1.3 + i * 0.13);
  return (
    <div
      style={{
        position: "absolute",
        left: 100 + i * 435,
        top: 300,
        width: 405,
        height: 588,
        padding: 25,
        boxSizing: "border-box",
        background: "#1A253B",
        border: "1px solid #FFFFFF21",
        borderRadius: 23,
        transform: `translateY(${(1 - ease(a)) * 45}px)`,
        opacity: a,
      }}
    >
      <AIName route={route} l={l} dark />
      <div
        style={{
          marginTop: 24,
          padding: "13px 15px",
          color: "#AABAD6",
          background: "#10192D",
          borderRadius: 10,
          fontSize: 17,
          lineHeight: 1.45,
        }}
      >
        {p(
          l,
          "用 AI 做像素小游戏，从哪开始？",
          "A pixel game with AI. Where do I start?",
        )}
      </div>
      <div
        style={{
          color: route.color,
          marginTop: 23,
          marginBottom: 13,
          fontSize: 15,
          letterSpacing: 1,
        }}
      >
        {ready
          ? p(l, "✓ 已找到相关来源", "✓ SOURCES FOUND")
          : p(l, "正在查找相关内容", "FINDING RELEVANT CONTENT")}
      </div>
      <div
        style={{
          height: 157,
          borderRadius: 13,
          overflow: "hidden",
          opacity: r(t, 1.25 + i * 0.12, 2 + i * 0.12),
          position: "relative",
        }}
      >
        <ContentPreview route={route} l={l} />
        <div
          style={{
            position: "absolute",
            right: 9,
            bottom: 8,
            background: "#172032D9",
            borderRadius: 5,
            color: "white",
            fontSize: 12,
            padding: "4px 8px",
          }}
        >
          {tr(l, route.kind)}
        </div>
      </div>
      <div
        style={{
          color: "#F2F5FC",
          fontWeight: 500,
          fontSize: 24,
          lineHeight: 1.35,
          marginTop: 18,
        }}
      >
        {tr(l, route.source)}
      </div>
      <div
        style={{
          color: "#AABAD6",
          fontSize: 17,
          lineHeight: 1.5,
          marginTop: 14,
        }}
      >
        {ready ? tr(l, route.finding) : tr(l, route.sample)}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          fontSize: 15,
          color: "#ABC1F5",
        }}
      >
        ↗ {p(l, "保留原始链接", "Original link retained")}
      </div>
    </div>
  );
};
const Search = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  const focus = r(t, 3.0, 3.65) * (1 - r(t, 10.5, 11.2));
  const overview = Math.max(1 - r(t, 2.8, 3.5), r(t, 10.8, 11.5));
  const source = ease(r(t, 5.2, 7.1));
  return (
    <Scene seconds={15.6} bg={C.deep}>
      <Grid dark />
      <Rail l={l} n={3} dark />
      <div
        style={{
          position: "absolute",
          top: 147,
          width: "100%",
          textAlign: "center",
          color: "white",
          fontSize: l === "en" ? 62 : 70,
          fontWeight: 600,
          letterSpacing: -2,
        }}
      >
        <Reveal>
          {p(
            l,
            "各平台 AI 分别查找内容。",
            "Each platform AI searches for relevant content.",
          )}
        </Reveal>
      </div>
      <div style={{ opacity: overview }}>
        <div
          style={{
            position: "absolute",
            top: 250,
            width: "100%",
            textAlign: "center",
            fontSize: 16,
            color: "#ADBEDD",
            letterSpacing: 1.5,
          }}
        >
          {p(
            l,
            "本次示例 · 各平台独立寻找",
            "IN THIS EXAMPLE · EACH PLATFORM SEARCHES INDEPENDENTLY",
          )}
        </div>
        {routes.map((route, i) => (
          <DiscoveryLane
            key={route.id}
            route={route}
            i={i}
            l={l}
            t={t}
            ready={t > 10}
          />
        ))}
      </div>
      <div
        style={{
          opacity: focus,
          transform: `translateY(${(1 - focus) * 25}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 100,
            top: 306,
            width: 775,
            height: 573,
            borderRadius: 24,
            background: "#1A253B",
            border: "1px solid #FFFFFF24",
            padding: 30,
            boxSizing: "border-box",
          }}
        >
          <AIName route={routes[2]} l={l} dark />
          <div
            style={{
              marginTop: 25,
              fontSize: 17,
              color: "#A8B8D3",
              lineHeight: 1.5,
              padding: "14px 18px",
              background: "#10192D",
              borderRadius: 12,
            }}
          >
            {q(l)}
          </div>
          <div
            style={{
              marginTop: 23,
              fontSize: 23,
              fontWeight: 500,
              color: "#EFF4FF",
            }}
          >
            {p(
              l,
              "Gemini 正在搜索 YouTube 视频",
              "Gemini searches YouTube videos",
            )}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  width: 338,
                  opacity: r(t, 3.8 + i * 0.35, 4.6 + i * 0.35),
                  transform: `translateY(${move(t, 3.8 + i * 0.35, 4.8 + i * 0.35, 25, 0)}px)`,
                }}
              >
                <div style={{ height: 168 }}>
                  <Thumb video />
                </div>
                <div
                  style={{
                    fontSize: 21,
                    lineHeight: 1.4,
                    color: "white",
                    fontWeight: 500,
                    marginTop: 13,
                  }}
                >
                  {i === 0
                    ? title(l)
                    : p(
                        l,
                        "角色跳跃与碰撞，怎么做？",
                        "Jumping and collision, explained",
                      )}
                </div>
                <div style={{ fontSize: 14, color: "#93A5C2", marginTop: 9 }}>
                  YouTube · {p(l, "演示材料", "Demo material")}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 906,
            top: 535,
            color: C.lime,
            opacity: r(t, 5.1, 5.6),
            transform: `translateX(${move(t, 5.1, 5.8, -15, 0)}px)`,
          }}
        >
          <Arrow size={60} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 1010,
            top: 306,
            width: 810,
            height: 573,
            background: "#1B2942",
            border: "1px solid #6E91DA60",
            borderRadius: 24,
            padding: 34,
            boxSizing: "border-box",
            opacity: r(t, 5.3, 6.1),
            transform: `translateY(${move(t, 5.3, 6.4, 30, 0)}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              color: "#C5D5F4",
              fontSize: 18,
            }}
          >
            <span style={{ color: C.lime }}>✦</span>Gemini ·{" "}
            {p(l, "基于找到的视频回答", "ANSWER WITH VIDEO SOURCES")}
          </div>
          <div
            style={{
              color: "white",
              fontSize: 36,
              lineHeight: 1.45,
              fontWeight: 500,
              marginTop: 30,
            }}
          >
            {p(
              l,
              "先搭一个场景，\n让角色动起来。",
              "Start with one scene.\nMake the character move.",
            )
              .split("\n")
              .map((x) => (
                <div key={x}>{x}</div>
              ))}
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 23,
              color: "#B7C7E4",
              lineHeight: 1.6,
            }}
          >
            {p(
              l,
              "从移动、跳跃和碰撞开始，\n跟着教程完成第一个原型。",
              "Begin with movement, jumping and collision.\nFollow the tutorial to build a first prototype.",
            )
              .split("\n")
              .map((x) => (
                <div key={x}>{x}</div>
              ))}
          </div>
          <div
            style={{
              marginTop: 25,
              transform: `translateX(${(1 - source) * -90}px)`,
              opacity: source,
            }}
          >
            <SourceCard l={l} width={738} />
          </div>
        </div>
      </div>
      <Demo l={l} dark />
    </Scene>
  );
};

const Capture = ({
  src,
  width,
  crop = { x: 215, y: 80, w: 1770, h: 1190 },
}: {
  src: string;
  width: number;
  crop?: { x: number; y: number; w: number; h: number };
}) => {
  const z = width / crop.w;
  return (
    <div
      style={{
        position: "relative",
        width,
        height: crop.h * z,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          width: 2200 * z,
          height: 1520 * z,
          maxWidth: "none",
          left: -crop.x * z,
          top: -crop.y * z,
        }}
      />
    </div>
  );
};
const Window = ({
  children,
  width,
  height,
  style,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      position: "absolute",
      width,
      height,
      borderRadius: 23,
      overflow: "hidden",
      background: "white",
      border: "1px solid #CCD7E9",
      boxShadow: "0 32px 95px #17203222",
      ...style,
    }}
  >
    {children}
  </div>
);
const Replies = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <Scene seconds={9.5}>
      <Grid />
      <Rail l={l} n={4} />
      <div style={{ position: "absolute", left: 100, top: 220, width: 555 }}>
        <div
          style={{
            fontSize: 17,
            color: C.blue,
            letterSpacing: 2,
            marginBottom: 26,
          }}
        >
          04 — {p(l, "回复与来源", "REPLIES AND SOURCES")}
        </div>
        <div
          style={{
            fontSize: l === "en" ? 70 : 84,
            lineHeight: 1.24,
            color: C.ink,
            fontWeight: 600,
            letterSpacing: -3,
          }}
        >
          <Reveal>{p(l, "查看回复", "View replies")}</Reveal>
          <Reveal at={0.4}>{p(l, "和来源链接。", "and source links.")}</Reveal>
        </div>
        <div
          style={{
            fontSize: 26,
            color: C.muted,
            lineHeight: 1.65,
            marginTop: 30,
            maxWidth: 470,
            opacity: r(t, 0.8, 1.5),
          }}
        >
          {p(
            l,
            "回复和来源链接\n保存在同一个话题里。",
            "Replies and source links\nare saved in the same topic.",
          )
            .split("\n")
            .map((x) => (
              <div key={x}>{x}</div>
            ))}
        </div>
        <div
          style={{
            marginTop: 35,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            opacity: r(t, 1.3, 2),
          }}
        >
          {routes.map((x) => (
            <div
              key={x.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 13px",
                background: "white",
                border: "1px solid #DBE2EE",
                borderRadius: 10,
                color: C.ink,
                fontSize: 18,
              }}
            >
              <span style={{ color: x.id === "x" ? C.ink : x.color }}>
                {x.id === "xhs" ? p(l, "小", "D") : x.mark}
              </span>
              {x.id === "xhs" ? p(l, "点点", "Diandian") : x.ai}
            </div>
          ))}
        </div>
      </div>
      <Window
        width={1120}
        height={735}
        style={{
          left: 700,
          top: 185,
          transform: `translateY(${move(t, 0.1, 1.1, 80, 0)}px)`,
          opacity: r(t, 0.1, 0.7),
        }}
      >
        <Capture
          src={`demo-topic-${l}.png`}
          width={1120}
          crop={{ x: 160, y: 260, w: 1880, h: 1234 }}
        />
      </Window>
      <Demo l={l} />
    </Scene>
  );
};
const Reading = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  const translated = r(t, 4.1, 4.65);
  const detail = r(t, 6.3, 6.85);
  return (
    <Scene seconds={9.5} bg="#EEF1F8">
      <Grid />
      <Rail l={l} n={5} />
      <div style={{ position: "absolute", left: 100, top: 224, width: 550 }}>
        <div
          style={{
            fontSize: 17,
            color: C.blue,
            letterSpacing: 2,
            marginBottom: 27,
          }}
        >
          05 — {p(l, "阅读与翻译", "SAVED CONTENT")}
        </div>
        <div
          style={{
            fontSize: l === "en" ? 76 : 78,
            lineHeight: 1.26,
            color: C.ink,
            fontWeight: 600,
            letterSpacing: -3,
          }}
        >
          <Reveal>{p(l, "收藏到阅读库", "Save sources")}</Reveal>
          {l === "en" && <Reveal at={0.4}>to Reading.</Reveal>}
        </div>
        <div
          style={{
            fontSize: 25,
            color: C.muted,
            lineHeight: 1.65,
            marginTop: 30,
            maxWidth: 470,
            opacity: r(t, 0.8, 1.6),
          }}
        >
          {p(
            l,
            "查看摘要和正文。\n可切换原文和中文翻译。",
            "View the summary and text.\nSwitch between the original\nand reading version.",
          )
            .split("\n")
            .map((x) => (
              <div key={x}>{x}</div>
            ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 13,
            marginTop: 38,
            opacity: r(t, 3.2, 3.7),
          }}
        >
          {[p(l, "原文", "Original"), p(l, "阅读版本", "Reading version")].map(
            (x, i) => (
              <div
                key={x}
                style={{
                  padding: "13px 19px",
                  fontSize: 20,
                  borderRadius: 11,
                  border: "1px solid #CDDAEF",
                  background: translated > 0.5 === (i === 1) ? C.blue : "white",
                  color: translated > 0.5 === (i === 1) ? "white" : C.muted,
                }}
              >
                {x}
              </div>
            ),
          )}
        </div>
        <div
          style={{
            marginTop: 31,
            color: C.blue,
            fontSize: 19,
            opacity: r(t, 5.0, 5.5),
          }}
        >
          ↗ {p(l, "保留原始链接", "Original source link retained")}
        </div>
      </div>
      <Window
        width={1120}
        height={775}
        style={{
          left: 700,
          top: 180,
          opacity: r(t, 0.8, 2.2),
          transform: `translateY(${move(t, 0.5, 2.2, 65, 0)}px)`,
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <Capture
            src={`demo-reading-original-${l}.png`}
            width={1120}
            crop={{ x: 260, y: 48, w: 1680, h: 1160 }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 1 - detail,
            clipPath: `inset(0 ${(1 - translated) * 100}% 0 0)`,
          }}
        >
          <Capture
            src={`demo-reading-${l}.png`}
            width={1120}
            crop={{ x: 260, y: 48, w: 1680, h: 1160 }}
          />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: detail }}>
          <Capture
            src={`demo-reading-code-${l}.png`}
            width={1120}
            crop={{ x: 260, y: 48, w: 1680, h: 1160 }}
          />
        </div>
      </Window>
      <Demo l={l} />
    </Scene>
  );
};
const SourceJourney = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  if (t < 29.2 || t > 36.4) return null;
  const transfer = r(t, 32.1, 34.15);
  const enter = r(t, 34.8, 36.2);
  const x = 1120 + (105 - 1120) * ease(transfer) + (1050 - 105) * ease(enter);
  const y = 716 + (716 - 716) * ease(transfer) + (345 - 716) * ease(enter);
  const width = 600 + (525 - 600) * ease(transfer) + (585 - 525) * ease(enter);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 8,
        opacity: r(t, 29.2, 29.7) * (1 - r(t, 35.5, 36.4)),
        transform: `scale(${1 + 0.025 * Math.sin(r(t, 31.7, 32.3) * Math.PI)})`,
      }}
    >
      <SourceCard l={l} width={width} selected={t > 31.5} />
      {t > 31.5 && t < 34.8 && (
        <div
          style={{
            marginTop: 13,
            color: C.blue,
            fontSize: 20,
            display: "flex",
            alignItems: "center",
            gap: 9,
            paddingLeft: 15,
          }}
        >
          ✓ {p(l, "已收藏到阅读库", "Saved to Reading")}
        </div>
      )}
    </div>
  );
};
const Finale = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill
      style={{ background: C.blue, opacity: r(t, 0, 0.45), overflow: "hidden" }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 960 - 500 - i * 170,
            top: 540 - 500 - i * 170,
            width: 1000 + i * 340,
            height: 1000 + i * 340,
            border: "1px solid #FFFFFF15",
            borderRadius: "50%",
            transform: `scale(${move(t, 0, 5.2, 0.8, 1.03)})`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 170,
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <Img
          src={staticFile("postrove-icon.svg")}
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            boxShadow: "0 15px 50px #17203230",
            marginBottom: 24,
          }}
        />
        <div
          style={{
            fontSize: 133,
            fontWeight: 600,
            letterSpacing: -6,
            color: "white",
            lineHeight: 1.1,
          }}
        >
          <Reveal at={0.2}>
            Postrove<span style={{ color: C.lime }}>.</span>
          </Reveal>
        </div>
        <div
          style={{
            fontSize: l === "en" ? 48 : 52,
            letterSpacing: -1,
            color: "#F2F6FF",
            marginTop: 31,
            fontWeight: 450,
          }}
        >
          <Reveal at={0.5}>
            {p(l, "跨平台提问和阅读。", "Ask across platforms. Save and read.")}
          </Reveal>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 40,
            opacity: r(t, 0.8, 1.4),
          }}
        >
          {[
            p(l, "教程", "Tutorials"),
            p(l, "制作经验", "Build journals"),
            p(l, "踩坑记录", "Lessons learned"),
          ].map((x) => (
            <div
              key={x}
              style={{
                fontSize: 20,
                color: "#F5F8FF",
                padding: "10px 19px",
                border: "1px solid #FFFFFF55",
                borderRadius: 10,
              }}
            >
              {x}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 38,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 20,
            color: "#E1E9FF",
            opacity: r(t, 1.3, 1.9),
          }}
        >
          <span style={{ fontSize: 14, letterSpacing: 1, color: "#C2D2F8" }}>
            {p(l, "例如", "E.G.")}
          </span>
          <span>X · Grok</span>
          <span style={{ opacity: 0.4 }}> / </span>
          <span>{p(l, "小红书 · 点点", "Xiaohongshu · Diandian")}</span>
          <span style={{ opacity: 0.4 }}> / </span>
          <span>
            Gemini → YouTube <Trial l={l} dark />
          </span>
          <span style={{ opacity: 0.4 }}> / </span>
          <span>
            Reddit · Ask <Trial l={l} dark />
          </span>
          <span style={{ letterSpacing: 3 }}>···</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 40,
            color: "white",
            fontSize: 23,
            opacity: r(t, 1.6, 2.2),
          }}
        >
          github.com/huggon1/postrove
          <Arrow size={25} />
        </div>
        <div
          style={{
            marginTop: 22,
            color: "#C2D2F8",
            fontSize: 17,
            opacity: r(t, 1.8, 2.5),
          }}
        >
          macOS · Windows
        </div>
      </div>
    </AbsoluteFill>
  );
};
const Subtitles = ({ l }: { l: Language }) => {
  const t = useCurrentFrame() / FPS;
  const active = narration.languages[l].find(
    (x) => t >= x.start && t < Math.min(47.95, x.end + 0.2),
  );
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        right: 140,
        bottom: 64,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: l === "en" ? 23 : 25,
          lineHeight: 1.45,
          textAlign: "center",
          color: "#F6F8FE",
          padding: "12px 25px",
          borderRadius: 12,
          background: "#10182BD9",
          boxShadow: "0 6px 25px #10182B22",
          opacity: Math.min(
            r(t, active.start, active.start + 0.18),
            1 - r(t, active.end, active.end + 0.2),
          ),
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
export const Film: React.FC<FilmProps> = ({ language: l, sound }) => (
  <AbsoluteFill
    style={{
      fontFamily: FONT,
      background: C.paper,
      WebkitFontSmoothing: "antialiased",
    }}
  >
    {sound && <Audio src={staticFile(`mix-${l}.wav`)} volume={1} />}
    <Sequence from={0} durationInFrames={318}>
      <Opening l={l} />
    </Sequence>
    <Sequence from={Math.round(4.9 * FPS)} durationInFrames={330}>
      <Dispatch l={l} />
    </Sequence>
    <Sequence from={10 * FPS} durationInFrames={936}>
      <Search l={l} />
    </Sequence>
    <Sequence from={25 * FPS} durationInFrames={570}>
      <Replies l={l} />
    </Sequence>
    <Sequence from={34 * FPS} durationInFrames={570}>
      <Reading l={l} />
    </Sequence>
    <Sequence from={43 * FPS} durationInFrames={300}>
      <Finale l={l} />
    </Sequence>
    <SourceJourney l={l} />
    <Subtitles l={l} />
  </AbsoluteFill>
);
