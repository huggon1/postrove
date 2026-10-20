import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const contract = JSON.parse(
  fs.readFileSync(root + "architecture-contract.json", "utf8"),
);
const { nodes, edges, width, height, storage, skill } = contract.diagram;
const brand = fs.readFileSync(
  new URL("../../../assets/postrove-mark.svg", import.meta.url),
  "utf8",
);
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const text = (x, y, value, cls = "body", extra = "") =>
  `<text x="${x}" y="${y}" class="${cls}" ${extra}>${escape(value)}</text>`;
function box(n) {
  const x = n.x + 19,
    tail = n.y + n.h - 19;
  return `<g class="node ${n.tone}" data-node="${n.id}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="13"/>${text(x, n.y + 24, n.kicker, "kicker")}${text(x, n.y + 51, n.title, "node-title")}${n.lines.map((s, i) => text(x, n.y + 80 + i * 24, s, "body")).join("")}${n.foot.map((s, i) => text(x, tail - (n.foot.length - 1 - i) * 17, s, "foot")).join("")}</g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title diagram-desc">
<title id="diagram-title">Postrove 系统架构</title><desc id="diagram-desc">既有平台桥梁与阅读管线保留。新增来源策略区分 AI 连接、来源平台与语言；Gemini 发现 YouTube 视频，Reddit AI 发现帖子和评论。各平台统一由采集 Agent 加载阅读 Skill，再选择浏览器和平台读取工具完成采集。两类浏览器 Agent 自行加载 Skill，文字处理继续共用内容能力。</desc>
<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#6a8bc4"/></marker></defs>
<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;fill:#36465e}.canvas{fill:#fff}.lane{font-size:14px;font-weight:650;fill:#526885}.lane-en{font-size:10px;letter-spacing:1.3px;fill:#8b99ad}.runtime{fill:#f5f8fe;stroke:#e2eaf7}.runtime-label{font-size:11px;fill:#6884b4}.node rect{fill:#fff;stroke:#dde5f0}.node.agent rect{fill:#fcfdff;stroke:#cddcf2}.node.browser rect{fill:#f3f6fb;stroke:#dae3f1}.node.external rect{fill:#fafbfd;stroke:#d8e2f0;stroke-dasharray:4 4}.kicker{font-size:9px;letter-spacing:1px;fill:#8b9bb3}.node-title{font-size:18px;font-weight:650;letter-spacing:-.3px;fill:#30496d}.body{font-size:12.5px}.foot{font-size:10.5px;fill:#8192aa}.edge{fill:none;stroke:#6a8bc4;stroke-width:1.4;marker-end:url(#arrow)}.edge.dependency{stroke-dasharray:4 4;stroke:#a9b9d1}.edge-label{font-size:10px;fill:#7c93b6}.skill rect{fill:#eaf1fd;stroke:#dce7f9}.skill text{font-size:10.5px;fill:#6785b6}.saved rect{fill:#f8faff;stroke:#dce6f5}.saved .col-title{font-size:13px;font-weight:600;fill:#526e96}.saved .path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;fill:#436caa}.saved .saved-copy{font-size:11px;fill:#7e90a8}.rule{stroke:#e1e8f3;stroke-width:1}</style>
<rect class="canvas" width="${width}" height="${height}"/>
${text(20, 27, "POSTROVE · LOCAL DESKTOP", "lane-en")}${text(20, 67, "交互入口 · React", "lane")}${text(260, 67, "Electron Main", "lane")}${text(530, 67, "Agent 与内容能力", "lane")}${text(930, 67, "浏览器与来源读取", "lane")}
<rect class="runtime" x="515" y="83" width="380" height="690" rx="18"/>${text(530, 106, "Worker · Pi Runtime / 共用执行模型连接", "runtime-label")}
${edges.map((e) => `<path class="edge ${e.kind || ""}" data-edge="${e.id}" d="${e.d}"/>${e.label ? text(e.lx, e.ly, e.label, "edge-label") : ""}`).join("")}
${nodes.map(box).join("")}
<g class="skill" data-node="skill"><rect x="530" y="310" width="350" height="42" rx="8"/>${text(543, 327, skill.load)}${text(543, 343, skill.content)}</g>
<g class="saved" data-node="storage"><rect x="260" y="825" width="1040" height="182" rx="14"/>${text(280, 856, storage.title, "node-title")}
${text(280, 889, "原始资料", "col-title")}${text(280, 914, "原问题 · 实际提问 · 平台回答", "body")}${text(280, 936, "原文 · 评论 · 字幕 · 引用", "body")}
<path class="rule" d="M602 878V942M948 878V942"/>
${text(623, 889, "阅读与阶段状态", "col-title")}${text(623, 914, "翻译、排版结果独立保存", "body")}${text(623, 936, "回答 / 来源 / 异常阶段分别记录", "body")}
${text(969, 889, "Markdown 文件交付", "col-title")}${text(969, 914, "result.md · 固定的本次结果", "body")}${text(969, 936, "latest.md · 最新完整结果", "body")}
${text(280, 972, storage.path, "path")}${text(280, 993, storage.latest, "saved-copy")}
</g></svg>`;
const mmd = `flowchart LR
  question[话题 / 定时发送] --> main[Main 冻结专家与语言 / 准备提问]
  connection[共享 AI 登录 / 独立顾问路线 / 语言专家] -.-> main
  policy[来源策略 / 一句增强 / 来源类型与身份] -.-> main
  main --> bridge[平台桥梁 Agent / 精确提问与路线 Skill 索引]
  bridge --> chrome[Chrome 网关 / 共用会话 / 串行浏览]
  chrome --> ai[平台 AI / Grok / 点点 / Gemini / Reddit AI]
  ai -.观察到的来源引用.-> canonical[Main 校验来源类型与身份]
  canonical -->|用户选择收集| reading[Main 阅读管线]
  links[手动链接 / Telegram / 飞书] --> reading
  reading --> capture[内容采集 Agent / URL 与范围 / 阅读 Skill 索引]
  capture --> chrome
  capture <-->|Skill 指导工具调用与证据返回| readers[平台读取工具 / 笔记与字幕 / 后续视频能力]
  chrome --> sources[原帖 / 评论 / 视频资料 / 网页]
  skill[Skill 目录 / 自行选择并 load] -.-> bridge
  skill -.-> capture
  sources --> save[Main 保存原始来源 / 版本 / 回执]
  save --> content[共享文本能力 / 翻译 / 排版 / 结构化 / 导读]
  content --> files[固定 result.md / 最新 latest.md / 原始字幕证据]
`;
const detailSource = fs.readFileSync(root + "detail-client.js", "utf8");
const detailCss = fs.readFileSync(root + "detail-style.css", "utf8");
const detailData = JSON.stringify({
  execution: contract.execution,
  results: contract.results,
  implementationDecisions: contract.implementationDecisions,
  details: contract.details,
  references: contract.references,
}).replaceAll("<", "\\u003c");
const nodeTargets = {
  bridge: ["profile", "bridge"],
  capture: ["profile", "capture"],
  content: ["content", "content"],
  skill: ["catalog", "catalog"],
  "source-policy": ["policy", "all"],
  "reading-tools": ["node", "reading-tools"],
};
const interactiveSvg = svg
  .replace('role="img"', 'role="group"')
  .replace("<svg xmlns=", '<svg class="system-diagram" xmlns=')
  .replace(/<g class="([^"]+)" data-node="([^"]+)">/g, (_, cls, id) => {
    const [kind, key] = nodeTargets[id] || ["node", id];
    const label =
      nodes.find((n) => n.id === id)?.title ||
      (id === "skill" ? "平台 Skill 目录" : contract.diagram.storage.title);
    return `<g class="${cls}" data-node="${id}" data-inspect="${kind}" data-id="${key}" role="button" tabindex="0" focusable="true" aria-haspopup="dialog" aria-expanded="false" aria-controls="detail-sheet" aria-label="查看${escape(label)}详情">`;
  });
const agentEntries =
  contract.execution.profiles
    .filter((p) => p.template === "browser")
    .map(
      (p) =>
        `<button type="button" data-inspect="profile" data-id="${p.id}" aria-haspopup="dialog">${escape(p.title.replace(" Agent", ""))}</button>`,
    )
    .join("") +
  `<button type="button" data-inspect="content" data-id="content" aria-haspopup="dialog">共享文字能力</button><button type="button" data-inspect="policy" data-id="all" aria-haspopup="dialog">来源策略</button><button type="button" data-inspect="node" data-id="reading-tools" aria-haspopup="dialog">平台读取工具</button>`;
const css = `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f6f8fb;color:#2f3c51;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}a{color:#3266d8;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #8aaffc;outline-offset:4px}.diagram-scroll:focus-visible{outline:2px solid #a0bcf8;outline-offset:-3px}.site-header{height:76px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 36px;background:#fff;border-bottom:1px solid #e5eaf2}.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;letter-spacing:-.7px;color:#30425f}.brand-mark{display:grid;place-items:center;width:27px;height:29px;border-radius:9px 9px 9px 3px;background:transparent}.brand-mark svg{display:block;width:33px;height:33px}.header-link{font-size:12px}main{max-width:1440px;margin:auto;padding:35px 30px 26px}.intro{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:25px}.eyebrow{font-size:10px;letter-spacing:1.7px;color:#7185a3;margin:0 0 12px}h1{font-size:31px;letter-spacing:-1px;margin:0 0 12px;font-weight:650}.lead{font-size:13px;line-height:1.9;color:#7a8ba4;margin:0;max-width:940px}.exports{display:flex;align-items:center;gap:16px;white-space:nowrap;padding-bottom:5px;font-size:11px}.exports a{color:#6582b2}figure{margin:0;background:#fff;border:1px solid #dfe7f2;border-radius:19px;overflow:hidden}.figure-header{padding:20px 25px 0;display:flex;align-items:center;justify-content:space-between;gap:15px}.figure-header h2{font-size:13px;font-weight:550;color:#6c819f;margin:0}.design-label{font-size:10px;color:#7991b4;border:1px solid #dce7f8;background:#f4f8ff;border-radius:16px;padding:5px 9px}.diagram-scroll{overflow:auto;padding:9px 12px 0;overscroll-behavior-x:contain}.system-diagram{display:block;width:100%;height:auto;min-width:1050px}.figure-notes{border-top:1px solid #e9eef6;padding:18px 25px 20px;display:grid;gap:9px}.figure-notes p{font-size:11px;line-height:1.9;color:#7c8ea8;margin:0}.figure-notes b{font-weight:550;color:#607da6}.figure-notes code{font-family:inherit;color:#6785b6}.page-footer{display:flex;justify-content:space-between;gap:15px;padding:18px 2px 0;color:#99a6b8;font-size:10px}@media(max-width:900px){.intro{align-items:flex-start;flex-direction:column;gap:18px}.exports{padding:0}main{padding:27px 20px 22px}.site-header{height:66px;padding:0 23px}h1{font-size:27px}.lead{font-size:12px}.system-diagram{min-width:1120px}.figure-header{padding:18px 19px 0}.figure-notes{padding:16px 19px}.page-footer{line-height:1.8}}@media(max-width:500px){main{padding:24px 13px 20px}.site-header{padding:0 18px}.header-link{font-size:11px}h1{font-size:25px}.lead{font-size:12px}.eyebrow{font-size:9px}.figure-header{gap:8px}.figure-header h2{font-size:11px}.diagram-scroll{padding:7px 0 0}.design-label{font-size:9px}.exports{gap:19px}.figure-notes p{font-size:11px}.page-footer{display:block}.page-footer span{display:block;margin-bottom:5px}}@media print{body{background:#fff}.site-header,.exports{display:none}main{max-width:none;padding:0}.intro{margin-bottom:12px}.lead{font-size:10px}.diagram-scroll{overflow:visible}.system-diagram{min-width:0}figure{break-inside:avoid}.page-footer{display:none}}`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Postrove 系统架构：本地任务调度、浏览器 Agent、共享内容能力与可读取结果文件。"><link rel="icon" href="data:,"><title>Postrove · 系统架构</title><style>${css}\n${detailCss}</style></head><body>
<header class="site-header"><a class="brand" href="../../../README.zh-CN.md" aria-label="查看 Postrove 项目说明"><span class="brand-mark" aria-hidden="true">${brand}</span>postrove.</a><a class="header-link" href="../index.html" lang="en">English ↗</a></header>
<main><div class="intro"><div><p class="eyebrow">SYSTEM ARCHITECTURE</p><h1>Postrove 系统架构</h1><p class="lead">平台 AI 负责发现，采集 Agent 按阅读 Skill 选择工具与页面操作。点击节点查看任务、工具、Skill、提示词和结果交付。</p></div><nav class="exports" aria-label="下载架构文件"><a id="download-html" href="./index.html" download="postrove-architecture.html">HTML ↓</a><a id="download-svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" download="postrove-architecture.svg">SVG ↓</a><a id="download-mermaid" href="data:text/plain;charset=utf-8,${encodeURIComponent(mmd)}" download="postrove-architecture.mmd">Mermaid ↓</a></nav></div>
<figure aria-labelledby="system-heading"><header class="figure-header"><h2 id="system-heading">提问、采集与结果交付，在同一条系统链路中</h2><div class="figure-tools"><span class="node-hint">点击节点查看详情</span><span class="design-label">统一采集 · 按平台验收</span></div></header><nav class="agent-entrypoints" aria-label="查看执行细节"><span class="agent-entry-label">执行细节</span>${agentEntries}</nav><div class="diagram-scroll" role="region" aria-label="完整系统架构图，小屏可横向滚动" tabindex="0">${interactiveSvg}</div><figcaption class="figure-notes"><p><b>保存顺序</b>　Main 先保存原文与引用，再生成本次阅读语言的呈现版本。来源为空时保留回答并标记部分完成；回执按回答、来源和实际异常阶段分别呈现。</p><p><b>Agent 上下文</b>　浏览器 Agent 使用共享背景与单次任务，从 Skill 索引自行加载平台指南。原始问题、角色、连接与语言快照由 Main 持有。</p><p><b>来源增强</b>　Main 按专家的来源策略追加一句同语言提示，并校验实际引用的来源类型。Gemini 面向 YouTube 视频，Reddit AI 面向帖子与评论。</p><p><b>视频覆盖</b>　视频资料由同一个采集 Agent 按 Skill 选择工具。字幕工具返回原文和时间点；后续音频或画面工具可沿用同一入口，分别保存覆盖范围。</p></figcaption></figure>
<footer class="page-footer"><span>Postrove · 系统架构</span><span>2026.10.20</span></footer></main>
<dialog id="detail-sheet" class="detail-sheet" aria-labelledby="detail-title"><header class="detail-header"><div><p id="detail-eyebrow" class="detail-eyebrow">ARCHITECTURE DETAIL</p><h2 id="detail-title">架构详情</h2></div><button type="button" id="detail-close" class="detail-close" aria-label="关闭架构详情">关闭</button></header><button type="button" id="detail-back" class="detail-back" hidden>返回上一级</button><div id="detail-body" class="detail-body"></div></dialog>
<script id="detail-contract" type="application/json">${detailData}</script><script>${detailSource}</script></body></html>`;
fs.writeFileSync(root + "index.html", html);
fs.writeFileSync(root + "overview.svg", svg);
fs.writeFileSync(root + "overview.mmd", mmd);
console.log(
  "Generated an interactive system overview, portable HTML, SVG and Mermaid from one contract.",
);
