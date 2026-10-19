import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const nodes = [
  {
    id: "topic",
    x: 20,
    y: 65,
    w: 210,
    h: 116,
    title: "Topics + scheduled sends",
    label: "REACT WORKSPACE",
    lines: [
      "Question + language experts",
      "Independent replies + receipts",
    ],
    detail:
      "The renderer sends an original question and enabled advisor IDs through validated preload IPC. Each scheduled occurrence creates a new topic. Source collection enters Reading only after an individual, selected, or all-source action.",
  },
  {
    id: "links",
    x: 20,
    y: 325,
    w: 210,
    h: 116,
    title: "Links + bot inboxes",
    label: "INTAKE",
    lines: [
      "Manual HTTPS / Telegram / Feishu",
      "Durable receipt and authorization",
    ],
    detail:
      "Main saves the accepted message identity and reserved reading identity before acknowledging intake. Telegram and Feishu adapters share durable deduplication, authorization, and forwarding contracts.",
  },
  {
    id: "members",
    x: 20,
    y: 595,
    w: 210,
    h: 116,
    title: "Shared connections",
    label: "CONFIGURATION",
    lines: [
      "One login, language experts",
      "Interface / query / reading language",
    ],
    detail:
      "Grok Chinese and English share connection x-grok, the X browser session, and x-search. 点点 Chinese uses xiaohongshu-diandian and xiaohongshu-search. advisors.json stores enabled experts. preferences.json stores interface language, reading-language preference, and browser visibility.",
  },
  {
    id: "main",
    x: 275,
    y: 65,
    w: 235,
    h: 116,
    title: "Main · topic orchestration",
    label: "ELECTRON MAIN",
    lines: [
      "Freeze roles, languages, identities",
      "Prepare question / dispatch / persist",
    ],
    detail:
      "Main saves expert run IDs, shared connection IDs, resolved reading language, and Skill/prompt revisions. A model lease freezes the execution model and options. Main translates the question, appends the post-enhancement sentence, saves the submitted checkpoint, commits answers before citation extraction, and prepares reading versions. Each expert has its own AbortSignal.",
  },
  {
    id: "reading",
    x: 275,
    y: 325,
    w: 235,
    h: 116,
    title: "Main · reading pipeline",
    label: "ELECTRON MAIN",
    lines: [
      "Save source before processing",
      "Main material + direct references",
    ],
    detail:
      "Main validates and saves capture-backed source material. It dispatches one level of direct references as separate collection jobs. The reading worker translates saved chunks, checks fidelity, and produces a short introduction for each material. Completed chunks and original sources survive later failures.",
  },
  {
    id: "storage",
    x: 275,
    y: 595,
    w: 235,
    h: 116,
    title: "Main · stores + results",
    label: "LOCAL PERSISTENCE",
    lines: [
      "Original / reading version / receipts",
      "Immutable result.md + full latest.md",
    ],
    detail:
      "Main owns focus-search.json, advisors.json, forwarding.json, tasks.json, and the visibility/undo journal. Terminal runs publish private staging directories and atomically rename them into results/search/<taskId> or results/reading/<attemptId>. Each package contains result.md, input.json, manifest.json, sources, and cached assets. latest.md contains the newest admitted terminal result and its canonical path. Reading retries create a new attempt ID.",
  },
  {
    id: "bridge",
    x: 560,
    y: 65,
    w: 275,
    h: 160,
    title: "Platform bridge Agent",
    label: "PI CODING SESSION",
    lines: [
      "Prepared question + output contract",
      "Load selected search Skill",
      "Capture answer → same-session citations",
    ],
    task: "Submit the prepared question once. Wait for a stable platform answer, capture it, and return capture-backed output. After Main saves the answer, extract its original post citations in the same session. On submitted recovery, inspect the saved conversation.",
    tools: [
      "browser",
      "load_platform_skill",
      "capture_search_sources",
      "structure_content",
    ],
    skills: ["x-search OR xiaohongshu-search (selected platform)"],
    prompt:
      "Generic browserSystem + platformSearchInstruction. The Skill provides the fixed platform AI URL and page guide. Main appends: “Answer using relevant posts on this platform and include links to the original posts.” Chinese uses “请基于本平台的相关帖子回答，并附原帖链接。”",
    output:
      "Exact platform question, captured answer bytes, verified post candidates, citation state, checkpoints. Main creates the reading version separately.",
  },
  {
    id: "capture",
    x: 560,
    y: 325,
    w: 275,
    h: 160,
    title: "Material capture Agent",
    label: "PI CODING SESSION",
    lines: [
      "HTTPS address + capture scope",
      "Load relevant reading Skill",
      "Capture-backed Markdown + images",
    ],
    task: "Capture the requested main material or direct reference. Preserve source order, text, images, identity, and actual coverage. Return evidence IDs and direct reference hints within the supplied scope.",
    tools: [
      "browser",
      "load_platform_skill",
      "structure_content",
      "read_xiaohongshu (when installed and eligible)",
    ],
    skills: ["x-reading", "xiaohongshu-reading", "github-reading"],
    prompt:
      "Same generic browserSystem + materialCollectionInstruction. The Agent sees catalog names/descriptions, selects a guide, and loads its full body explicitly. Main dispatches direct references one level deep.",
    output:
      "Validated source captures, ordered Markdown, images, observed addresses, completeness, and reference hints.",
  },
  {
    id: "content",
    x: 560,
    y: 595,
    w: 275,
    h: 160,
    title: "Shared content capabilities",
    label: "ISOLATED TEXT AGENTS",
    lines: [
      "translate / format / structure / introduce",
      "Explicit content + output rules",
      "Tools: []     Skills: []",
    ],
    task: "Run one text operation on supplied content. Translation follows the target language. Formatting adds readable Markdown structure. Structure returns the fixed title/Markdown/citations schema. Introduction summarizes one material within its observed coverage.",
    tools: [],
    skills: [],
    prompt:
      "translate_content uses translationSystem; format_content preserves wording, facts, language and links; structure_content preserves full content and uses observed links; introduce_content uses summarySystem. Each Agent receives explicit content and one operation contract.",
    output:
      "Translated or formatted Markdown, validated structured JSON, or a short introduction. Shared fidelity checks preserve links, executable code and identifiers; one correction repairs a failed preservation check.",
  },
  {
    id: "ai",
    x: 945,
    y: 65,
    w: 275,
    h: 116,
    title: "Platform AI",
    label: "EXTERNAL PLATFORM",
    lines: [
      "Grok on X / 点点 on Xiaohongshu",
      "Question → answer + post references",
    ],
    detail:
      "The platform AI receives the prepared question in its own web interface. It is distinct from the background model driving Pi. Platform sign-in, verification, access limits, and missing sources produce their observed receipt states.",
  },
  {
    id: "browser",
    x: 945,
    y: 285,
    w: 275,
    h: 160,
    title: "Main · Chrome gateway",
    label: "SHARED BROWSER",
    lines: [
      "Shared platform sessions",
      "Serialized access + validated HTTPS",
      "Observed captures and checkpoints",
    ],
    detail:
      "PlatformBrowser owns shared Chrome and the serial access lock. BrowserAgent resolves observed refs and task-local capture IDs. PlatformAccess validates canonical source identity and caches images. A submitted checkpoint resumes observation of the original conversation. Browser/worker failures remain distinct from platform requirements.",
  },
  {
    id: "sources",
    x: 945,
    y: 550,
    w: 275,
    h: 116,
    title: "Original posts + pages",
    label: "SOURCE EVIDENCE",
    lines: [
      "Text / images / direct references",
      "Capture IDs + actual coverage",
    ],
    detail:
      "Captured source bytes establish provenance for reading and citation validation. Main accepts original post identities from observed evidence. Partial access preserves the actual content and reason. Model-generated links are checked against observed source captures.",
  },
];
const edges = [
  ["M230 123H275", ""],
  ["M230 383H275", ""],
  ["M510 123H560", ""],
  ["M510 383H560", ""],
  ["M835 144H880V325H945", ""],
  ["M835 405H905V385H945", ""],
  ["M1080 285V181", ""],
  ["M1080 445V550", ""],
  ["M395 181V248H692V595", "process text"],
  ["M450 441V525H730V595", ""],
  ["M560 680H510", "validated output"],
  ["M275 665H250V711H230", ""],
  ["M125 595V535H295V181", "language experts"],
];
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 790" role="img" aria-labelledby="title"><title id="title">Postrove system architecture</title><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#7691bb"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#304563}.label{font-size:9px;letter-spacing:1px;fill:#8294b0}.title{font-size:15px;font-weight:650}.line{font-size:11px;fill:#687d9b}.edge{fill:none;stroke:#7691bb;stroke-width:1.4;marker-end:url(#arrow)}.node{cursor:pointer}.node:focus{outline:none}.node:focus rect,.node:hover rect{stroke:#3978ea;stroke-width:2}.node rect{fill:#fff;stroke:#d7e2f1}.worker rect{fill:#f4f8ff}</style><rect width="1240" height="790" fill="#fbfcfe"/><text x="20" y="30" class="label">POSTROVE · LOCAL DESKTOP · EXPLICIT AGENT CONTEXT</text>${edges.map(([d]) => `<path class="edge" d="${d}"/>`).join("")}${nodes.map((n) => `<g class="node ${n.task ? "worker" : ""}" data-id="${n.id}" role="button" tabindex="0" aria-label="${esc(n.title)}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12"/><text x="${n.x + 15}" y="${n.y + 23}" class="label">${n.label}</text><text x="${n.x + 15}" y="${n.y + 49}" class="title">${esc(n.title)}</text>${n.lines.map((line, i) => `<text x="${n.x + 15}" y="${n.y + 74 + i * 20}" class="line">${esc(line)}</text>`).join("")}</g>`).join("")}</svg>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Postrove architecture</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f8fc;color:#304563;font:15px/1.65 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:40px 24px}h1{margin:0;font-size:32px;letter-spacing:-1px}p{color:#647a99;max-width:850px}.sheet{background:white;border:1px solid #dfe7f3;border-radius:18px;overflow:auto}.sheet svg{display:block;width:100%;min-width:1050px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}button,a{font:inherit;color:#356cbd}button{border:1px solid #d7e2f1;border-radius:9px;background:#fff;padding:8px 14px;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #a5c5ff}dialog{border:1px solid #d7e2f1;border-radius:18px;padding:28px;width:720px;max-width:94vw;max-height:88vh;color:#304563}dialog::backdrop{background:#192d4b77;backdrop-filter:blur(3px)}header{display:flex;justify-content:space-between;align-items:center;gap:20px}h2{font-size:23px;margin:0}h3{font-size:14px;margin:24px 0 8px;color:#4375b5}ul{padding-left:22px}code{background:#edf3fc;padding:3px 6px;border-radius:5px}footer{margin-top:22px;font-size:13px;color:#8294b0}@media(max-width:600px){main{padding:24px 14px}h1{font-size:27px}dialog{padding:20px}}</style></head><body><main><h1>Postrove architecture</h1><p>Main orchestrates independent platform AI replies and a separate reading pipeline. Browser Agents load explicit platform guides. Shared text capabilities prepare readable results. Select a node to inspect its responsibility and execution context.</p><nav aria-label="Agent startup context">${nodes
  .filter((n) => n.task)
  .map((n) => `<button data-id="${n.id}">${n.title}</button>`)
  .join(
    "",
  )}<a href="overview.svg" download>Download SVG</a><a href="../architecture-overview.md">Architecture guide</a></nav><div class="sheet">${svg}</div><footer>Implementation overview · Source contracts and prompts are linked from the architecture guide.</footer></main><dialog aria-labelledby="detail-title"><header><h2 id="detail-title"></h2><button id="close" aria-label="Close details">Close</button></header><div id="body"></div></dialog><script>const nodes=${JSON.stringify(nodes).replaceAll("<", "\\u003c")};const dialog=document.querySelector('dialog');const text=(tag,value)=>{const element=document.createElement(tag);element.textContent=value;return element};function open(id){const node=nodes.find(item=>item.id===id);if(!node)return;document.querySelector('#detail-title').textContent=node.title;const body=document.querySelector('#body');body.replaceChildren();if(node.detail)body.append(text('p',node.detail));for(const [label,key]of [['Task / input','task'],['Available tools','tools'],['Visible Skills','skills'],['Prompts','prompt'],['Output / ownership','output']])if(node[key]!==undefined){body.append(text('h3',label));if(Array.isArray(node[key])){if(node[key].length){const list=document.createElement('ul');for(const value of node[key])list.append(text('li',value));body.append(list)}else body.append(text('code','[]'))}else body.append(text('p',node[key]))}dialog.showModal()}document.querySelectorAll('[data-id]').forEach(node=>{node.addEventListener('click',()=>open(node.dataset.id));node.addEventListener('keydown',event=>{if(node.tagName.toLowerCase()==='g'&&['Enter',' '].includes(event.key)){event.preventDefault();open(node.dataset.id)}})});document.querySelector('#close').onclick=()=>dialog.close();dialog.onclick=event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close()}};</script></body></html>`;
writeFileSync(root + "overview.svg", svg);
writeFileSync(root + "index.html", html);
