import React, { type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import story from "../story.json";
import narration from "../voice-assets/timing.json";
import {
  ArticleCover,
  BotMessages,
  PhoneFrame,
  Pointer,
  SocialFeed,
  TapRipple,
} from "./StoryArt";
export const FPS = story.fps;
export const DURATION = story.seconds * FPS;
export type Language = "zh-CN" | "en";
export type FilmProps = { language: Language; sound: boolean };
const C = {
  paper: "#F6F4EE",
  ink: "#1F293D",
  blue: "#5375EA",
  coral: "#EA8B75",
  yellow: "#EFCB76",
  muted: "#878B94",
  deep: "#172136",
};
const FONT = '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
const tr = (l: Language, zh: string, en: string) => (l === "zh-CN" ? zh : en);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 4);
const tween = (t: number, a: number, b: number, x: number, y: number) =>
  x + (y - x) * ease(prog(t, a, b));
const pop = (t: number, at: number) => {
  const p = prog(t, at, at + 0.65);
  return 1 - Math.exp(-8 * p) * Math.cos(p * 8);
};
const fade = (t: number, a: number, b: number) =>
  prog(t, a, a + 0.22) * (1 - prog(t, b - 0.22, b));
const useTime = () => useCurrentFrame() / FPS;
const question = (l: Language) =>
  tr(
    l,
    "我想用 AI 做个像素游戏。找一些开发记录、教程和踩坑经验。",
    "I want to make a pixel game with AI. Find devlogs, tutorials, and practical lessons.",
  );
const article = (l: Language, blue = false) =>
  blue
    ? tr(l, "先把角色移动和跳跃做出来", "Start with movement and jumping")
    : tr(l, "我用 AI 做了一个像素小游戏", "My first pixel game with AI");
const Box = ({
  children,
  style,
}: {
  children?: ReactNode;
  style?: CSSProperties;
}) => <div style={{ position: "absolute", ...style }}>{children}</div>;
const Texture = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity: 0.21,
      backgroundImage: "radial-gradient(#7D7C6C38 .65px, transparent .8px)",
      backgroundSize: "5px 5px",
    }}
  />
);
const Brand = ({
  dark = false,
  size = 38,
}: {
  dark?: boolean;
  size?: number;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 13,
      color: dark ? "#FFF" : C.ink,
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
      style={{ fontSize: size * 0.76, fontWeight: 700, letterSpacing: -1.1 }}
    >
      Postrove
    </span>
  </div>
);
const Chip = ({
  children,
  color = C.ink,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      padding: "12px 19px",
      background: "#FFF",
      border: "1px solid #E3E6EC",
      borderRadius: 15,
      fontSize: 20,
      color,
      boxShadow: "0 7px 15px #1F293D06",
      ...style,
    }}
  >
    {children}
  </div>
);
const Scene = ({
  children,
  bg = C.paper,
  duration,
}: {
  children: ReactNode;
  bg?: string;
  duration: number;
}) => {
  const t = useTime();
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden", opacity: 1 }}>
      <Texture />
      {children}
    </AbsoluteFill>
  );
};
const Reveal = ({
  children,
  t,
  at = 0,
  style,
}: {
  children: ReactNode;
  t: number;
  at?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      opacity: prog(t, at, at + 0.3),
      transform: `translateY(${tween(t, at, at + 0.7, 32, 0)}px)`,
      ...style,
    }}
  >
    {children}
  </div>
);
const Head = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      whiteSpace: "pre-line",
      fontSize: 68,
      lineHeight: 1.15,
      letterSpacing: -2.7,
      fontWeight: 720,
      ...style,
    }}
  >
    {children}
  </div>
);
const Scribble = ({
  width = 270,
  color = C.coral,
  progress = 1,
}: {
  width?: number;
  color?: string;
  progress?: number;
}) => (
  <svg
    width={width}
    height={26}
    viewBox="0 0 270 26"
    style={{ overflow: "visible" }}
  >
    <path
      d="M3 17Q74 2 132 10T264 8M34 22q112-15 194-8"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      pathLength="1"
      strokeDasharray="1"
      strokeDashoffset={1 - progress}
    />
  </svg>
);
const Magnify = ({ size = 25 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
  >
    <circle cx="10" cy="10" r="6.5" />
    <path d="m15 15 6 6" />
  </svg>
);
const Bookmark = ({
  size = 26,
  fill = false,
}: {
  size?: number;
  fill?: boolean;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.6"
    fill={fill ? "currentColor" : "none"}
  >
    <path d="M6 3h12v18l-6-4-6 4Z" />
  </svg>
);
const Window = ({
  children,
  title = "Postrove",
  width = 1200,
  height = 800,
  style,
}: {
  children: ReactNode;
  title?: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      position: "relative",
      width,
      height,
      background: "#FFF",
      border: "1px solid #FFFFFF",
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: "0 48px 100px -32px #1F293D4A, 0 5px 15px #1F293D0A",
      ...style,
    }}
  >
    <div
      style={{
        height: 39,
        background: "#F2F3F5",
        borderBottom: "1px solid #E4E7ED",
        display: "flex",
        alignItems: "center",
        padding: "0 15px",
        gap: 7,
      }}
    >
      {["#EE9B91", "#E9C46B", "#A8BE95"].map((c) => (
        <i
          key={c}
          style={{ width: 8, height: 8, borderRadius: 5, background: c }}
        />
      ))}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          color: "#8B909A",
        }}
      >
        {title}
      </span>
    </div>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 39,
        bottom: 0,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  </div>
);
const App = ({
  l,
  scene = "topic",
  width = 1280,
  style,
}: {
  l: Language;
  scene?: string;
  width?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      position: "relative",
      width,
      height: (width * 760) / 1100,
      background: "#F8FAFE",
      borderRadius: 17,
      overflow: "hidden",
      boxShadow: "0 42px 85px -26px #1821364A, 0 1px 3px #17213622",
      border: "1px solid #FFFFFF",
      ...style,
    }}
  >
    <Img
      src={staticFile(`demo-${scene}-${l}.png`)}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  </div>
);
const SourceCard = ({
  l,
  blue = false,
  style,
  small = false,
}: {
  l: Language;
  blue?: boolean;
  style?: CSSProperties;
  small?: boolean;
}) => (
  <div
    style={{
      width: small ? 260 : 340,
      padding: small ? 14 : 18,
      borderRadius: 20,
      background: "#FFF",
      border: "1px solid #E4E7EB",
      boxShadow: "0 20px 35px -13px #29334525",
      ...style,
    }}
  >
    <ArticleCover
      tone={blue ? "blue" : "yellow"}
      style={{
        height: small ? 125 : 175,
        aspectRatio: undefined,
        borderRadius: 12,
      }}
    />
    <div
      style={{
        fontSize: small ? 18 : 23,
        fontWeight: 650,
        lineHeight: 1.45,
        marginTop: 14,
        letterSpacing: -0.4,
      }}
    >
      {article(l, blue)}
    </div>
    <div style={{ color: C.muted, fontSize: small ? 13 : 15, marginTop: 12 }}>
      {blue
        ? "𝕏 · lin.dev"
        : tr(
            l,
            "小红书 · 林同学的开发笔记",
            "RedNote · Lin’s design notes",
          )}
    </div>
  </div>
);

