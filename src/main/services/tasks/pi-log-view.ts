import type { PiLogDocument, PiLogPage } from "./pi-log-document";
import { piLogNativeTheme, piLogPalette } from "./pi-log-theme";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
const stageNames = {
  search: "平台搜索与来源提取",
  collect: "读取来源",
  translation: "翻译正文",
  summary: "生成阅读简介",
  translate_question: "提问翻译",
  prepare_reading: "生成阅读版本",
  translate_content: "翻译内容",
  format_content: "整理内容格式",
  structure_content: "提取内容结构",
  introduce_content: "生成内容简介",
};
const platforms = {
  x: "X",
  xiaohongshu: "小红书",
  youtube: "YouTube",
  reddit: "Reddit",
  github: "GitHub",
  web: "网页",
};
const states: Record<string, string> = {
  queued: "排队中",
  running: "进行中",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
  cancelled: "已停止",
  stopped: "已停止",
};

export function piLogSessionLabel(page: PiLogPage): string {
  const details = page.details;
  const title =
    details?.recordedName ||
    (details?.stage ? stageNames[details.stage] : "执行记录 · 用途待记录");
  return (
    title +
    (details?.chunkIndex === undefined
      ? ""
      : ` · 第 ${details.chunkIndex + 1} 段`) +
    (details?.repair ? " · 保真修正" : "")
  );
}

