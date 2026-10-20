(() => {
  const contract = JSON.parse(
    document.getElementById("detail-contract").textContent,
  );
  const { execution, details, results } = contract;
  const dialog = document.getElementById("detail-sheet");
  const body = document.getElementById("detail-body");
  const heading = document.getElementById("detail-title");
  const eyebrow = document.getElementById("detail-eyebrow");
  const back = document.getElementById("detail-back");
  const profiles = new Map(execution.profiles.map((p) => [p.id, p]));
  const tools = new Map(details.tools.map((t) => [t.name, t]));
  const skills = new Map(details.skillCatalog.map((s) => [s.name, s]));
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  const section = (title, content) =>
    `<section class="detail-section"><h3>${escape(title)}</h3>${content}</section>`;
  const prose = (value) => `<p class="detail-copy">${escape(value)}</p>`;
  const code = (value) =>
    `<pre>${escape(typeof value === "string" ? value : JSON.stringify(value, null, 2))}</pre>`;
  const list = (items) =>
    `<ul class="detail-list">${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`;
  const fields = (inputs) =>
    `<dl class="detail-fields">${inputs.map((input) => `<div><dt>${escape(input.key)}</dt><dd>${escape(input.value)}</dd></div>`).join("")}</dl>`;
  const button = (kind, id, label, cls = "detail-chip") =>
    `<button type="button" class="${cls}" data-inspect="${kind}" data-id="${escape(id)}">${escape(label)}</button>`;
  const skillCard = (s) =>
    `<button type="button" class="detail-link-card" data-inspect="skill" data-id="${escape(s.name)}"><span><strong>${escape(s.name)}</strong><small>${escape(s.title)}${s.status === "planned" ? " · 规划" : ""}</small></span><p>${escape(s.description)}</p></button>`;
  let current,
    history = [],
    bridgeRole = "grok-en",
    captureExample = "web",
    startupPacket,
    trigger;

  function profileView(id) {
    const p = profiles.get(id);
    const example = structuredClone(p.example);
    let catalog = [];
    let selector = "";
    let registeredTools = [...p.tools];
    if (id === "bridge") {
      const role = details.bridgeExamples.find((r) => r.id === bridgeRole);
      const skill = skills.get(role.skillName);
      catalog = [skill];
      example.submittedPrompt = role.submittedPrompt;
      selector = `<label class="detail-select-label" for="bridge-example">示例专家<select id="bridge-example" aria-label="示例专家">${details.bridgeExamples.map((r) => `<option value="${r.id}" ${r.id === bridgeRole ? "selected" : ""}>${escape(r.label)}</option>`).join("")}</select></label>`;
    } else if (id === "capture") {
      catalog = details.skillCatalog.filter((s) => s.purpose === "reading");
      const sample = details.captureExamples.find(
        (e) => e.id === captureExample,
      );
      example.url = sample.url;
      example.scope = sample.scope;
      registeredTools.push(...sample.extraTools);
      selector = `<label class="detail-select-label" for="capture-example">采集场景<select id="capture-example" aria-label="采集场景">${details.captureExamples.map((e) => `<option value="${e.id}" ${e.id === captureExample ? "selected" : ""}>${escape(e.label)}</option>`).join("")}</select></label>`;
    }
    if (p.template === "browser")
      example.skillCatalog = catalog.map(({ name, description }) => ({
        name,
        description,
      }));
    const user = { task: p.task, ...example, output: p.output };
    if (id === "bridge") {
      user.task =
        "在当前平台的新会话发送本次完整提问。等待回答生成结束，捕获完整回答并返回 replyCaptureId。";
      user.output = "replyCaptureId";
    }
    startupPacket = {
      system: execution.systems[p.template],
      user,
      tools: registeredTools,
      skills: catalog.map(({ name, description }) => ({ name, description })),
    };
    const toolsHtml = registeredTools.length
      ? `<div class="detail-chips">${registeredTools.map((name) => button("tool", name, name)).join("")}</div>`
      : prose("空工具列表。");
    const remainingTools = (p.optionalTools || []).filter(
      (t) => !registeredTools.includes(t.name),
    );
    const optional = remainingTools.length
      ? `<div class="conditional-tool">${remainingTools.map((t) => button("tool", t.name, t.name) + prose(t.when + "时注册。")).join("")}</div>`
      : "";
    const catalogHtml = catalog.length
      ? `<div class="detail-cards">${catalog.map(skillCard).join("")}</div>` +
        prose(
          "启动时提供名称与简介；调用 load_platform_skill 后，完整正文进入当前会话。",
        )
      : prose("空 Skill 列表。任务规则随本次消息提供。");
    const continuation =
      id === "bridge"
        ? `<details class="prompt-block"><summary>回答保存后的同会话消息</summary>${code({ task: "回答已保存。继续从同一回答提取原始来源引用。", replyCaptureId: "reply-capture-01", output: "sourceCaptureIds + citationsArtifactRef + observedState" })}</details>`
        : "";
    return {
      title: p.title,
      kicker:
        p.template === "browser"
          ? "BROWSER AGENT · 会话任务"
          : "TEXT AGENT · 单次调用",
      html: `${prose(p.task)}<div class="detail-meta"><span>${escape(p.label)}</span><span>${p.template === "browser" ? "共享浏览器背景" : "独立短上下文"}</span></div>${selector}${section("启动时提供", fields(p.inputs))}${section("本场景可调用工具", toolsHtml)}${optional ? section("其他场景按条件配发", optional) : ""}${section("可见 Skill", catalogHtml)}${section("提示词与任务消息", `<div class="prompt-actions"><span>提示词结构 · 示例</span><button type="button" class="copy-packet">复制启动配置</button><span class="copy-status" role="status"></span></div><details class="prompt-block" open><summary>SYSTEM · ${p.template === "browser" ? "两类浏览器 Agent 共用" : "文本 Agent 共用"}</summary>${code(startupPacket.system)}</details><details class="prompt-block" open><summary>USER · 本次任务</summary>${code(user)}</details>${continuation}`)}${section("生命周期与返回", prose(p.trigger) + `<div class="output-contract"><span>返回</span><code>${escape(p.output)}</code></div>` + prose(p.policy))}${p.template === "browser" ? `<aside class="detail-boundary">Main 持有角色、连接、语言与版本快照，并保存结果和运行状态。</aside>` : ""}`,
    };
  }

  function toolView(id) {
    const t = tools.get(id);
    const callers = t.callers.map((id) =>
      button("profile", id, profiles.get(id).title),
    );
    if (t.service)
      callers.push('<span class="detail-static-chip">Main 服务入口</span>');
    const nested = t.profileId
      ? section(
          "工具内部的 Agent",
          button(
            "profile",
            t.profileId,
            profiles.get(t.profileId).title + " · 查看启动配置",
            "detail-forward",
          ) +
            prose(
              "同一内容能力通过 Main 服务和 Agent 工具适配器调用。当前浏览器 Agent 的工具列表配发 structure_content。",
            ),
        )
      : "";
    return {
      title: t.name,
      kicker: "TOOL · " + t.title,
      html:
        prose(t.summary) +
        (t.conditional
          ? `<aside class="detail-boundary">${escape(t.conditional)}</aside>`
          : "") +
        section(
          "调用者",
          `<div class="detail-chips">${callers.join("")}</div>`,
        ) +
        section("输入", fields(t.inputs)) +
        section("返回", prose(t.output)) +
        section(
          "执行过程",
          `<ol class="detail-list">${t.steps.map((s) => `<li>${escape(s)}</li>`).join("")}</ol>`,
        ) +
        section("调用示例", code(t.example)) +
        nested,
    };
  }

  function skillView(id) {
    const s = skills.get(id);
    const callers = s.purpose === "search" ? ["bridge"] : ["capture"];
    const header = code({ name: s.name, description: s.description });
    const body = `# ${s.title}\n\n${s.guide.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
    return {
      title: s.name,
      kicker: "PLATFORM SKILL · " + s.title,
      html:
        (s.status === "planned"
          ? prose("扩展设计中的 Skill，实际接入以账号与来源交付验收为准。")
          : "") +
        section(
          "可见的 Agent",
          `<div class="detail-chips">${callers.map((id) => button("profile", id, profiles.get(id).title)).join("")}</div>`,
        ) +
        section(
          "启动索引",
          prose(
            s.purpose === "search"
              ? "桥梁任务提供当前路线的一项搜索 Skill；语言专家共用这项指南。"
              : "采集任务提供阅读 Skill 目录，Agent 按当前页面选择。",
          ) + header,
        ) +
        section("操作指南 · 中文摘要", code(body)) +
        section(
          "加载方式",
          code({ tool: "load_platform_skill", arguments: { name: s.name } }) +
            prose(
              "工具响应将指南正文加入当前会话。搜索 Skill 提供平台 AI 的固定入口；阅读任务的来源地址随本次任务提供。",
            ),
        ),
    };
  }

  function catalogView() {
    return {
      title: "平台 Skill 目录",
      kicker: "SKILL CATALOG · 按任务提供",
      html:
        prose(
          "两类浏览器 Agent 都先读取名称与简介，再自行选择并加载正文。加载后的指南说明平台入口、读取范围和可用工具。",
        ) +
        section(
          "平台桥梁 · 当前路线的一项搜索 Skill",
          `<div class="detail-cards">${details.skillCatalog
            .filter((s) => s.purpose === "search")
            .map(skillCard)
            .join("")}</div>`,
        ) +
        section(
          "内容采集 · 阅读 Skill",
          `<div class="detail-cards">${details.skillCatalog
            .filter((s) => s.purpose === "reading")
            .map(skillCard)
            .join("")}</div>`,
        ) +
        section(
          "加载工具",
          button(
            "tool",
            "load_platform_skill",
            "load_platform_skill · 查看输入输出",
            "detail-forward",
          ),
        ),
    };
  }

  function policyView() {
    const cards = details.sourceProfiles
      .map(
        (p) =>
          `<section class="policy-card"><header><h3>${escape(p.title)}</h3><span>${"来源专属增强"}</span></header>${fields(
            [
              {
                key: "route / connection",
                value: p.route + " / " + p.connectionType,
              },
              {
                key: "source / kinds",
                value: p.sourcePlatform + " / " + p.sourceKinds.join(", "),
              },
              { key: "query languages", value: p.languages },
            ],
          )}<div class="policy-prompts">${prose("中文")}${code(p.zh)}${prose("English")}${code(p.en)}</div>${button("skill", p.skill, p.skill + " · 操作指南", "detail-forward")}</section>`,
      )
      .join("");
    return {
      title: "来源策略与增强提示",
      kicker: "SOURCE PROFILE · 统一准备 / 分别约束",
      html:
        prose(
          "Main 翻译原问题，再从来源策略选一句增强提示。Skill 负责平台操作。桥梁任务保持精简。",
        ) +
        section(
          "同一流程",
          code(
            "原问题 → 按专家语言翻译 → 追加来源增强句\n→ 保存实际提问与策略版本 → 桥梁发送\n→ 保存回答 → 捕获引用 → Main 校验来源身份",
          ),
        ) +
        section("按来源定义", `<div class="policy-cards">${cards}</div>`) +
        section(
          "来源验证",
          list([
            "YouTube 只接纳观察到的单个视频；时间点作为视频定位，收集按视频 ID 去重。",
            "Reddit 帖子与评论分别保留身份；阅读评论时携带必要上下文。",
            "专家语言指导问题表达；实际来源语言随捕获记录。",
            "回答成功、来源为空、来源采集失败继续分别记录。",
          ]),
        ),
    };
  }

  function contentView() {
    return {
      title: "共享内容能力",
      kicker: "SHARED CONTENT · TOOL / SERVICE",
      html:
        prose(
          "四项能力共用同一实现，入口分别服务于 Main 调度和 Agent 工具调用。每次内部模型调用使用独立短上下文。",
        ) +
        section(
          "调用分工",
          list([
            "Main 按规则调用翻译、排版、结构化和单篇导读。",
            "平台桥梁与内容采集 Agent 当前配发 structure_content。",
            "文本 Agent 接收本次内容、目标与输出要求，工具和 Skill 列表为空。",
          ]),
        ) +
        section(
          "能力与内部 Agent",
          `<div class="detail-cards">${details.tools
            .filter((t) => t.profileId)
            .map(
              (t) =>
                `<div class="capability-row">${button("tool", t.name, t.name, "detail-forward")}<p>${escape(t.summary)}</p>${button("profile", t.profileId, profiles.get(t.profileId).title + " · 启动配置", "text-button")}</div>`,
            )
            .join("")}</div>`,
        ),
    };
  }

  function nodeView(id) {
    const n = details.nodes[id];
    let extra = "";
    const forwards = {
      question: ["node", "main-topic", "任务调度"],
      links: ["node", "main-reading", "阅读管线"],
      config: ["profile", "bridge", "平台桥梁 Agent"],
      "main-topic": ["profile", "bridge", "平台桥梁 Agent"],
      "main-reading": ["profile", "capture", "内容采集 Agent"],
      browser: ["tool", "browser", "browser 工具"],
      "platform-ai": ["profile", "bridge", "平台桥梁 Agent"],
      sources: ["profile", "capture", "内容采集 Agent"],
    };
    if (id === "config")
      extra =
        section(
          "共享登录下的独立路线 · 扩展示例",
          code({
            connection: { id: "shared-gemini-account", type: "gemini-web" },
            routes: [
              {
                id: "youtube-gemini",
                status: "implemented",
                connectionRef: "shared-gemini-account",
                sourceProfileId: "youtube-videos",
                searchSkill: "gemini-youtube-search",
                enabledQueryLanguages: ["zh-CN", "en"],
              },
              {
                id: "<target>-gemini",
                status: "future-example",
                connectionRef: "shared-gemini-account",
                sourceProfileId: "<target>-sources",
                searchSkill: "gemini-<target>-search",
                enabledQueryLanguages: ["en"],
              },
            ],
            expertIdentity: "routeId + queryLanguage",
            execution: "每位专家独立会话、回答、取消与回执",
          }),
        ) +
        section(
          "来源策略",
          button("policy", "all", "查看增强提示与身份分工", "detail-forward"),
        );
    if (id === "main-topic")
      extra = section(
        "已采用的执行约定",
        list(
          contract.implementationDecisions
            .filter((d) =>
              [
                "browser-scheduling",
                "send-recovery",
                "source-evidence",
              ].includes(d.id),
            )
            .map((d) => d.decision),
        ),
      );
    if (id === "storage") {
      const tree =
        "<profile>/results/\n├─ search/\n│  ├─ latest.md / latest.json\n│  └─ <taskId>/\n│     ├─ result.md / input.json / manifest.json\n│     ├─ sources/*.md\n│     └─ assets/*\n└─ reading/\n   ├─ latest.md / latest.json\n   └─ <attemptId>/\n      ├─ result.md / input.json / manifest.json\n      ├─ sources/material-<index>.md\n      ├─ assets/*\n      └─ evidence/youtube/<videoId>/*";
      const fileNotes = {
        "<kind>/<runId>/input.json": "原始输入、实际提问、专家与语言快照。",
        "<kind>/<runId>/result.md":
          "人或其他 AI 可直接读取的完整结果。发布后固定。",
        "<kind>/<runId>/manifest.json": "运行身份、状态、来源关联与文件清单。",
        "<kind>/<runId>/sources/*.md": "本次使用的原始内容副本与捕获关联。",
        "<kind>/<runId>/assets/*": "本次内容引用的本地图片副本。",
        "<kind>/latest.md":
          "同类型最近受理且已结束运行的完整内容与固定结果路径。",
        "reading/<attemptId>/evidence/youtube/<videoId>/*":
          "原字幕、元数据、时间片段与后端版本。",
      };
      extra =
        section(
          "文件位置",
          code(tree) +
            fields(
              results.files.map((f) => ({
                key: f.path,
                value: fileNotes[f.path],
              })),
            ),
        ) +
        section(
          "交给另一个 AI",
          code(
            "请读取 <profile>/results/search/latest.md，基于其中的原始回答和来源继续分析。\n将新的分析保存到一个新文件。",
          ),
        );
    }
    if (id === "reading-tools")
      extra = section(
        "工具详情",
        `<div class="detail-chips">${["read_xiaohongshu", "read_youtube_transcript"].map((name) => button("tool", name, name)).join("")}</div>`,
      );
    const next = forwards[id];
    return {
      title: n.title,
      kicker: "SYSTEM · 职责与数据流",
      html:
        prose(n.summary) +
        n.sections.map((s) => section(s.title, list(s.items))).join("") +
        extra +
        (next ? section("继续查看", button(...next, "detail-forward")) : ""),
    };
  }

  function render(target) {
    if (target.kind === "profile") return profileView(target.id);
    if (target.kind === "tool") return toolView(target.id);
    if (target.kind === "skill") return skillView(target.id);
    if (target.kind === "catalog") return catalogView();
    if (target.kind === "content") return contentView();
    if (target.kind === "policy") return policyView();
    return nodeView(target.id);
  }

  function navigate(target, push = true, source) {
    if (dialog.open && push && current) history.push(current);
    if (!dialog.open) {
      history = [];
      trigger = source;
      trigger?.focus();
    }
    current = target;
    const view = render(target);
    heading.textContent = view.title;
    eyebrow.textContent = view.kicker;
    body.innerHTML = view.html;
    body.scrollTop = 0;
    back.hidden = history.length === 0;
    document
      .querySelectorAll(".system-diagram [data-inspect]")
      .forEach((el) => {
        const active =
          el.dataset.inspect === target.kind && el.dataset.id === target.id;
        el.classList.toggle("is-selected", active);
        el.setAttribute("aria-expanded", String(active));
      });
    document.body.classList.add("detail-open");
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(".detail-close").focus();
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-inspect]");
    if (target)
      navigate(
        { kind: target.dataset.inspect, id: target.dataset.id },
        true,
        target,
      );
  });
  document
    .querySelector(".system-diagram")
    .addEventListener("keydown", (event) => {
      const target = event.target.closest("[data-inspect]");
      if (target && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  document
    .getElementById("detail-close")
    .addEventListener("click", () => dialog.close());
  back.addEventListener("click", () => {
    const previous = history.pop();
    if (previous) navigate(previous, false);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("detail-open");
    document
      .querySelectorAll(".system-diagram [data-inspect]")
      .forEach((el) => {
        el.classList.remove("is-selected");
        el.setAttribute("aria-expanded", "false");
      });
    trigger?.focus();
    history = [];
    current = undefined;
  });
  body.addEventListener("change", (event) => {
    if (!["bridge-example", "capture-example"].includes(event.target.id))
      return;
    const id = event.target.id;
    if (id === "bridge-example") bridgeRole = event.target.value;
    else captureExample = event.target.value;
    const view = profileView(id === "bridge-example" ? "bridge" : "capture");
    body.innerHTML = view.html;
    document.getElementById(id).focus();
  });
  body.addEventListener("click", async (event) => {
    const copy = event.target.closest(".copy-packet");
    if (!copy) return;
    const status = body.querySelector(".copy-status");
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(startupPacket, null, 2),
      );
      status.textContent = "已复制";
    } catch {
      status.textContent = "复制失败，请选择下方文本复制。";
    }
  });

  const download = document.getElementById("download-html");
  let htmlUrl;
  function prepareDownload() {
    if (htmlUrl) URL.revokeObjectURL(htmlUrl);
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector("#detail-sheet").removeAttribute("open");
    clone.querySelector("#detail-body").innerHTML = "";
    clone.querySelector("body").classList.remove("detail-open");
    clone
      .querySelectorAll(".is-selected")
      .forEach((el) => el.classList.remove("is-selected"));
    clone
      .querySelectorAll('[aria-expanded="true"]')
      .forEach((el) => el.setAttribute("aria-expanded", "false"));
    htmlUrl = URL.createObjectURL(
      new Blob(["<!doctype html>\n" + clone.outerHTML], {
        type: "text/html;charset=utf-8",
      }),
    );
    download.href = htmlUrl;
  }
  download.addEventListener("click", prepareDownload);
  prepareDownload();
})();