/* Scene components follow the research and saved-reading workflows. */
function End({ l }: { l: Language }) {
  const t = useTime();
  return (
    <Scene duration={5} bg={C.deep}>
      <Box
        style={{
          left: -150,
          top: 610,
          width: 2250,
          height: 600,
          borderRadius: "50%",
          background: "#223456",
          transform: "rotate(-8deg)",
        }}
      />
      <Box style={{ left: 100, top: 100, opacity: prog(t, 0, 0.4) }}>
        <Brand dark size={50} />
      </Box>
      <Box style={{ left: 100, top: 276, width: 1400 }}>
        <Reveal t={t} at={0.15}>
          <Head
            style={{
              fontSize: l === "zh-CN" ? 83 : 73,
              color: "#FFF",
              lineHeight: 1.25,
            }}
          >
            {tr(
              l,
              "Postrove 可以帮你查资料，",
              "Postrove helps you research topics",
            )}
            <br />
            {tr(
              l,
              "并整理转发来的帖子。",
              "and organize the posts you forward.",
            )}
          </Head>
        </Reveal>
        <Scribble width={500} progress={prog(t, 0.6, 1.2)} />
        <Reveal t={t} at={0.8}>
          <div
            style={{
              fontSize: 31,
              color: "#C5D2EE",
              marginTop: 38,
              fontWeight: 450,
            }}
          >
            github.com/huggon1/postrove
          </div>
          <div style={{ fontSize: 23, color: "#92A3C5", marginTop: 24 }}>
            {tr(
              l,
              "开源 · 欢迎反馈和 Issue",
              "Open source · Feedback and issues welcome",
            )}
          </div>
        </Reveal>
      </Box>
      <Box
        style={{
          left: 1575,
          top: 660,
          transform: `rotate(11deg) translateY(${tween(t, 0.3, 1.1, 50, 0)}px)`,
          opacity: prog(t, 0.3, 0.8),
        }}
      >
        <div
          style={{
            width: 210,
            height: 210,
            borderRadius: 45,
            background: "#344C79",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 30px 60px #08132855",
          }}
        >
          <Img
            src={staticFile("postrove-mark.svg")}
            style={{ width: 132, filter: "brightness(0) invert(1)" }}
          />
        </div>
      </Box>
    </Scene>
  );
}
function Subtitles({ l }: { l: Language }) {
  const t = useTime(),
    cue = narration.languages[l].find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const bits = cue.text.match(
    l === "zh-CN" ? /[^。！？]+[。！？]?/g : /[^.!?]+[.!?]?/g,
  ) || [cue.text];
  const total = bits.reduce((n, s) => n + s.length, 0);
  let acc = 0;
  const normalized = prog(t, cue.start, cue.end) * total;
  const text =
    bits.find((s) => {
      acc += s.length;
      return normalized < acc;
    }) || bits[bits.length - 1];
  return (
    <Box
      style={{
        bottom: 25,
        left: 100,
        right: 100,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "12px 23px",
          fontSize: l === "zh-CN" ? 25 : 24,
          lineHeight: 1.45,
          color: "#FFF",
          background: "#172136E8",
          border: "1px solid #FFFFFF16",
          borderRadius: 13,
          boxShadow: "0 4px 14px #10182915",
          maxWidth: 1620,
          textAlign: "center",
          letterSpacing: 0.1,
        }}
      >
        {text.trim()}
      </div>
    </Box>
  );
}

