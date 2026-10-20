import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const nodes = [
  {
    id: "topic",
    x: 20,
    y: 126,
    w: 210,
    h: 154,
    title: "Topics + schedules",
    label: "REACT WORKSPACE",
    lines: ["Question + language experts", "Independent replies + receipts"],
    detail:
      "The renderer sends an original question and enabled advisor IDs through validated preload IPC. Each scheduled occurrence creates a new topic. Source collection enters Reading only after an individual, selected, or all-source action.",
  },
  {
    id: "links",
    x: 20,
    y: 366,
    w: 210,
    h: 164,
    title: "Links + bot inboxes",
    label: "INTAKE",
    lines: ["Manual / Telegram / Feishu", "Authorized, durable intake"],
    detail:
      "Main saves the accepted message identity and reserved reading identity before acknowledging intake. Telegram and Feishu adapters share durable deduplication, authorization, and forwarding contracts.",
  },
  {
    id: "members",
    x: 20,
    y: 570,
    w: 210,
    h: 184,
    title: "Shared connections",
    label: "CONFIGURATION",
    lines: [
      "One login, multiple routes",
      "Source × AI × query language",
      "Route settings + separate runs",
    ],
    detail:
      "Current Grok language experts share the X connection and x-search; 点点 uses the Xiaohongshu connection. In the proposed registry, each content-platform/AI pair has its own route, enabled languages, source-profile binding, and search-Skill binding. Future Gemini routes for other sources can reuse the Gemini login. Each route-and-language expert has its own conversation, reply, cancellation, and receipt. Source readers follow the content platform and remain reusable across AI routes. Interface, query, and reading languages remain independent.",
  },
  {
    id: "main",
    x: 260,
    y: 126,
    w: 225,
    h: 194,
    title: "Main · topic orchestration",
    label: "ELECTRON MAIN",
    lines: [
      "Freeze roles and languages",
      "Translate + source sentence",
      "Dispatch / persist / recover",
    ],
    detail:
      "Main freezes expert, connection, language, and execution model. The proposed source profile selects the accepted source kinds and localized one-sentence enhancement. Main translates the original question, appends that sentence, and saves the exact text and revisions. Answer persistence precedes same-session citation extraction. Validated source identities govern collection; each expert retains independent cancellation and receipt state.",
  },
  {
    id: "reading",
    x: 260,
    y: 366,
    w: 225,
    h: 164,
    title: "Main · reading pipeline",
    label: "ELECTRON MAIN",
    lines: ["Video: try fixed reader first*", "Save original, prepare reading"],
    detail:
      "Current collection starts a capture Agent. The proposed YouTube path first calls the fixed transcript reader through PlatformAccess.collect, outside the Chrome session lock. A successful read enters saved-material processing directly. Fallback starts the capture Agent with prior-attempt evidence. Direct references retain the existing one-level scope. Translation, formatting, and introduction consume saved material.",
  },
  {
    id: "storage",
    x: 260,
    y: 825,
    w: 1040,
    h: 182,
    title: "Main · saved evidence and readable results",
    label: "LOCAL PERSISTENCE",
    lines: [
      "Original questions, exact submitted prompts, platform answers and source captures",
      "Independent reading versions, citation states and observed failure stages",
      "Immutable result.md / full latest.md / original caption evidence*",
    ],
    detail:
      "Main owns focus-search.json, advisors.json, forwarding.json, tasks.json, and the visibility/undo journal. Terminal runs publish private staging directories and atomically rename them into results/search/<taskId> or results/reading/<attemptId>. Each package contains result.md, input.json, manifest.json, sources, and cached assets. latest.md contains the newest admitted terminal result and its canonical path. Reading retries create a new attempt ID.",
  },
  {
    id: "bridge",
    x: 530,
    y: 126,
    w: 350,
    h: 164,
    title: "Platform bridge Agent",
    label: "PI CODING SESSION",
    lines: [
      "Prepared question + selected Skill summary",
      "Load route guide; submit once",
      "Save answer → same-session citations",
    ],
    task: "Submit the prepared question once. Capture the stable answer. After Main saves it, extract observed original-source citations in the same session. On submitted recovery, inspect the saved conversation.",
    tools: [
      "browser",
      "load_platform_skill",
      "capture_search_sources",
      "structure_content",
    ],
    skills: [
      "One selected route Skill: x-search or xiaohongshu-search",
      "Proposed routes: gemini-youtube-search or reddit-search",
    ],
    prompt:
      "The generic browser system and exact prepared question stay common. Main chooses the source-profile sentence. Gemini example: Search YouTube for relevant videos, answer from them, and include original video links with timestamps where applicable. Reddit example: Answer using relevant Reddit posts and comments and include their original links. The loaded Skill owns the fixed AI entry URL and page interactions.",
    output:
      "Exact question, original answer bytes, observed citation captures, source state, and checkpoints. Main validates source kind and canonical identity; reading versions stay separate.",
  },
  {
    id: "capture",
    x: 530,
    y: 366,
    w: 350,
    h: 164,
    title: "Material capture Agent",
    label: "PI CODING SESSION",
    lines: [
      "URL + scope + prior reader-attempt state",
      "Load relevant reading Skill",
      "Capture pages / comments / transcripts",
    ],
    task: "Capture the requested main material or direct reference. Preserve source order, text, images, identity, and actual coverage. Return evidence IDs and direct reference hints within the supplied scope.",
    tools: [
      "browser",
      "load_platform_skill",
      "structure_content",
      "read_xiaohongshu (when installed and eligible)",
      "read_youtube_transcript (proposed; backend ready, task URL and attempt gates)",
    ],
    skills: [
      "x-reading / xiaohongshu-reading / github-reading / web-reading",
      "youtube-reading / reddit-reading (proposed)",
    ],
    prompt:
      "The Agent receives URL, scope, prior reader-attempt state, and reading Skill summaries. It selects and loads its guide. YouTube fallback captures an accessible transcript; Reddit comments retain parent context. A task-discovered video can use the same fixed reader tool. Main dispatches direct references one level deep.",
    output:
      "Validated source captures, ordered Markdown, images, observed addresses, completeness, and reference hints.",
  },
  {
    id: "content",
    x: 530,
    y: 585,
    w: 350,
    h: 169,
    title: "Shared content capabilities",
    label: "ISOLATED TEXT AGENTS",
    lines: [
      "translate / format / structure / introduce",
      "Explicit content + one output contract",
      "Text Agents: tools [] · Skills []",
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
    x: 1115,
    y: 154,
    w: 185,
    h: 194,
    title: "Platform AI",
    label: "EXTERNAL PLATFORM",
    lines: [
      "X / Grok · 点点",
      "Gemini / Reddit AI*",
      "* Proposed integrations",
    ],
    detail:
      "Gemini Apps is the proposed AI entry for YouTube discovery; Reddit Ask supplies Reddit posts and comments. Both use the existing bridge runtime. Their browser sessions, observed capability requirements, and original-source delivery require live acceptance. Platform AI answers and original material remain separate evidence. The background Pi model keeps its existing connection.",
  },
  {
    id: "browser",
    x: 930,
    y: 154,
    w: 155,
    h: 376,
    title: "Chrome gateway",
    label: "SHARED BROWSER",
    lines: [
      "Shared site sessions",
      "Serial browser access",
      "Observed captures",
      "Login / access states",
    ],
    detail:
      "PlatformBrowser owns shared Chrome and the serial access lock. BrowserAgent resolves observed refs and task-local capture IDs. PlatformAccess validates canonical source identity and caches images. A submitted checkpoint resumes observation of the original conversation. Browser/worker failures remain distinct from platform requirements.",
  },
  {
    id: "sources",
    x: 1115,
    y: 382,
    w: 185,
    h: 148,
    title: "Original sources",
    label: "SOURCE EVIDENCE",
    lines: ["Posts / comments / videos", "Source identity + coverage"],
    detail:
      "Captured bytes establish provenance. Proposed source kinds add YouTube video IDs and separate Reddit post/comment IDs. Timestamps remain video locators while collection deduplicates by video ID. A cited Reddit comment retains parent context and captured scope. Transcript coverage describes available caption text; visual coverage stays unknown.",
  },
  {
    id: "source-profiles",
    x: 260,
    y: 585,
    w: 225,
    h: 169,
    title: "Source profiles",
    label: "PROPOSED · DECLARATIVE POLICY",
    lines: [
      "Posts / notes / videos / discussions",
      "Sentence + kinds + source identity",
      "Reader capabilities + revision",
    ],
    detail:
      "Each content-platform/AI route declares its shared AI connection, source profile, supported languages, and search Skill; enabled languages belong to that route. Source profiles keep the enhancement sentence outside the bridge's loaded Skill, so Main finishes preparation before execution. Actual citation validation enforces the expected source type. Languages within one route share its operation guide, while separate routes retain their own Skill bindings and task state.",
    prompt:
      "X: Answer using relevant X posts and include links to the original posts. Xiaohongshu: Answer using relevant Xiaohongshu notes and include links to the original notes. YouTube: Search YouTube for relevant videos, answer from them, and include original video links with timestamps where applicable. Reddit: Answer using relevant Reddit posts and comments and include their original links.",
  },
  {
    id: "youtube-reader",
    x: 930,
    y: 585,
    w: 370,
    h: 169,
    title: "Fixed transcript reader",
    label: "PROPOSED · FIXED TOOL / SERVICE",
    lines: [
      "read_youtube_transcript → yt-dlp",
      "Metadata / raw captions / timed segments",
      "Service first · browser transcript fallback",
      "0 model calls · Skills: []",
    ],
    detail:
      "read_youtube_transcript shares one implementation behind Main service and eligible capture-Agent tool entries. Main tries it before acquiring a Chrome session. It selects an original caption track, stores raw evidence, normalizes rolling cues, and returns a validated captureId. Empty or failed captions retain their actual cause. Browser fallback uses youtube-reading. Audio transcription and visual analysis are separate future capabilities.",
    output:
      "Original caption bytes, metadata, segment IDs and times, track language/origin, backend version, Markdown, captureId, and actual caption coverage. Immutable reading packages add evidence/youtube/<videoId>/ while result.md remains the readable entry.",
  },
];
const edges = [
  ["M230 210H260", ""],
  ["M485 210H530", ""],
  ["M230 440H260", ""],
  ["M485 440H530", ""],
  ["M372 320V366", "collect selected sources", 380, 347],
  ["M880 210H930", ""],
  ["M880 440H930", ""],
  ["M1085 210H1115", ""],
  ["M1085 440H1115", ""],
  ["M1208 348V382", "citations", 1218, 372],
  ["M372 530V560H705V585", "text service", 555, 553],
  ["M1007 530V546H1310V801H1225V825", "captured originals", 1175, 793],
  ["M705 754V825", "reading version", 720, 795],
  ["M230 652H246V254H260", ""],
  ["M485 620H505V300H485", ""],
  ["M450 530V570H1115V585", "YouTube service first*", 1070, 562],
  ["M880 488H917V624H930", ""],
  ["M1115 754V825", "caption evidence*", 1130, 772],
];
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1320 1035" role="img" aria-labelledby="title"><title id="title">Postrove system architecture with proposed platform expansion</title><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#7691bb"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#304563}.label{font-size:9px;letter-spacing:1px;fill:#8294b0}.title{font-size:15px;font-weight:650}.line{font-size:11px;fill:#687d9b}.edge-label{font-size:9px;fill:#8294b0}.edge{fill:none;stroke:#7691bb;stroke-width:1.4;marker-end:url(#arrow)}.node{cursor:pointer}.node:focus{outline:none}.node:focus rect,.node:hover rect{stroke:#3978ea;stroke-width:2}.node rect{fill:#fff;stroke:#d7e2f1}.worker rect{fill:#f4f8ff}.proposed rect{stroke:#819fce;stroke-dasharray:5 4;fill:#f4f8ff}</style><rect width="1320" height="1035" fill="#fbfcfe"/><text x="20" y="30" class="label">POSTROVE · CURRENT SYSTEM + PROPOSED GEMINI / REDDIT / YOUTUBE EXTENSION</text><text x="20" y="85" class="label">ENTRY POINTS</text><text x="260" y="85" class="label">ELECTRON MAIN</text><text x="530" y="85" class="label">AGENTS AND CONTENT</text><text x="930" y="85" class="label">BROWSER AND SOURCE READERS</text>${edges.map(([d, label, x, y]) => `<path class="edge" d="${d}"/>${label ? `<text x="${x}" y="${y}" class="edge-label">${esc(label)}</text>` : ""}`).join("")}${nodes.map((n) => `<g class="node ${n.task ? "worker" : ""} ${n.label.startsWith("PROPOSED") ? "proposed" : ""}" data-id="${n.id}" role="button" tabindex="0" aria-label="${esc(n.title)}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12"/><text x="${n.x + 15}" y="${n.y + 23}" class="label">${n.label}</text><text x="${n.x + 15}" y="${n.y + 49}" class="title">${esc(n.title)}</text>${n.lines.map((line, i) => `<text x="${n.x + 15}" y="${n.y + 74 + i * 20}" class="line">${esc(line)}</text>`).join("")}</g>`).join("")}</svg>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Postrove architecture</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f8fc;color:#304563;font:15px/1.65 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:40px 24px}h1{margin:0;font-size:32px;letter-spacing:-1px}p{color:#647a99;max-width:850px}.sheet{background:white;border:1px solid #dfe7f3;border-radius:18px;overflow:auto}.sheet svg{display:block;width:100%;min-width:1050px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}button,a{font:inherit;color:#356cbd}button{border:1px solid #d7e2f1;border-radius:9px;background:#fff;padding:8px 14px;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #a5c5ff}dialog{border:1px solid #d7e2f1;border-radius:18px;padding:28px;width:720px;max-width:94vw;max-height:88vh;color:#304563}dialog::backdrop{background:#192d4b77;backdrop-filter:blur(3px)}header{display:flex;justify-content:space-between;align-items:center;gap:20px}h2{font-size:23px;margin:0}h3{font-size:14px;margin:24px 0 8px;color:#4375b5}ul{padding-left:22px}code{background:#edf3fc;padding:3px 6px;border-radius:5px}footer{margin-top:22px;font-size:13px;color:#8294b0}@media(max-width:600px){main{padding:24px 14px}h1{font-size:27px}dialog{padding:20px}}</style></head><body><main><h1>Postrove architecture</h1><p>Main orchestrates independent replies and saved-source reading. The diagram adds proposed Gemini/YouTube, Reddit AI, source profiles, and a fixed transcript reader. Select a node for tasks, tools, Skills, prompts, and evidence.</p><nav aria-label="Execution details">${nodes
  .filter((n) => n.task || ["source-profiles", "youtube-reader"].includes(n.id))
  .map((n) => `<button data-id="${n.id}">${n.title}</button>`)
  .join(
    "",
  )}<a href="overview.svg" download>Download SVG</a><a href="../architecture-overview.md">Current runtime</a><a href="../platform-expansion-design.md">Proposed expansion</a></nav><div class="sheet">${svg.replace('role="img"', 'role="group"')}</div><footer>Current runtime + proposed expansion · New platform routes and transcript collection require live acceptance.</footer></main><dialog aria-labelledby="detail-title"><header><h2 id="detail-title"></h2><button id="close" aria-label="Close details">Close</button></header><div id="body"></div></dialog><script>const nodes=${JSON.stringify(nodes).replaceAll("<", "\\u003c")};const dialog=document.querySelector('dialog');const text=(tag,value)=>{const element=document.createElement(tag);element.textContent=value;return element};function open(id){const node=nodes.find(item=>item.id===id);if(!node)return;document.querySelector('#detail-title').textContent=node.title;const body=document.querySelector('#body');body.replaceChildren();if(node.detail)body.append(text('p',node.detail));for(const [label,key]of [['Task / input','task'],['Available tools','tools'],['Visible Skills','skills'],['Prompts','prompt'],['Output / ownership','output']])if(node[key]!==undefined){body.append(text('h3',label));if(Array.isArray(node[key])){if(node[key].length){const list=document.createElement('ul');for(const value of node[key])list.append(text('li',value));body.append(list)}else body.append(text('code','[]'))}else body.append(text('p',node[key]))}dialog.showModal()}document.querySelectorAll('[data-id]').forEach(node=>{node.addEventListener('click',()=>open(node.dataset.id));node.addEventListener('keydown',event=>{if(node.tagName.toLowerCase()==='g'&&['Enter',' '].includes(event.key)){event.preventDefault();open(node.dataset.id)}})});document.querySelector('#close').onclick=()=>dialog.close();dialog.onclick=event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close()}};</script></body></html>`;
writeFileSync(root + "overview.svg", svg);
writeFileSync(root + "index.html", html);