export function buildPiLogDocument(document: PiLogDocument): string {
  const taskTitle = document.task?.title || "任务运行记录";
  const kind =
    document.task?.kind === "focus_search"
      ? "搜索任务"
      : document.task?.kind === "forwarding"
        ? "链接解析"
        : "任务";
  const state = states[document.task?.state ?? ""];
  const sessions = document.sessions.map((session) => ({
    ...session,
    label: piLogSessionLabel(session),
  }));
  const data = scriptJson({ ...document, sessions });
  const sourceUrl = document.task?.sourceUrl;
  const source =
    sourceUrl && /^https:\/\//.test(sourceUrl)
      ? `<a class="source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a>`
      : "";
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(taskTitle)} · Postrove 运行日志</title>
  <style>
    ${piLogPalette}
    * { box-sizing: border-box; } body { margin: 0; } [hidden] { display: none !important; }
    a { color: inherit; } button, select { font: inherit; color: inherit; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); padding: 7px 12px; }
    button { cursor: pointer; } button:disabled { opacity: .4; cursor: default; }
    button:hover:enabled { background: var(--hover); } :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .muted, time, .source { color: var(--muted); } code { font: 12px/1.6 ui-monospace, monospace; overflow-wrap: anywhere; }
    #overview { min-height: 100dvh; background: var(--canvas); padding-bottom: 28px; }
    .workspace-header { min-height: 60px; border-bottom: 1px solid var(--line); background: var(--paper); display: flex; align-items: center; gap: 12px; padding: 12px 28px; }
    .brand { font-weight: 650; letter-spacing: -.02em; } .brand::before { content: '●'; color: var(--accent); margin-right: 8px; } .breadcrumb { color: var(--muted); font-size: 12px; }
    #index { max-width: 960px; margin: 28px auto 0; padding: 28px 28px 36px; background: var(--paper); border: 1px solid var(--line); border-radius: 22px; }
    .eyebrow { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
    .badge { background: var(--canvas); border-radius: 20px; padding: 2px 9px; font-size: 12px; font-weight: 400; white-space: nowrap; }
    .badge.failed { background: #fbefed; color: var(--red); }
    h1 { margin: 12px 0 8px; font-size: 26px; line-height: 1.4; letter-spacing: -.03em; overflow-wrap: anywhere; }
    .source { font-size: 13px; text-decoration: none; overflow-wrap: anywhere; }
    .facts { display: flex; gap: 8px 24px; flex-wrap: wrap; margin: 18px 0 0; color: var(--muted); font-size: 12px; }
    .section-heading { display: flex; align-items: baseline; gap: 12px; margin: 36px 0 8px; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; } .section-heading span { font-size: 12px; color: var(--muted); }
    ol { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--line); }
    li { border-bottom: 1px solid var(--line); }
    .session-link { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 6px 12px; align-items: baseline; padding: 18px 10px; border-radius: 10px; color: var(--ink); text-decoration: none; }
    .session-link:hover { background: var(--canvas); }
    .number { color: var(--muted); font-size: 12px; } .session-title { font-size: 14px; font-weight: 550; }
    .session-target { grid-column: 2; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .session-meta { grid-column: 2 / -1; color: var(--muted); font-size: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
    details { margin-top: 24px; color: var(--muted); font-size: 12px; } summary { cursor: pointer; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 12px 0; } dd { margin: 0; min-width: 0; }
    .hint { margin: 20px 0 0; color: var(--muted); font-size: 12px; }
    #viewer { height: 100dvh; display: flex; flex-direction: column; }
    .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 24px; border-bottom: 1px solid var(--line); }
    .toolbar a { text-decoration: none; font-size: 13px; } .toolbar-task { font-size: 13px; font-weight: 500; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar select { min-width: 0; max-width: 270px; font-size: 12px; }
    #session-detail { width: 100%; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    iframe { border: 0; display: block; flex: 1; width: 100%; min-height: 0; }
    @media (max-width: 560px) {
      .workspace-header { padding: 12px 16px; } #index { margin: 16px 12px 0; padding: 24px 16px 36px; } h1 { font-size: 23px; }
      .session-link { grid-template-columns: 24px minmax(0, 1fr); padding: 16px 4px; gap: 6px 8px; }
      .session-link > .badge { grid-column: 2; justify-self: start; } .session-meta { grid-column: 2; }
      .toolbar { padding: 10px 12px; gap: 8px; } .toolbar-task { flex-basis: 70%; }
      .toolbar select { flex: 1; max-width: none; } button { padding: 7px 10px; }
    }
  </style>
</head><body>
  <div id="overview">
    <header class="workspace-header"><span class="brand">Postrove</span><span class="breadcrumb">/ 运行日志</span></header>
    <main id="index">
      <div class="eyebrow"><span>${kind}</span>${state ? `<span class="badge">${state}</span>` : ""}</div>
      <h1>${escapeHtml(taskTitle)}</h1>${source}
      <div class="facts"><span>${sessions.length} 段执行记录</span>${document.task?.createdAt ? `<span>任务创建于 <time datetime="${escapeHtml(document.task.createdAt)}">${escapeHtml(document.task.createdAt)}</time></span>` : ""}<span>导出于 <time datetime="${escapeHtml(document.exportedAt)}">${escapeHtml(document.exportedAt)}</time></span></div>
      <div class="section-heading"><h2>执行过程</h2><span>按日志更新时间排列</span></div>
      <ol>${sessions
        .map((session, index) => {
          const details = session.details;
          const target =
            details?.materialTitle ||
            (details?.platform ? platforms[details.platform] : "") ||
            details?.sourceUrl ||
            taskTitle;
          return `<li><a class="session-link" href="#session-${index + 1}">
          <span class="number">${String(index + 1).padStart(2, "0")}</span><strong class="session-title">${escapeHtml(session.label)}</strong>
          ${details?.state ? `<span class="badge ${details.state === "failed" ? "failed" : ""}">${details.state === "failed" ? "调用失败" : "已停止"}</span>` : ""}
          <span class="session-target">${escapeHtml(target)}</span>
          <span class="session-meta">${details?.attempt ? `<span>第 ${details.attempt} 次尝试</span>` : ""}<time datetime="${escapeHtml(session.updatedAt)}">${escapeHtml(session.updatedAt)}</time>${details?.model ? `<span>${escapeHtml(details.model)}</span>` : ""}</span>
        </a></li>`;
        })
        .join("")}</ol>
      <details><summary>任务与会话标识</summary><dl><dt>任务 ID</dt><dd><code>${escapeHtml(document.taskId)}</code></dd>${sessions.map((session, index) => `<dt>记录 ${index + 1}</dt><dd><code>${escapeHtml(session.executionId)} · ${escapeHtml(session.file)}</code>${session.details?.namingSource === "legacy" ? " · 用途由历史提示词识别" : ""}</dd>`).join("")}</dl></details>
      <p class="hint">所有日志保存在此文件中，可离线查看。选择执行记录后，可搜索消息、折叠内容和查看工具详情。</p>
      <noscript><p>请启用 JavaScript 后打开执行记录。</p></noscript>
    </main>
  </div>
  <section id="viewer" hidden aria-label="Pi 会话查看器">
    <nav class="toolbar" aria-label="会话导航">
      <a href="#index">← 执行目录</a><span class="toolbar-task">${escapeHtml(taskTitle)}</span>
      <button id="previous" type="button">上一段</button>
      <select id="session-select" aria-label="切换会话">${sessions.map((session, index) => `<option value="${index}">${index + 1}. ${escapeHtml(session.label)}</option>`).join("")}</select>
      <button id="next" type="button">下一段</button><div id="session-detail"></div>
    </nav>
    <iframe title="Pi 会话" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe>
  </section>
  <script id="pi-log-data" type="application/json">${data}</script>
  <script id="pi-log-theme" type="application/json">${scriptJson(piLogNativeTheme)}</script>
  <script>
    (() => {
      const { sessions, task } = JSON.parse(document.getElementById('pi-log-data').textContent);
      const theme = JSON.parse(document.getElementById('pi-log-theme').textContent);
      const overview = document.getElementById('overview');
      const viewer = document.getElementById('viewer');
      const frame = document.querySelector('iframe');
      const select = document.getElementById('session-select');
      const previous = document.getElementById('previous');
      const next = document.getElementById('next');
      let active = -1;
      document.querySelectorAll('time').forEach(time => { time.textContent = new Date(time.dateTime).toLocaleString(); });
      function route() {
        const match = /^#session-(\\d+)$/.exec(location.hash);
        const selected = match ? Number(match[1]) - 1 : -1;
        const session = sessions[selected];
        overview.hidden = Boolean(session); viewer.hidden = !session;
        if (!session) {
          frame.removeAttribute('srcdoc');
          if (active >= 0) overview.querySelectorAll('.session-link')[active].focus();
          active = -1; return;
        }
        select.value = String(selected); previous.disabled = selected === 0; next.disabled = selected === sessions.length - 1;
        document.getElementById('session-detail').textContent = [session.details?.materialTitle || task?.title, session.details?.attempt ? '第 ' + session.details.attempt + ' 次尝试' : '', new Date(session.updatedAt).toLocaleString()].filter(Boolean).join(' · ');
        if (active !== selected) {
          const bytes = Uint8Array.from(atob(session.html), character => character.charCodeAt(0));
          const native = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
          const style = native.createElement('style'); style.textContent = theme; native.head.appendChild(style);
          const title = native.createElement('meta'); title.name = 'postrove-session-title'; title.content = session.label; native.head.appendChild(title);
          const setup = native.createElement('script');
          setup.textContent = 'document.addEventListener("DOMContentLoaded", () => { const heading = document.querySelector(".header h1"); if (heading) heading.textContent = document.querySelector("meta[name=postrove-session-title]").content; const info = document.querySelector(".header-info"); if (info) { const details = document.createElement("details"); details.className = "postrove-technical"; const summary = document.createElement("summary"); summary.textContent = "会话技术信息"; info.replaceWith(details); details.append(summary, info); } });';
          native.head.appendChild(setup);
          frame.srcdoc = '<!DOCTYPE html>' + native.documentElement.outerHTML;
          frame.title = session.label; active = selected;
        }
      }
      previous.onclick = () => { location.hash = 'session-' + active; };
      next.onclick = () => { location.hash = 'session-' + (active + 2); };
      select.onchange = () => { location.hash = 'session-' + (Number(select.value) + 1); };
      window.addEventListener('hashchange', route); route();
    })();
  </script>
</body></html>`;
}