const advisors = [
  {
    name: "Grok",
    platform: "X",
    mark: "𝕏",
    color: "#6585D7",
    zh: "先做一个场景，测试角色移动和跳跃。",
    en: "Start with one scene. Test movement and jumping.",
    sourceZh: "先把角色移动和跳跃做出来",
    sourceEn: "Start with movement and jumping",
    typeZh: "帖子 · 开发记录",
    typeEn: "Post · Devlog",
  },
  {
    name: "点点",
    platform: "小红书",
    mark: "小",
    color: "#D77878",
    zh: "先用方块测试碰撞，再换像素素材。",
    en: "Test collisions with blocks, then add pixel art.",
    sourceZh: "我用 AI 做了一个像素小游戏",
    sourceEn: "My first pixel game with AI",
    typeZh: "笔记 · 使用过程",
    typeEn: "Post · Practical notes",
  },
  {
    name: "Gemini",
    platform: "YouTube",
    mark: "▶",
    color: "#8A82BC",
    zh: "跟着教程实现移动、跳跃和落地检测。",
    en: "Follow a movement and collision tutorial.",
    sourceZh: "像素游戏：移动、跳跃和碰撞",
    sourceEn: "Pixel game movement, jumping, and collisions",
    typeZh: "视频 · 操作教程",
    typeEn: "Video · Walkthrough",
  },
  {
    name: "Reddit AI",
    platform: "Reddit",
    mark: "r/",
    color: "#C67D55",
    zh: "先测试手感，再补地图和其他功能。",
    en: "Test the controls before adding more features.",
    sourceZh: "第一个像素游戏，该从哪开始？",
    sourceEn: "Where should a first pixel game start?",
    typeZh: "讨论 · 经验与建议",
    typeEn: "Discussion · Practical advice",
  },
];
const who = (i: number, l: Language) =>
  i === 1 && l === "en" ? "Diandian" : advisors[i].name;
const where = (i: number, l: Language) =>
  i === 1 && l === "en" ? "RedNote" : advisors[i].platform;
