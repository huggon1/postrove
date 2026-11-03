import { createSpeechInstaller } from './speech-install.js';
import { platforms, capabilities, presetState, availability, capabilityGroups, getSteps, siteName, sessionKey } from './catalog.js';

const storageKey = 'postrove-capability-matrix-review-v1';
let state;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  state = saved?.version === 1 && saved.sessions && saved.bots && saved.results ? saved : presetState();
} catch { state = presetState(); }
let page = location.hash === '#speech' ? 'speech' : 'matrix', selected = null, platformContext = null, platformScroll = 0, platformFocus = null, platformOptionalFocus = null, platformGoalFocus = 'default', goal = 'default', setup = null, toastTimer;
const view = document.querySelector('#view');
const drawer = document.querySelector('#capability-dialog');
const setupDialog = document.querySelector('#setup-dialog');
let installScenario = 'success';
const speechInstaller = createSpeechInstaller({
  resources: () => ({ runtime: state.readers.speech, model: state.speechModel }),
  componentReady: () => { state.readers.speech = true; save(); if (page !== 'speech') update(); },
  ready: () => { state.readers.speech = true; state.speechModel = true; state.scope = 'future'; save(); update(); },
  changed: renderSpeechSurfaces,
});
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const capById = id => capabilities.find(cap => cap.id === id);
const platform = id => platforms.find(item => item.id === id);
const button = (label, action, value = '', kind = 'secondary', extra = '') => `<button class="${kind}" data-action="${action}" data-value="${value}" ${extra}>${label}</button>`;
const dot = kind => `<i class="dot ${kind}" aria-hidden="true"></i>`;
function save() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.hidden = true, 2800); }
function update() {
  const result = state.results[selected];
  if (result?.bot && state.bots[result.bot].lastReceipt?.source === selected) state.bots[result.bot].lastReceipt.label = result.outcome === 'success' ? '来源读取已完成' : result.outcome === 'queued' ? '等待读取配置' : result.outcome === 'login_required' ? '来源要求登录' : result.outcome === 'no_captions' ? '视频缺少字幕' : '来源处理中';
  save(); render(); if (selected) renderDetail(); else if (platformContext) renderPlatform();
}
function condition(label, done, value = '') { return `<div class="condition-line"><span class="${done ? 'check' : 'pending'}" aria-hidden="true">${done ? '✓' : '○'}</span><span class="condition-label">${label}</span><span>${value || (done ? '已完成' : '待完成')}</span></div>`; }
function sessionLabel(key) { return state.sessions[key] === 'signed' ? '已登录' : state.sessions[key] === 'expired' ? '会话已过期' : '游客'; }
function icon(item) { return `<span class="platform-icon" style="color:${item.color};background:${item.tint}" aria-hidden="true">${item.mark}</span>`; }
function scopeToggle() { return `<div class="scope-toggle" aria-label="能力范围"><button data-action="scope" data-value="current" class="${state.scope === 'current' ? 'active' : ''}" aria-pressed="${state.scope === 'current'}">当前版本</button><button data-action="scope" data-value="future" class="${state.scope === 'future' ? 'active' : ''}" aria-pressed="${state.scope === 'future'}">视频扩展方案</button></div>`; }
const shortStepNames = { model: '后台模型', chrome: 'Chrome', 'reader:youtube': '字幕组件', 'reader:xhs': '图文组件', 'reader:bili': 'Bilibili 字幕组件', 'reader:speech': '音频转写组件', 'speech-model': '转写模型' };
function stepName(id) {
  if (shortStepNames[id]) return shortStepNames[id];
  if (id.startsWith('login:')) return siteName(id.slice(6)) + ' 账号';
  if (id.startsWith('expert:')) return platform(id.slice(7)).ai + ' 专家';
  return id;
}
function stepValue(step) {
  if (step.id.startsWith('login:')) return sessionLabel(step.id.slice(6));
  if (step.id.startsWith('expert:')) return state.experts[step.id.slice(7)].join('、') || '待启用';
  return step.done ? '已配置' : '待配置';
}
function configRows(steps, capId = '', pathGoal = 'default', action = 'platform-setup') {
  return `<ul class="compact-config-list">${steps.map(step => `<li class="step compact-config-row ${step.done ? 'done' : ''}" data-config-id="${step.id}" tabindex="-1"><span class="config-row-name">${stepName(step.id)}</span><span class="${step.done ? 'ready' : 'needs'}">${stepValue(step)}</span>${step.done ? '' : button('配置', action, step.id, 'text-button', `data-cap="${capId}" data-next-cap="${capId}" data-goal="${pathGoal}"`)}</li>`).join('')}</ul>`;
}
function rangeItems(id) {
  const scopes = {
    x: ['帖子正文、图片、引用和作者材料。', '受保护帖子使用有权访问的账号。'],
    xhs: ['笔记标题、正文和图片轮播；评论另计。', ...(state.scope === 'future' ? ['视频解析覆盖口述；画面文字与操作另计。'] : [])],
    youtube: [state.scope === 'future' ? '视频信息、来源字幕、口述转写和时间点。' : '视频信息、来源字幕和时间点。', '画面分析另计。'],
    reddit: ['目标帖子，或选中评论、父帖和必要上级评论。'],
    github: ['公开仓库默认 README，保留代码、表格、图片和链接。'],
    bili: [state.scope === 'future' ? '页面文字、原生字幕和音频口述。' : '通用网页的标题、简介和正文。', ...(state.scope === 'future' ? ['字幕按分 P 读取；画面分析另计。'] : [])],
    web: ['正文、图片、可访问嵌入页和一层直接引用材料。'],
  };
  return scopes[id] || [];
}
function currentAbilities(item) {
  const groups = capabilityGroups(state, item.id).filter(group => group.ready);
  return groups.length ? `<div class="ability-points">${groups.map(group => button(group.name, 'platform', item.id, 'ability-point')).join('')}</div>` : '<span class="empty-cell">—</span>';
}
function renderMatrix() {
  view.innerHTML = `<div class="section-head"><h2>功能与配置</h2><div class="aside">${scopeToggle()}</div></div><div class="table-wrap platform-table-wrap"><table class="matrix platform-matrix concise-matrix"><thead><tr><th scope="col">平台</th><th scope="col">当前能力</th></tr></thead><tbody>${platforms.map(item => `<tr id="platform-row-${item.id}" data-platform-row="${item.id}"><th scope="row"><button id="platform-open-${item.id}" class="platform-open" data-action="platform" data-value="${item.id}" aria-label="${item.name}"><span class="platform-label">${icon(item)}<b>${item.name}</b></span></button></th><td>${currentAbilities(item)}</td></tr>`).join('')}</tbody></table></div><details class="compact-disclosure inbox-disclosure"><summary>收件入口</summary><div class="inbox-grid">${botCard('telegram', 'Telegram')}${botCard('feishu', '飞书')}</div></details>`;
}
function botCard(id, name) {
  const bot = state.bots[id];
  return `<section class="inbox-card"><div class="inbox-title"><b>${name}</b><span class="mini-status">${bot.connected && bot.authorized ? '已授权' : bot.connected ? '待授权' : '待连接'}</span></div>${button(bot.connected ? bot.authorized ? '管理' : '授权聊天' : '连接', 'setup', `bot:${id}`)} ${button('试转发', 'setup', `forward:${id}`, 'text-button', bot.connected && bot.authorized ? '' : 'disabled')}${bot.lastReceipt ? `<p class="overview-note">接收成功 · ${bot.lastReceipt.label}</p>` : ''}</section>`;
}
function renderConfiguration() {
  const rows = [
    ['后台模型', state.model ? '示例模型已启用' : '用于提问准备、采集与文字处理', 'model', state.model],
    ['浏览器', state.chrome ? '示例浏览器已准备' : '用于页面读取和平台会话', 'chrome', state.chrome],
    ...['x', 'xhs', 'gemini', 'youtube', 'reddit', ...(state.scope === 'future' ? ['bili'] : [])].map(id => [siteName(id) + ' 会话', sessionLabel(id), `login:${id}`, state.sessions[id] === 'signed']),
    ...platforms.filter(p => p.ai).map(p => [p.ai + ' 语言专家', state.experts[p.id].join('、') || '选择提问语言', `expert:${p.id}`, state.experts[p.id].length > 0]),
    ['YouTube 字幕读取组件', '组件缺失时保留浏览器字幕入口', 'reader:youtube', state.readers.youtube],
    ['小红书图文读取组件', '组件缺失时保留浏览器图文读取', 'reader:xhs', state.readers.xhs],
    ...(state.scope === 'future' ? [
      ['Bilibili 字幕读取组件 · 方案', '原生字幕适配与格式转换', 'reader:bili', state.readers.bili],
      ['音频转写组件 · 方案', '用于可访问音频的语音识别', 'reader:speech', state.readers.speech],
      ['音频转写模型 · 方案', '与后台文字模型分别配置', 'speech-model', state.speechModel],
    ] : []),
  ];
  view.innerHTML = `<div class="section-head"><h2>配置</h2><div class="aside">${scopeToggle()}</div></div><div class="config-grid">${rows.map(([name, detail, id, ready]) => `<article class="config-card"><div><strong>${name.replace(' · 方案', '')}</strong><small>${stepValue({ id, done: ready })}</small></div>${button(ready ? '管理' : '配置', 'setup', id)}</article>`).join('')}</div>`;
}
function isSpeechSetup(id) { return id === 'speech-model' || id === 'reader:speech'; }
function speechCard(inDialog = false) {
  const install = speechInstaller.snapshot();
  const status = install.phase === 'ready' ? '已就绪' : install.active ? '准备中' : install.phase === 'error' ? '安装失败' : install.phase === 'cancelled' ? '已取消' : '待安装';
  const modelStatus = install.phase === 'downloading' ? `${install.progress}% · ${Math.round(190 * install.progress / 100)} / 190 MB` : install.phase === 'verifying' ? '校验中' : install.model ? '已安装' : '待下载';
  const runtimeStatus = install.runtime ? '已安装' : install.phase === 'preparing' ? '安装中' : '待安装';
  const progress = install.active ? `<div class="speech-progress">${install.phase === 'downloading' ? `<progress aria-label="模型下载" value="${install.progress}" max="100"></progress>` : `<progress aria-label="${install.phase === 'preparing' ? '安装组件' : '校验模型'}"></progress>`}</div>` : '';
  const failure = install.phase === 'error' ? `<p role="alert" class="speech-error">${install.issue === 'network' ? '模型下载中断' : '模型校验失败'}</p>` : '';
  const actions = install.active ? button('取消', 'speech-cancel') : install.phase === 'error' ? button('重试', 'speech-retry', '', 'primary') : install.phase === 'ready' ? inDialog ? button('完成', 'speech-done', '', 'primary') : '' : button('一键安装', 'speech-start', '', 'primary');
  return `<section class="speech-card" aria-label="本地转写" data-speech-phase="${install.phase}"><div class="speech-card-head"><strong>本地转写</strong><span role="status" class="${install.phase === 'ready' ? 'ready' : 'needs'}">${status}</span></div><dl class="speech-resources"><div><dt>转写组件</dt><dd>${runtimeStatus}</dd></div><div><dt>Whisper small<small>模型 · 190 MB</small></dt><dd data-speech-model-state>${modelStatus}</dd></div></dl>${progress}${failure}<div class="speech-actions">${actions}</div></section>`;
}
function renderSpeechPage() {
  view.innerHTML = `<div class="section-head"><h2>语音转文字</h2></div>${speechCard()}`;
}
function renderSpeechDialog() {
  $('#setup-content').innerHTML = `<header class="dialog-head"><h2 id="setup-title">语音转文字</h2>${button('×', 'close-setup', '', 'close-button', 'aria-label="关闭"')}</header><div class="speech-dialog-body">${speechCard(true)}</div>`;
}
function renderSpeechSurfaces(install = speechInstaller.snapshot()) {
  const cards = [...document.querySelectorAll('.speech-card')];
  if (install.phase === 'downloading' && cards.length && cards.every(card => card.dataset.speechPhase === install.phase)) {
    for (const card of cards) {
      card.querySelector('progress').value = install.progress;
      card.querySelector('[data-speech-model-state]').textContent = `${install.progress}% · ${Math.round(190 * install.progress / 100)} / 190 MB`;
    }
    return;
  }
  const focusedAction = document.activeElement?.dataset?.action;
  if (page === 'speech') render();
  if (setupDialog.open && isSpeechSetup(setup?.id)) renderSpeechDialog();
  if (focusedAction?.startsWith('speech-')) {
    const root = setupDialog.open ? setupDialog : view;
    (root.querySelector(`[data-action="${focusedAction}"]`) || root.querySelector('[data-action="speech-cancel"], [data-action="speech-done"], [data-action="speech-retry"], [data-action="speech-start"]'))?.focus({ preventScroll: true });
  }
}
function renderReadme() {
  const first = { ...presetState('first'), scope: state.scope };
  const extraConfiguration = group => group.steps.filter(step => !['model', 'chrome'].includes(step.id)).map(step => stepName(step.id)).join('、') || '—';
  view.innerHTML = `<div class="section-head"><h2>README 预览</h2><div class="aside">${scopeToggle()}</div></div><p class="readme-basics">基础配置：后台模型、Chrome</p><div class="table-wrap readme-compact-wrap"><table class="readme-compact"><thead><tr><th>平台</th><th>能力</th><th>额外配置</th></tr></thead><tbody>${platforms.map(item => `<tr><th scope="row">${item.name}</th><td>${capabilityGroups(first, item.id).map(group => `<div class="readme-group">${group.name}</div>`).join('')}</td><td>${capabilityGroups(first, item.id).map(group => `<div class="readme-group">${extraConfiguration(group)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div><details class="compact-disclosure"><summary>范围</summary>${platforms.map(item => `<div class="readme-range"><b>${item.name}</b><span>${rangeItems(item.id).join(' ')}</span></div>`).join('')}</details>`;
}
function render() {
  $('#preset').value = state.preset;
  document.querySelectorAll('[data-page]').forEach(node => { node.classList.toggle('selected', node.dataset.page === page); node.setAttribute('aria-current', node.dataset.page === page ? 'page' : 'false'); });
  $('#speech-scenario-control').hidden = page !== 'speech';
  $('#speech-scenario').disabled = speechInstaller.snapshot().active;
  if (page === 'matrix') renderMatrix(); else if (page === 'configuration') renderConfiguration(); else if (page === 'speech') renderSpeechPage(); else renderReadme();
}
function optionalRequirements(cap) {
  const options = [];
  if (cap.type !== 'ai' && ['x', 'xhs', 'reddit', 'youtube'].includes(cap.platform) || cap.id === 'bili.video') {
    const key = cap.platform;
    const gain = cap.id === 'xhs.video' ? '将账号会话用于该账号有权访问的视频笔记；转写组件和模型分别配置。' : cap.id === 'youtube.video' ? '账号会话用于浏览器访问，原始字幕工具继续使用游客请求。' : cap.id === 'bili.video' ? '来源实际要求登录时，用账号会话继续读取。' : cap.gain;
    options.push({ id: `login:${key}`, title: `${siteName(key)} 账号会话`, gain, done: state.sessions[key] === 'signed' });
  }
  if (cap.id === 'reddit.ai') options.push({ id: 'login:reddit', title: 'Reddit 账号会话', gain: '游客提问继续可用；账号会话按平台提供的范围使用。', done: state.sessions.reddit === 'signed' });
  if (cap.id === 'xhs.text') options.push({ id: 'reader:xhs', title: '图文读取组件', gain: '增加图文增强获取方式；浏览器读取路径继续保留。', done: state.readers.xhs });
  if (cap.id === 'youtube.video') options.push({ id: 'reader:youtube', title: '字幕读取组件', gain: '增加原始字幕获取方式；浏览器字幕入口继续保留。', done: state.readers.youtube });
  return options;
}
function openPlatform(id, restore = false) {
  const fromDetail = !!selected;
  selected = null; platformContext = id;
  renderPlatform();
  if (!drawer.open) drawer.showModal();
  if (restore || fromDetail) queueMicrotask(() => {
    drawer.scrollTop = platformScroll;
    platformFocusTarget()?.focus({ preventScroll: true });
  });
}
function representativePath(group) {
  return group.paths.find(path => path.goal === 'speech') || group.paths.find(path => path.capability.type === 'video') || group.paths[0];
}
function platformFocusTarget() {
  if (platformOptionalFocus) {
    const section = drawer.querySelector('[data-optional-config]');
    const row = [...(section?.querySelectorAll('[data-config-id]') || [])].find(node => node.dataset.configId === platformOptionalFocus);
    return row?.querySelector('button') || row;
  }
  const groups = capabilityGroups(state, platformContext);
  const group = groups.find(item => item.paths.some(path => path.capability.id === platformFocus && path.goal === platformGoalFocus));
  if (!group) return drawer.querySelector('[data-action="close-drawer"]');
  const section = [...drawer.querySelectorAll('[data-group-id]')].find(node => node.dataset.groupId === group.id);
  return section?.querySelector('.step:not(.done) button') || section;
}
function renderPlatform() {
  const item = platform(platformContext);
  if (!item) return;
  const restoreFocus = drawer.open && !setupDialog.open;
  const groups = capabilityGroups(state, item.id);
  const required = new Set(groups.flatMap(group => group.steps.map(step => step.id)));
  const optional = [...new Map(groups.flatMap(group => group.paths.flatMap(path => optionalRequirements(path.capability))).filter(option => !required.has(option.id)).map(option => [option.id, option])).values()];
  drawer.classList.add('platform-overview-drawer');
  $('#drawer-content').innerHTML = `<header class="dialog-head"><h2 id="drawer-title">${item.name}</h2>${button('×', 'close-drawer', '', 'close-button', 'aria-label="关闭"')}</header><div class="dialog-body compact-platform">${groups.map(group => {
    const path = representativePath(group);
    return `<section class="capability-group" data-group-id="${esc(group.id)}" tabindex="-1"><div class="group-heading"><h3>${group.name}</h3><span class="${group.ready ? 'ready' : 'needs'}">${group.ready ? '已配置' : '待配置'}</span></div>${configRows(group.steps, path.capability.id, path.goal)}</section>`;
  }).join('')}${optional.length ? `<details class="compact-disclosure" data-optional-config ${platformOptionalFocus ? 'open' : ''}><summary>可选配置</summary>${configRows(optional.map(option => ({ id: option.id, done: option.done })), '', 'default', 'optional-setup')}</details>` : ''}<details class="compact-disclosure platform-trials"><summary>试读</summary><div class="trial-picker"><select id="platform-trial-target" aria-label="试读能力">${groups.map(group => { const path = representativePath(group); return `<option value="${path.capability.id}~${path.goal}">${group.name}</option>`; }).join('')}</select>${button('打开', 'platform-trial', '', 'secondary')}</div></details><details class="compact-disclosure"><summary>范围</summary><ul class="range-list">${rangeItems(item.id).map(text => `<li>${text}</li>`).join('')}</ul></details></div>`;
  if (restoreFocus) queueMicrotask(() => {
    if (!drawer.open || setupDialog.open || selected) return;
    platformFocusTarget()?.focus({ preventScroll: true });
  });
}
function openCapability(id, nextGoal = 'default') {
  platformOptionalFocus = null;
  selected = id; platformContext = capById(id).platform; goal = nextGoal;
  drawer.classList.remove('platform-overview-drawer');
  state.goalTarget = id;
  save();
  if ($('#goal-launch')) $('#goal-launch').value = id;
  renderDetail();
  if (!drawer.open) drawer.showModal();
}
function goalsFor(cap) {
  if (cap.id === 'bili.video') return [{ value: 'default', label: '原生字幕' }, { value: 'speech', label: '音频转写' }];
  if (cap.id === 'youtube.video') return [{ value: 'default', label: '字幕' }, ...(state.scope === 'future' ? [{ value: 'speech', label: '音频转写' }] : [])];
  return [{ value: 'default', label: cap.name }];
}
function renderDetail() {
  const restoreFocus = drawer.open && !setupDialog.open;
  const previousFocusId = document.activeElement?.id;
  const cap = capById(selected);
  if (!cap) return;
  const info = platform(cap.platform), outside = cap.future && state.scope === 'current';
  const steps = getSteps(state, cap, goal), missing = steps.some(step => !step.done);
  const choices = goalsFor(cap);
  const nativeCaptions = ['youtube.video', 'bili.video'].includes(cap.id) && goal !== 'speech';
  const title = goal === 'speech' || cap.id === 'xhs.video' ? '音频转写' : cap.name;
  $('#drawer-content').innerHTML = `<header class="dialog-head"><h2 id="drawer-title">${title}</h2>${button('×', 'close-drawer', '', 'close-button', 'aria-label="关闭"')}</header><div class="dialog-body compact-detail">${button('← ' + info.name, 'back-platform', info.id, 'back-platform')}${choices.length > 1 ? `<select id="detail-goal" class="goal-select" aria-label="能力">${choices.map(item => `<option value="${item.value}" ${goal === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}</select>` : ''}${outside ? button('视频扩展方案', 'scope-in-drawer', 'future', 'secondary') : configRows(steps, cap.id, goal, 'setup')}<details class="compact-disclosure trial-disclosure" open><summary>试读</summary>${cap.type === 'ai' ? button('提问', 'try', 'success', 'primary', outside || missing ? 'disabled' : '') : `<select class="trial-select" id="trial-outcome" aria-label="试读结果"><option value="success">正常读取</option>${nativeCaptions ? '<option value="no_captions">缺少字幕</option>' : ''}<option value="login_required">要求登录</option><option value="verification">要求验证</option><option value="network_unknown">网络失败</option><option value="translation_failed">翻译失败</option></select>${button('试读', 'try-selected', '', 'primary', outside || missing ? 'disabled' : '')}`}${renderResult(cap)}</details><details class="compact-disclosure"><summary>范围</summary><ul class="range-list">${rangeItems(cap.platform).map(text => `<li>${text}</li>`).join('')}</ul></details></div>`;
  if (restoreFocus) queueMicrotask(() => {
    if (!drawer.open || setupDialog.open) return;
    const target = previousFocusId === 'detail-goal' ? drawer.querySelector('#detail-goal') : drawer.querySelector('.step:not(.done) button') || drawer.querySelector('.result-actions button') || drawer.querySelector('[data-action="try-selected"]:not(:disabled), [data-action="try"]:not(:disabled)') || drawer.querySelector('[data-action="close-drawer"]');
    target?.focus({ preventScroll: true });
  });
}
function renderResult(cap) {
  const result = state.results[cap.id];
  if (!result) return '';
  let title, actions = '';
  switch (result.outcome) {
    case 'success': title = cap.type === 'ai' ? '回答已保存' : result.speech ? '音频转写已保存' : '内容已保存'; actions = button('查看材料', 'inspect-result', cap.id); break;
    case 'queued': title = '已接收 · 待配置'; actions = getSteps(state, cap, goal).some(step => !step.done) ? button('继续配置', 'focus-next', cap.id) : button('继续读取', 'resume-inbox', cap.id); break;
    case 'no_captions': { const speechTarget = goal === 'speech' || cap.id === 'xhs.video'; title = speechTarget ? '视频信息已保存' : '视频信息已保存 · 缺少字幕'; actions = (speechTarget ? '' : button('音频转写', 'speech-fallback', cap.id)) + button('查看材料', 'inspect-result', cap.id); break; }
    case 'login_required': title = `${siteName(result.site)} 要求登录`; actions = button('登录并继续', 'recover-login', result.site) + button('查看材料', 'inspect-result', cap.id); break;
    case 'verification': title = '需要页面验证'; actions = button('完成验证', 'recover-verification', cap.id); break;
    case 'network_unknown': title = '连接失败 · 原因待确认'; actions = button('重试连接', 'recover-network', cap.id) + button('诊断', 'diagnose', cap.id); break;
    case 'translation_failed': title = '原文已保存 · 翻译失败'; actions = button('重试翻译', 'recover-translation', cap.id) + button('查看原文', 'inspect-result', cap.id); break;
  }
  return `<div class="trial-result" role="status"><div class="result-head">${title}</div><div class="result-content">${result.bot ? `<p>${result.bot === 'telegram' ? 'Telegram' : '飞书'} · 已接收</p>` : ''}<div class="result-actions">${actions}</div><details class="saved-material"><summary>已保存材料</summary><p>${result.outcome === 'queued' ? '来源链接与消息记录' : result.original ? '原文已保存' : '标题、作者、简介'}${result.translated ? ' · 阅读版本已保存' : ''}</p>${result.sourceId ? `<p>${esc(result.sourceId)}</p>` : ''}${result.speech ? '<p>来源：音频转写</p>' : ''}${result.mode === 'future' ? '<p>记录范围：视频扩展方案</p>' : ''}</details></div></div>`;
}
function runTrial(outcome, speech = false) {
  const cap = capById(selected);
  if (getSteps(state, cap, goal).some(step => !step.done) || cap.future && state.scope === 'current') { toast('先完成当前目标的配置步骤'); return; }
  const previous = state.results[cap.id];
  const continueSource = speech && previous?.outcome === 'no_captions' || previous?.outcome === 'queued';
  state.results[cap.id] = { outcome, original: ['success', 'translation_failed'].includes(outcome), translated: outcome === 'success', site: cap.platform, speech, mode: state.scope, goal, sourceId: continueSource ? previous.sourceId : `review-${Date.now().toString(36)}`, at: continueSource ? previous.at : Date.now(), bot: previous?.bot };
  update();
  setTimeout(() => drawer.querySelector('.trial-result')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 20);
}
function recoverResult(kind = 'continue') {
  const previous = state.results[selected];
  if (!previous) return;
  state.results[selected] = { ...previous, outcome: 'success', original: true, translated: true, speech: previous.speech || goal === 'speech' || selected === 'xhs.video', mode: kind === 'speech' ? 'future' : previous.mode, recovery: kind, recoveredAt: Date.now() };
  update();
  toast(kind === 'translation' ? '已继续处理同一份保存原文' : '已继续当前示例，保存材料保持原记录');
}
function openSetup(id, recovery = null) {
  setup = { id, recovery };
  renderSetup();
  if (!setupDialog.open) setupDialog.showModal();
}
function renderSetup() {
  if (isSpeechSetup(setup.id)) { renderSpeechDialog(); return; }
  const id = setup.id, [kind, key] = id.split(':');
  let title = '', hint = '', fields = '', label = '保存并返回';
  if (id === 'model') { title = '后台模型'; hint = '选择一个本地示例配置，供提问与阅读流程使用。'; fields = '<label for="model-choice">模型</label><select id="model-choice"><option>Review model</option><option>Example API</option></select>'; label = '连接并使用'; }
  else if (id === 'chrome') { title = '准备浏览器'; hint = '浏览器用于打开来源页面与保存平台会话。'; fields = '<label for="browser-choice">浏览器</label><select id="browser-choice"><option>Google Chrome</option></select>'; label = '完成'; }
  else if (kind === 'login') { title = `${state.sessions[key] === 'expired' ? '重新登录' : '登录'} ${siteName(key)}`; hint = `${siteName(key)} 的示例账号会话只保存为这个 demo 的状态。`; fields = '<label for="account-choice">账号</label><select id="account-choice"><option>Review account</option></select>'; label = '登录'; }
  else if (kind === 'expert') { const info = platform(key); title = `${info.ai} · 语言专家`; hint = '启用后，可在话题中选择这位语言专家。'; fields = info.languages.map(language => `<label class="choice-row"><input type="checkbox" name="expert-language" value="${language}" ${state.experts[key].includes(language) ? 'checked' : ''}>${language}专家</label>`).join(''); }
  else if (kind === 'reader') { title = key === 'speech' ? '音频转写组件 · 方案' : key === 'bili' ? 'Bilibili 字幕读取组件 · 方案' : key === 'youtube' ? '字幕读取组件' : '图文读取组件'; hint = key === 'speech' ? '准备可访问音频的转写运行环境。' : key === 'bili' ? '准备原生字幕适配、格式转换和分 P 定位。' : '准备专用获取方式，浏览器采集路径继续保留。'; fields = `<details class="technical"><summary>组件详情</summary>${key === 'speech' ? '媒体获取、音频提取与语音识别运行时。' : key === 'bili' ? 'Bilibili 字幕提取与统一时间片转换。' : key === 'youtube' ? 'yt-dlp / Deno · 原始字幕读取。' : 'xiaohongshu-mcp · 图文笔记读取。'}</details>`; label = '完成'; }
  else if (kind === 'bot') { const name = key === 'telegram' ? 'Telegram' : '飞书', bot = state.bots[key]; title = `${name} 收件入口`; hint = '机器人连接成功后，授权一个示例聊天接收链接。'; fields = `${condition('连接机器人', bot.connected)}${condition('授权示例聊天', bot.authorized)}<label for="chat-choice">聊天</label><select id="chat-choice"><option>Review chat</option></select>`; label = !bot.connected ? '连接机器人' : !bot.authorized ? '授权示例聊天' : '保存入口配置'; }
  else if (kind === 'forward') { title = `${key === 'telegram' ? 'Telegram' : '飞书'} · 试转发`; hint = '机器人先保存消息，再根据来源条件执行读取。'; fields = '<label for="forward-sample">来源</label><select id="forward-sample"><option value="xhs.text~login_required">小红书 · 要求登录</option><option value="youtube.video~no_captions">YouTube · 缺少字幕</option></select>'; label = '转发'; }
  else if (kind === 'verify') { title = '来源页面验证'; hint = '在这个示例中完成验证后，继续当前来源读取。'; fields = '<label class="choice-row"><input id="verify-check" type="checkbox" required>已完成验证</label>'; label = '验证完成，继续读取'; }
  else if (kind === 'inspect') { const result = state.results[key]; title = '已保存材料'; hint = result?.original ? '原文和已完成的阅读内容保持在本地示例记录中。' : '已获取的标题、作者和简介保持在本地示例记录中。'; fields = `<div class="retained"><b>先做一个可操作的小场景</b><br>作者：示例创作者<br>${result?.original ? '原文：先建立一个能运行的小场景，再逐步增加交互。' : '简介：一个从小场景开始的制作记录。正文读取停在来源访问阶段。'}<br>来源身份：本地评审 fixture${result?.sourceId ? `<br>材料记录：${esc(result.sourceId)}` : ''}</div>`; label = '返回功能详情'; }
  $('#setup-content').innerHTML = `<header class="dialog-head"><h2 id="setup-title">${title.replace(' · 方案', '')}</h2>${button('×', 'close-setup', '', 'close-button', 'aria-label="关闭"')}</header><form id="setup-form" class="setup-form">${fields}<button type="submit" class="primary">${label}</button></form>`;
  if (setupDialog.open) queueMicrotask(() => setupDialog.querySelector('button[type="submit"]')?.focus());
}
function completeSetup(event) {
  event.preventDefault();
  const { id, recovery } = setup, [kind, key] = id.split(':');
  if (kind === 'forward') {
    const [capId, outcome] = $('#forward-sample').value.split('~');
    const cap = capById(capId), missing = getSteps(state, cap).filter(step => !step.done);
    const actual = missing.length ? 'queued' : outcome;
    state.bots[key].lastReceipt = { source: capId, label: actual === 'queued' ? '等待读取配置' : actual === 'login_required' ? '来源要求登录' : '视频缺少字幕' };
    state.results[capId] = { outcome: actual, queuedOutcome: outcome, original: false, translated: false, site: cap.platform, speech: false, mode: state.scope, goal: 'default', sourceId: `review-${Date.now().toString(36)}`, at: Date.now(), bot: key };
    setupDialog.close(); setup = null; page = 'matrix'; save(); render(); openCapability(capId); toast('已接收'); return;
  }
  if (id === 'model') state.model = true;
  else if (id === 'chrome') state.chrome = true;
  else if (kind === 'login') state.sessions[key] = 'signed';
  else if (kind === 'expert') { const languages = [...document.querySelectorAll('[name="expert-language"]:checked')].map(input => input.value); state.experts[key] = languages; }
  else if (kind === 'reader') state.readers[key] = true;
  else if (id === 'speech-model') state.speechModel = true;
  else if (kind === 'bot') { const bot = state.bots[key]; if (!bot.connected) { bot.connected = true; save(); renderSetup(); render(); toast('已连接'); return; } bot.authorized = true; }
  else if (kind === 'verify') { if (!$('#verify-check').checked) return; }
  setupDialog.close(); setup = null; update();
  if (recovery && selected) recoverResult(recovery);
  else if (kind !== 'inspect') toast('已保存');
}
function recoverSpeech() {
  state.scope = 'future'; goal = 'speech'; update();
  const cap = capById(selected), missing = getSteps(state, cap, goal).filter(step => !step.done);
  if (missing.length) { toast('目标已切换为音频转写，完成剩余步骤后开始试读'); }
  else recoverResult('speech');
}

document.addEventListener('click', event => {
  const control = event.target.closest('button'); if (!control) { const row = event.target.closest('[data-platform-row]'); if (row) { platformFocus = null; platformScroll = 0; openPlatform(row.dataset.platformRow); } return; }
  if (control.dataset.page) { page = control.dataset.page; location.hash = page === 'speech' ? 'speech' : ''; render(); return; }
  const { action, value } = control.dataset;
  if (action === 'speech-start') speechInstaller.start(installScenario);
  if (action === 'speech-retry') speechInstaller.retry();
  if (action === 'speech-cancel') speechInstaller.cancel();
  if (action === 'speech-done') { setupDialog.close(); setup = null; update(); }
  if (action === 'page') { page = value; render(); }
  if (action === 'open') openCapability(value);
  if (action === 'platform-trial') { const [id, target] = $('#platform-trial-target').value.split('~'); platformScroll = drawer.scrollTop; platformFocus = id; platformGoalFocus = target; openCapability(id, target); drawer.scrollTop = 0; }
  if (action === 'platform') { platformOptionalFocus = null; platformFocus = null; platformGoalFocus = 'default'; platformScroll = 0; openPlatform(value); }
  if (action === 'open-platform-cap' || action === 'open-speech') { platformScroll = drawer.scrollTop; platformFocus = value; platformGoalFocus = action === 'open-speech' ? 'speech' : 'default'; openCapability(value, platformGoalFocus); drawer.scrollTop = 0; }
  if (action === 'back-platform') { platformFocus = selected; platformGoalFocus = goal; openPlatform(value, true); }
  if (action === 'platform-setup') { platformOptionalFocus = null; platformFocus = control.dataset.cap; platformGoalFocus = control.dataset.goal || 'default'; openSetup(value); }
  if (action === 'optional-setup') { platformOptionalFocus = value; openSetup(value); }
  if (action === 'launch-goal') openCapability($('#goal-launch').value);
  if (action === 'scope' || action === 'scope-in-drawer') { state.scope = value; if (value === 'current' && goal === 'speech') goal = 'default'; update(); }
  if (action === 'setup') openSetup(value);
  if (action === 'close-drawer') drawer.close();
  if (action === 'close-setup') setupDialog.close();
  if (action === 'try') runTrial(value);
  if (action === 'try-selected') runTrial($('#trial-outcome').value, goal === 'speech' || selected === 'xhs.video');
  if (action === 'recover-login') openSetup(`login:${value}`, 'continue');
  if (action === 'recover-verification') openSetup(`verify:${value}`, 'continue');
  if (action === 'recover-network' || action === 'recover-translation') recoverResult(action === 'recover-translation' ? 'translation' : 'network');
  if (action === 'speech-fallback') recoverSpeech();
  if (action === 'inspect-result') openSetup(`inspect:${value}`);
  if (action === 'diagnose') toast('连接超时');
  if (action === 'focus-next') { const next = drawer.querySelector('.step:not(.done) [data-action="setup"]'); if (next) next.focus(); else toast('配置已完成，可以开始试读'); }
  if (action === 'resume-inbox') runTrial(state.results[selected]?.queuedOutcome || 'success');
  if (control.id === 'apply-preset' || control.id === 'reset') { const name = control.id === 'reset' ? 'basic' : $('#preset').value; speechInstaller.reset(); state = presetState(name); if (drawer.open) drawer.close(); update(); toast('已载入'); }
});
document.addEventListener('change', event => { if (event.target.id === 'speech-scenario') installScenario = event.target.value; if (event.target.id === 'detail-goal') { goal = event.target.value; renderDetail(); } });
document.addEventListener('submit', event => { if (event.target.id === 'setup-form') completeSetup(event); });
drawer.addEventListener('close', () => { const id = platformContext; selected = null; platformContext = null; platformOptionalFocus = null; if (id) queueMicrotask(() => document.querySelector('#platform-open-' + id)?.focus({ preventScroll: true })); });
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); page = 'matrix'; location.hash = ''; render(); });
window.addEventListener('hashchange', () => { const next = location.hash === '#speech' ? 'speech' : page === 'speech' ? 'matrix' : page; if (next !== page) { page = next; render(); } });
render();