const Identity = ({
  i,
  l,
  small = false,
}: {
  i: number;
  l: Language;
  small?: boolean;
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: small ? 12 : 19 }}>
    <div
      style={{
        width: small ? 43 : 65,
        height: small ? 43 : 65,
        borderRadius: small ? 14 : 20,
        background: advisors[i].color,
        color: "white",
        display: "grid",
        placeItems: "center",
        fontSize: small ? 24 : 35,
        fontWeight: 750,
        boxShadow: `0 8px 16px ${advisors[i].color}30`,
      }}
    >
      {advisors[i].mark}
    </div>
    <div>
      <div style={{ fontSize: small ? 21 : 31, fontWeight: 700 }}>
        {who(i, l)}
      </div>
      <div style={{ fontSize: small ? 14 : 18, color: C.muted, marginTop: 4 }}>
        {where(i, l)}
      </div>
    </div>
  </div>
);
const Chapter = ({ l, second = false }: { l: Language; second?: boolean }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 13,
      color: second ? "#637962" : C.blue,
      fontSize: 20,
      fontWeight: 650,
      letterSpacing: 1,
    }}
  >
    <span
      style={{
        width: 33,
        height: 33,
        borderRadius: 11,
        background: second ? "#E2EADA" : "#E4EAF9",
        display: "grid",
        placeItems: "center",
        fontSize: 17,
      }}
    >
      {second ? "02" : "01"}
    </span>
    {second
      ? tr(l, "整理收藏的内容", "Reading saved posts")
      : tr(l, "跨平台查资料", "Searching across platforms")}
  </div>
);
const Desk = ({ dark = false }: { dark?: boolean }) => (
  <>
    <Box
      style={{
        left: 120,
        top: 770,
        width: 1680,
        height: 330,
        borderRadius: 160,
        background: dark
          ? "radial-gradient(ellipse,#46608A70,transparent 68%)"
          : "radial-gradient(ellipse,#7C7E7528,transparent 69%)",
        filter: "blur(18px)",
      }}
    />
    <Box
      style={{
        left: 130,
        top: 760,
        width: 1660,
        height: 220,
        borderRadius: 36,
        background: dark
          ? "linear-gradient(135deg,#2B3D5B,#18263F)"
          : "linear-gradient(135deg,#F1EEE5,#DBDCD5)",
        transform: "perspective(1100px) rotateX(62deg)",
        boxShadow: dark
          ? "0 18px 0 #122039,0 32px 50px #080F1D40"
          : "0 17px 0 #CBCDCA,0 32px 50px #1F293D22",
      }}
    />
  </>
);
function Intro({ l }: { l: Language }) {
  const t = useTime();
  return (
    <Scene duration={3}>
      <Box
        style={{
          left: 460,
          top: 185,
          width: 1000,
          height: 710,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, #DCE4F655 0%, transparent 68%)",
        }}
      />
      <Box
        style={{
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 44,
          paddingBottom: 30,
          opacity: 1 - prog(t, 2.75, 3),
          transform: `translateY(${tween(t, 0, 0.8, 12, 0)}px)`,
        }}
      >
        <Brand size={142} />
        <div
          style={{
            fontSize: 36,
            lineHeight: 1.5,
            color: "#697488",
            opacity: ease(prog(t, 0.15, 0.65)),
          }}
        >
          {tr(
            l,
            "跨平台查资料，集中阅读保存的内容。",
            "Search across platforms. Read saved posts.",
          )}
        </div>
      </Box>
    </Scene>
  );
}
function Find({ l }: { l: Language }) {
  const t = useTime();
  const phase = t < 4 ? 1 : 2;
  const q =
    t < 2
      ? tr(l, "AI 工具 使用体验", "AI tools user experience")
      : tr(l, "AI 工具 踩坑", "AI tools practical lessons");
  return (
    <Scene duration={8}>
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} />
      </Box>
      <Box style={{ left: 100, top: 190, width: 700 }}>
        <Head style={{ fontSize: l === "zh-CN" ? 64 : 60 }}>
          {phase === 1
            ? tr(
                l,
                "查资料，要换平台、\n试关键词。",
                "I switch apps\nand try more keywords.",
              )
            : tr(
                l,
                "让 AI 搜，也可能漏掉\n平台里的帖子。",
                "AI web search can miss\nposts inside these platforms.",
              )}
        </Head>
        <div
          style={{
            marginTop: 35,
            fontSize: 27,
            lineHeight: 1.6,
            color: C.muted,
          }}
        >
          {phase === 1
            ? tr(
                l,
                "小红书搜一次，再去 X 试一遍。",
                "Try RedNote, then search again on X.",
              )
            : tr(
                l,
                "网页搜索能找到的，只是一部分内容。",
                "Web search covers only part of what is there.",
              )}
        </div>
      </Box>
      {phase === 1 ? (
        <>
          <Box
            style={{
              left: 1000,
              top: 124,
              transform: "perspective(1800px) rotateY(-5deg)",
            }}
          >
            <PhoneFrame width={390} height={790} time={t}>
              <div
                style={{
                  padding: "27px 20px",
                  background: "#FFF",
                  height: "100%",
                }}
              >
                <div
                  style={{ fontSize: 27, fontWeight: 750, marginBottom: 24 }}
                >
                  {t < 2 ? tr(l, "小红书", "RedNote") : "𝕏"}
                </div>
                <div
                  style={{
                    background: "#F0F2F5",
                    borderRadius: 15,
                    padding: 15,
                    fontSize: 18,
                    minHeight: 55,
                    display: "flex",
                    gap: 9,
                    alignItems: "center",
                  }}
                >
                  <Magnify />
                  {q}
                </div>
                {[
                  tr(l, "我的使用记录", "My experience using it"),
                  tr(l, "遇到的问题", "Problems I ran into"),
                  tr(l, "教程和实际效果", "Tutorials and real results"),
                ].map((title, i) => (
                  <div
                    key={title}
                    style={{
                      marginTop: 24,
                      border: "1px solid #E3E7EE",
                      padding: 19,
                      borderRadius: 15,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 650,
                        marginBottom: 16,
                      }}
                    >
                      {title}
                    </div>
                    {[100, 85, 94, 65].map((w, j) => (
                      <div
                        key={j}
                        style={{
                          height: 8,
                          width: `${w}%`,
                          background: j === 0 ? "#CDDAF0" : "#E7EBF0",
                          borderRadius: 4,
                          marginTop: 10,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </PhoneFrame>
          </Box>
          <Box
            style={{
              left: 1425,
              top: 405,
              width: 350,
              transform: "rotate(4deg)",
              color: C.muted,
              fontSize: 22,
              lineHeight: 1.8,
            }}
          >
            <div
              style={{
                background: "#FFF",
                padding: 25,
                borderRadius: 18,
                boxShadow: "0 20px 50px #283D5420",
              }}
            >
              {tr(l, "换一种说法再搜", "Try another search")}
              <div style={{ color: C.blue, marginTop: 12 }}>{q}</div>
            </div>
          </Box>
        </>
      ) : (
        <>
          <Box
            style={{
              left: 810,
              top: 230,
              transform: "perspective(1600px) rotateY(-4deg)",
            }}
          >
            <Window
              title={tr(l, "AI 网页搜索", "AI web search")}
              width={1000}
              height={565}
            >
              <div style={{ padding: 35 }}>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 650,
                    background: "#EDF1FA",
                    padding: 22,
                    borderRadius: 16,
                  }}
                >
                  {tr(
                    l,
                    "找一些实际使用经验和讨论。",
                    "Find practical experiences and discussions.",
                  )}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: C.muted,
                    margin: "25px 0 15px",
                  }}
                >
                  {tr(l, "网页来源", "Web sources")}
                </div>
                {[
                  tr(l, "入门文档", "Getting-started documentation"),
                  tr(l, "工具使用指南", "A guide to using the tool"),
                ].map((s, i) => (
                  <div
                    key={s}
                    style={{
                      padding: 20,
                      border: "1px solid #E5E9EE",
                      borderRadius: 13,
                      marginBottom: 13,
                      fontSize: 23,
                      display: "flex",
                      gap: 20,
                    }}
                  >
                    <span style={{ color: C.blue }}>↗</span>
                    {s}
                    <span
                      style={{
                        marginLeft: "auto",
                        color: C.muted,
                        fontSize: 18,
                      }}
                    >
                      0{i + 1}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: 20, color: C.muted, marginTop: 24 }}>
                  {tr(
                    l,
                    "还想看平台里的实际经验和讨论。",
                    "I also want the discussions inside these apps.",
                  )}
                </div>
              </div>
            </Window>
          </Box>
          <Box
            style={{
              left: 1280,
              top: 745,
              width: 470,
              background: "#FFF",
              padding: 25,
              borderRadius: 19,
              boxShadow: "0 16px 45px #273B5020",
              transform: "rotate(3deg)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 650 }}>
              {tr(l, "小红书 · X · Reddit", "RedNote · X · Reddit")}
            </div>
            <div style={{ fontSize: 19, color: C.muted, marginTop: 12 }}>
              {tr(
                l,
                "开发记录 · 实际体验 · 评论",
                "Devlogs · Experiences · Replies",
              )}
            </div>
          </Box>
        </>
      )}
    </Scene>
  );
}
function Ask({ l }: { l: Language }) {
  const t = useTime();
  return (
    <Scene duration={6}>
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Brand size={46} />
      </Box>
      <Box style={{ left: 100, top: 155, width: 1720 }}>
        <Head style={{ fontSize: l === "zh-CN" ? 65 : 60 }}>
          {tr(
            l,
            "在 Postrove 里，把问题交给选中的顾问。",
            "Ask your selected advisors in Postrove.",
          )}
        </Head>
      </Box>
      <Box
        style={{
          left: 310,
          top: 310,
          width: 1300,
          padding: 34,
          boxSizing: "border-box",
          background: "#FFF",
          borderRadius: 25,
          boxShadow: "0 18px 55px #243E5C15",
          transform: `translateY(${tween(t, 0, 0.5, 25, 0)}px)`,
        }}
      >
        <div style={{ fontSize: 21, color: C.muted, marginBottom: 18 }}>
          {tr(l, "例如，问一个问题", "For example, ask a question")}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.5,
            paddingRight: 70,
          }}
        >
          {question(l)}
        </div>
        <div
          style={{
            position: "absolute",
            right: 27,
            bottom: 35,
            width: 50,
            height: 50,
            borderRadius: 15,
            background: C.blue,
            color: "#FFF",
            display: "grid",
            placeItems: "center",
            fontSize: 30,
          }}
        >
          ↑
        </div>
      </Box>
      <svg
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          pointerEvents: "none",
        }}
      >
        {advisors.map((a, i) => {
          const end = 295 + i * 440;
          const d = `M960 495 C960 545 ${end} 530 ${end} 635`;
          return (
            <g key={a.name}>
              <path d={d} fill="none" stroke="#C8D3E5" strokeWidth="3" />
              <path
                d={d}
                fill="none"
                stroke={a.color}
                strokeWidth="4"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - prog(t, 0.9 + i * 0.15, 2.2 + i * 0.15)}
              />
            </g>
          );
        })}
      </svg>
      {advisors.map((a, i) => (
        <Box
          key={a.name}
          style={{
            left: 100 + i * 440,
            top: 635,
            width: 390,
            height: 186,
            padding: 27,
            boxSizing: "border-box",
            borderRadius: 23,
            background: "#FFF",
            boxShadow: "0 18px 45px #293E5015",
            transform: `perspective(1200px) rotateY(${i < 2 ? 3 : -3}deg)`,
          }}
        >
          <Identity i={i} l={l} />
          <div
            style={{
              marginTop: 22,
              fontSize: 20,
              color:
                prog(t, 2 + i * 0.15, 2.4 + i * 0.15) > 0 ? C.blue : C.muted,
            }}
          >
            {t < 2 + i * 0.15
              ? tr(l, "已选择", "Selected")
              : tr(l, `搜索 ${where(i, l)} 的内容`, `Search ${where(i, l)}`)}
          </div>
        </Box>
      ))}
      <Box style={{ left: 100, top: 895, color: C.muted, fontSize: 24 }}>
        {tr(
          l,
          "把同一个问题发给选中的顾问。",
          "Send the same question to your selected advisors.",
        )}
      </Box>
    </Scene>
  );
}
function Compare({ l }: { l: Language }) {
  const t = useTime();
  const app = prog(t, 5.9, 6.4);
  return (
    <Scene duration={9}>
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} />
      </Box>
      <Box style={{ left: 100, top: 145 }}>
        <Head style={{ fontSize: 63 }}>
          {t < 3.0
            ? tr(
                l,
                "一次提问，分别得到回答和来源。",
                "One question. Separate answers and sources.",
              )
            : tr(
                l,
                "自动翻译成阅读语言，原文和来源保留。",
                "Read the answers in your language. Keep the originals.",
              )}
        </Head>
      </Box>
      <Box style={{ inset: 0, opacity: 1 - app }}>
        {advisors.map((a, i) => (
          <Box
            key={a.name}
            style={{
              left: 100 + (i % 2) * 880,
              top: 275 + Math.floor(i / 2) * 315,
              width: 840,
              height: 295,
              padding: "24px 28px",
              boxSizing: "border-box",
              borderRadius: 24,
              background: "#FFF",
              boxShadow: "0 12px 40px #293E5012",
              opacity: prog(t, 0.1 + i * 0.42, 0.45 + i * 0.42),
              transform: `translateY(${tween(t, 0.1 + i * 0.42, 0.7 + i * 0.42, 22, 0)}px)`,
            }}
          >
            <Identity i={i} l={l} small />
            <div
              style={{
                fontSize: 27,
                fontWeight: 600,
                lineHeight: 1.45,
                marginTop: 19,
              }}
            >
              <div style={{ position: "relative", minHeight: 79 }}>
                <div
                  style={{
                    opacity:
                      (l === "zh-CN") === (i === 1)
                        ? 1
                        : 1 - prog(t, 3 + i * 0.12, 3.22 + i * 0.12),
                    transform: `translateY(${(l === "zh-CN") === (i === 1) ? 0 : -6 * prog(t, 3 + i * 0.12, 3.22 + i * 0.12)}px)`,
                  }}
                >
                  {i === 1 ? a.zh : a.en}
                </div>
                {(l === "zh-CN") !== (i === 1) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: prog(t, 3.24 + i * 0.12, 3.6 + i * 0.12),
                      transform: `translateY(${6 * (1 - prog(t, 3.24 + i * 0.12, 3.6 + i * 0.12))}px)`,
                    }}
                  >
                    {tr(l, a.zh, a.en)}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                borderTop: "1px solid #E6EAF0",
                marginTop: 5,
                paddingTop: 15,
                fontSize: 21,
                color: C.blue,
                opacity: prog(t, 0.65 + i * 0.42, 1 + i * 0.42),
              }}
            >
              <span>↗</span>
              {tr(l, a.sourceZh, a.sourceEn)}
            </div>
          </Box>
        ))}
      </Box>
      <Box
        style={{
          left: 100,
          top: 270,
          opacity: app,
          transform: `perspective(1800px) rotateY(2deg) translateX(${30 * (1 - app)}px)`,
        }}
      >
        <App l={l} scene="topic" width={1135} />
      </Box>
      <Box style={{ left: 1310, top: 300, width: 510, opacity: app }}>
        <div style={{ fontSize: 19, color: C.muted, marginBottom: 17 }}>
          {tr(l, "Grok · 原回答 · English", "Diandian · Original · 中文")}
        </div>
        <div style={{ fontSize: 25, lineHeight: 1.5, color: "#697488" }}>
          {tr(
            l,
            "Start with one playable scene. Test movement and jumping first.",
            "先用方块测试碰撞，再换像素素材。",
          )}
        </div>
        <div style={{ height: 1, background: "#D9DFE6", margin: "26px 0" }} />
        <div style={{ fontSize: 19, color: C.blue, marginBottom: 17 }}>
          {tr(l, "中文阅读版本", "English reading version")}
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.5, fontWeight: 600 }}>
          {tr(
            l,
            "先做一个能玩的场景，测试移动和跳跃。",
            "Test collisions with simple blocks, then add pixel art.",
          )}
        </div>
        <div
          style={{
            marginTop: 35,
            background: "#FFF",
            borderRadius: 18,
            padding: 18,
            boxShadow: "0 12px 35px #243B5010",
          }}
        >
          <ArticleCover
            tone={l === "zh-CN" ? "blue" : "yellow"}
            style={{ borderRadius: 12 }}
          />
          <div style={{ marginTop: 14, fontSize: 22, lineHeight: 1.4 }}>
            {article(l, l === "zh-CN")}
          </div>
          <div style={{ fontSize: 18, color: C.blue, marginTop: 14 }}>
            ↗ {tr(l, "查看原始来源", "Open original source")}
          </div>
        </div>
      </Box>
    </Scene>
  );
}
function Bridge({ l }: { l: Language }) {
  const t = useTime();
  return (
    <Scene duration={8}>
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} />
      </Box>
      <Box style={{ left: 100, top: 145, width: 1720 }}>
        <Head style={{ fontSize: 62 }}>
          {t < 4.3
            ? tr(
                l,
                "有些 AI 能直接搜索这些平台。",
                "Some AIs can search these platforms directly.",
              )
            : tr(
                l,
                "能不能把同一个问题，一起交给它们？",
                "Could I send the same question to them?",
              )}
        </Head>
      </Box>
      {[0, 1].map((i) => (
        <Box
          key={i}
          style={{
            left: 100 + i * 900,
            top: 310,
            opacity: prog(t, i * 0.25, 0.5 + i * 0.25),
            transform: `perspective(1700px) rotateY(${i === 0 ? 3 : -3}deg) translateY(${tween(t, i * 0.25, 0.8 + i * 0.25, 20, 0)}px)`,
          }}
        >
          <Window
            title={`${who(i, l)} · ${where(i, l)}`}
            width={810}
            height={530}
          >
            <div style={{ padding: "30px 35px" }}>
              <Identity i={i} l={l} />
              <div
                style={{
                  fontSize: 25,
                  background: "#EEF2FA",
                  padding: "20px 24px",
                  borderRadius: 15,
                  marginTop: 27,
                }}
              >
                {tr(
                  l,
                  "找一些实际使用经验和讨论。",
                  "Find practical experiences and discussions.",
                )}
              </div>
              <div
                style={{ fontSize: 22, color: C.muted, margin: "26px 0 16px" }}
              >
                {tr(
                  l,
                  `${where(i, l)} 中的相关帖子`,
                  `Related posts from ${where(i, l)}`,
                )}
              </div>
              {[
                tr(l, "我的使用记录", "My experience using it"),
                tr(l, "遇到的问题和解决方法", "Problems and what helped"),
              ].map((title, j) => (
                <div
                  key={title}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 0",
                    borderTop: "1px solid #E3E8EE",
                    fontSize: 24,
                    opacity: prog(
                      t,
                      0.8 + i * 0.3 + j * 0.2,
                      1.2 + i * 0.3 + j * 0.2,
                    ),
                  }}
                >
                  <span style={{ color: advisors[i].color }}>↗</span>
                  {title}
                </div>
              ))}
            </div>
          </Window>
        </Box>
      ))}
      <Box style={{ left: 100, top: 897, fontSize: 24, color: C.muted }}>
        {tr(
          l,
          "例如 Grok 搜 X，点点搜小红书。",
          "For example: Grok searches X; Diandian searches RedNote.",
        )}
      </Box>
    </Scene>
  );
}
function Use({ l }: { l: Language }) {
  const t = useTime();
  const translated = ease(prog(t, 1.65, 2.85));
  const original =
    l === "zh-CN" ? "reading-blue-focus-original" : "reading-focus-original";
  const focused = l === "zh-CN" ? "reading-blue-focus" : "reading-focus";
  const reading = l === "zh-CN" ? "reading-blue" : "reading";
  return (
    <Scene duration={6} bg="#F0F2EA">
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} second />
      </Box>
      <Box style={{ left: 100, top: 210, width: 510 }}>
        <Head style={{ fontSize: l === "zh-CN" ? 60 : 57 }}>
          {tr(
            l,
            "在阅读库里，\n看摘要和正文。",
            "Read summaries\nand articles\nin one library.",
          )}
        </Head>
        <div
          style={{
            fontSize: 25,
            lineHeight: 1.7,
            color: C.muted,
            marginTop: 35,
          }}
        >
          {tr(
            l,
            "可以切换原文和阅读版本，\n也能打开原始来源。",
            "Switch between the original\nand your reading version.\nOpen the source when you need it.",
          )}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          {[
            tr(l, "原文", "Original"),
            tr(l, "阅读版本", "Reading version"),
          ].map((label, i) => (
            <div
              key={label}
              style={{
                fontSize: 22,
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid #CFD9E9",
                background: translated > 0.5 === (i === 1) ? C.blue : "#FFF",
                color: translated > 0.5 === (i === 1) ? "#FFF" : C.muted,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 22, color: C.blue, marginTop: 25 }}>
          {tr(l, "English → 中文", "中文 → English")}
        </div>
        <div
          style={{
            borderTop: "1px solid #D2DCCF",
            paddingTop: 24,
            marginTop: 35,
            fontSize: 24,
            lineHeight: 1.6,
            color: "#61795E",
            opacity: prog(t, 3.8, 4.3),
          }}
        >
          {tr(
            l,
            "自己的 Agent 也能读取\n这些保存的资料。",
            "Your own agent can also read\nthe materials you saved.",
          )}
        </div>
      </Box>
      <Box
        style={{
          left: 690,
          top: 175,
          width: 1150,
          height: 795,
          transform: "perspective(1800px) rotateY(-2deg)",
        }}
      >
        <App l={l} scene={original} width={1150} />
        <Box
          style={{
            inset: 0,
            clipPath: `inset(0 ${(1 - translated) * 100}% 0 0)`,
          }}
        >
          <App l={l} scene={focused} width={1150} />
        </Box>
        <Box style={{ inset: 0, opacity: prog(t, 3.2, 3.65) }}>
          <App l={l} scene={reading} width={1150} />
        </Box>
        {translated > 0 && translated < 1 && (
          <Box
            style={{
              left: 1150 * translated,
              top: 10,
              bottom: 10,
              width: 3,
              background: "#6E91EF",
              boxShadow: "0 0 22px #6E91EF88",
            }}
          />
        )}
      </Box>
    </Scene>
  );
}

function SavedList({ l, x = false }: { l: Language; x?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFF",
        padding: "23px 18px",
      }}
    >
      <div style={{ fontSize: 23, fontWeight: 750, marginBottom: 26 }}>
        {x ? "𝕏" : "小"} {tr(l, "收藏", "Bookmarks")}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
        {tr(l, "上周保存", "Saved last week")}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 12,
            padding: "15px 0",
            borderBottom: "1px solid #ECEEF1",
          }}
        >
          <ArticleCover
            tone={x ? "blue" : "yellow"}
            style={{
              width: 100,
              height: 81,
              aspectRatio: undefined,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 17, fontWeight: 650, lineHeight: 1.5 }}>
              {i === 0
                ? article(l, x)
                : tr(
                    l,
                    ["", "像素游戏的碰撞检测", "用 AI 制作像素素材"][i],
                    ["", "Pixel game collisions", "Making pixel art with AI"][
                      i
                    ],
                  )}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              {tr(l, "7 天前", "7 days ago")}
            </div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 30, color: C.muted, fontSize: 15 }}>
        {tr(l, "这些帖子还没看完。", "I still have these posts to read.")}
      </div>
    </div>
  );
}
function Browse({ l }: { l: Language }) {
  const t = useTime();
  const later = t >= 3.4;
  const x = t >= 1.8 && t < 3.4;
  const saved = x ? t >= 2.85 : t >= 1.05;
  return (
    <Scene duration={6} bg="#F0F2EA">
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} second />
      </Box>
      <Box style={{ left: 100, top: 155, width: 690 }}>
        <Head style={{ fontSize: 64 }}>
          {later
            ? tr(
                l,
                "收藏了一周，\n我还没打开看。",
                "A week later,\nI still haven’t read them.",
              )
                .split("\n")
                .map((s, i) => (
                  <React.Fragment key={s}>
                    {i > 0 && <br />}
                    {s}
                  </React.Fragment>
                ))
            : tr(
                l,
                "刷到有用的长文，\n我会先收藏。",
                "I bookmark long posts\nthat look useful.",
              )
                .split("\n")
                .map((s, i) => (
                  <React.Fragment key={s}>
                    {i > 0 && <br />}
                    {s}
                  </React.Fragment>
                ))}
        </Head>
        <div
          style={{
            fontSize: 29,
            lineHeight: 1.05,
            color: C.muted,
            marginTop: 32,
            width: 610,
          }}
        >
          {later
            ? tr(
                l,
                "内容散在几个 App 里，\n想读时还要挨个找。",
                "The posts are saved across apps,\nso I have to find them again.",
              )
                .split("\n")
                .map((s) => <div key={s}>{s}</div>)
            : tr(
                l,
                "当时没空读完，\n想着以后再看。",
                "I don’t have time to finish them,\nso I save them for later.",
              )
                .split("\n")
                .map((s) => <div key={s}>{s}</div>)}
        </div>
        {later && (
          <div style={{ marginTop: 65, display: "flex", gap: 18 }}>
            <Chip>{tr(l, "小红书收藏", "RedNote saves")}</Chip>
            <Chip>{tr(l, "X 书签", "X bookmarks")}</Chip>
          </div>
        )}
      </Box>
      <Box
        style={{
          left: later ? 930 : 1040,
          top: 115,
          transform: "perspective(1800px) rotateY(-4deg) rotateX(2deg)",
        }}
      >
        <PhoneFrame width={380} height={780} time={t}>
          {later ? (
            <SavedList l={l} />
          ) : (
            <SocialFeed
              language={l}
              platform={x ? "x" : "xiaohongshu"}
              scroll={
                t < 1.8
                  ? tween(t, 0.1, 0.8, 0, 100)
                  : tween(t, 1.9, 2.65, 0, 100)
              }
              saved={saved}
              saveAge={t - (x ? 2.85 : 1.05)}
              time={t}
            />
          )}
        </PhoneFrame>
        {!later && (
          <TapRipple
            x={257}
            y={718}
            progress={prog(t, x ? 2.8 : 1.0, x ? 3.25 : 1.45)}
          />
        )}
      </Box>
      {later && (
        <Box
          style={{
            left: 1360,
            top: 170,
            opacity: prog(t, 3.4, 4),
            transform: `perspective(1800px) rotateY(-5deg) translateY(${tween(t, 3.4, 4.1, 40, 0)}px)`,
          }}
        >
          <PhoneFrame width={350} height={720} time={t}>
            <SavedList l={l} x />
          </PhoneFrame>
        </Box>
      )}
    </Scene>
  );
}
function Forward({ l }: { l: Language }) {
  const t = useTime();
  const chat = t >= 2.1;
  const arrived = t >= 5.7;
  return (
    <Scene duration={8} bg="#F0F2EA">
      <Desk />
      <Box style={{ left: 100, top: 65 }}>
        <Chapter l={l} second />
      </Box>
      <Box style={{ left: 670, top: 150, width: 1140 }}>
        <Head style={{ fontSize: l === "zh-CN" ? 62 : 57 }}>
          {tr(
            l,
            "把想读的帖子转发给机器人。",
            "Forward posts to a bot to read later.",
          )}
        </Head>
        <div style={{ display: "flex", gap: 12, marginTop: 25 }}>
          <Chip color={C.blue}>{tr(l, "飞书机器人", "Feishu bot")}</Chip>
          <Chip>Telegram bot</Chip>
        </div>
      </Box>
      <Box
        style={{
          left: 170,
          top: 130,
          transform: "perspective(1800px) rotateY(4deg)",
        }}
      >
        <PhoneFrame width={380} height={780} time={t}>
          {chat ? (
            <BotMessages language={l} time={t - 2.1} />
          ) : (
            <SocialFeed
              language={l}
              platform="xiaohongshu"
              scroll={0}
              saved={false}
              time={t}
            />
          )}
          {!chat && t >= 1.4 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#1D293D33",
                zIndex: 10,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  background: "#FFF",
                  padding: "24px 22px 35px",
                  width: "100%",
                  borderRadius: "23px 23px 0 0",
                  boxShadow: "0 -12px 35px #27364B17",
                }}
              >
                <div
                  style={{ fontSize: 19, fontWeight: 650, marginBottom: 22 }}
                >
                  {tr(l, "转发给", "Forward to")}
                </div>
                <div style={{ display: "flex", gap: 25 }}>
                  {[tr(l, "飞书", "Feishu"), "Telegram"].map((name, i) => (
                    <div
                      key={name}
                      style={{ fontSize: 13, textAlign: "center" }}
                    >
                      <div
                        style={{
                          width: 57,
                          height: 57,
                          borderRadius: 17,
                          background: i === 0 ? "#5679DA" : "#5BADD8",
                          color: "#FFF",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 29,
                          marginBottom: 9,
                        }}
                      >
                        ↗
                      </div>
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </PhoneFrame>
        {!chat && t >= 1.4 && (
          <TapRipple x={65} y={665} progress={prog(t, 1.7, 2.05)} />
        )}
        {!chat && <TapRipple x={332} y={728} progress={prog(t, 1.0, 1.6)} />}
        {chat && <TapRipple x={333} y={728} progress={prog(t, 2.3, 2.75)} />}
      </Box>
      <Box style={{ left: 682, top: 350, opacity: prog(t, 2.8, 3.3) }}>
        <App l={l} width={1130} scene="library" />
        <Box
          style={{
            left: 63,
            top: 256,
            width: 329,
            height: 410,
            background: "#F5F6F9",
            borderRadius: 17,
            opacity: 1 - prog(t, 5.7, 6.1),
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              padding: 32,
              textAlign: "center",
              fontSize: 22,
              color: C.muted,
            }}
          >
            {tr(l, "收到转发，正在整理…", "Forward received. Preparing…")}
          </div>
        </Box>
      </Box>
      <Box style={{ left: 645, top: 760, opacity: fade(t, 4.0, 5.7) }}>
        <div style={{ width: 40, height: 2, background: C.blue }} />
      </Box>
      <Box style={{ left: 1010, top: 900, opacity: prog(t, 6.1, 6.5) }}>
        <Chip color="#58725D" style={{ fontSize: 24 }}>
          ✓{" "}
          {tr(l, "这篇帖子已保存到阅读库。", "This post is saved in Reading.")}
        </Chip>
      </Box>
      {!arrived && (
        <Box
          style={{
            left: 680,
            top: 859,
            opacity: fade(t, 0.5, 3.2),
            fontSize: 24,
            color: C.muted,
          }}
        >
          {tr(l, "发给配置好的机器人", "Forward to your configured bot")}
        </Box>
      )}
    </Scene>
  );
}
export function Film({ language: l, sound }: FilmProps) {
  const shots = [
    { key: "intro", node: <Intro l={l} /> },
    { key: "find", node: <Find l={l} /> },
    { key: "bridge", node: <Bridge l={l} /> },
    { key: "ask", node: <Ask l={l} /> },

    { key: "compare", node: <Compare l={l} /> },
    { key: "browse", node: <Browse l={l} /> },
    { key: "forward", node: <Forward l={l} /> },
    { key: "use", node: <Use l={l} /> },
    { key: "end", node: <End l={l} /> },
  ] as const;
  return (
    <AbsoluteFill
      style={{ fontFamily: FONT, color: C.ink, background: C.paper }}
    >
      {sound && <Audio src={staticFile(`mix-${l}.wav`)} />}{" "}
      {shots.map((s) => {
        const [start, end] = story.scenes[s.key];
        return (
          <Sequence
            key={s.key}
            from={start * FPS}
            durationInFrames={(end - start) * FPS}
          >
            {s.node}
          </Sequence>
        );
      })}
      <Subtitles l={l} />
    </AbsoluteFill>
  );
}
