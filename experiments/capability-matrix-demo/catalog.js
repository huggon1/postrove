export const platforms = [
  { id: 'x', name: 'X', mark: '𝕏', color: '#202938', tint: '#edf0f4', ai: 'Grok', languages: ['中文', '英文'] },
  { id: 'xhs', name: '小红书', mark: '红', color: '#df4a62', tint: '#fff0f2', ai: '点点', languages: ['中文'] },
  { id: 'youtube', name: 'YouTube', mark: '▶', color: '#e65353', tint: '#fff1f1', ai: 'Gemini', languages: ['中文', '英文'] },
  { id: 'reddit', name: 'Reddit', mark: 'r', color: '#dc7645', tint: '#fff3ec', ai: 'Reddit AI', languages: ['英文'] },
  { id: 'github', name: 'GitHub', mark: '⌘', color: '#47566c', tint: '#edf1f7' },
  { id: 'bili', name: 'Bilibili', mark: '哔', color: '#58a4c5', tint: '#edf8fc' },
  { id: 'web', name: '其他网页', mark: '↗', color: '#7e8a9c', tint: '#f0f3f7' },
];
export const siteName = (id) => id === 'gemini' ? 'Gemini' : platforms.find(p => p.id === id)?.name || id;
export const sessionKey = (platform) => platform === 'youtube' ? 'gemini' : platform;
export const capabilities = [
  ...platforms.filter(p => p.ai).map(p => ({ id: `${p.id}.ai`, platform: p.id, type: 'ai', name: `${p.ai} 提问`, scope: `${p.ai} 独立回答，并收集与回答关联的${p.id === 'youtube' ? ' YouTube 视频' : p.id === 'reddit' ? '原始帖子与评论' : p.id === 'x' ? ' X 原帖' : '小红书笔记'}来源。`, guest: p.id === 'reddit' ? '支持游客提问；本示例提供英文专家。' : `提问使用${siteName(sessionKey(p.id))}账号会话。`, gain: '启用语言专家后，可以在话题中选择该成员。', boundary: '账号限制、平台验证和具体来源权限由实际页面决定。', formal: true })),
  { id: 'x.text', platform: 'x', type: 'text', name: 'X 帖子', scope: '帖子正文、按顺序排列的图片、引用帖子和作者提供的直接材料。', guest: '公开链接可先尝试。具体正文与串文范围在读取时确认。', gain: '使用账号会话读取该账号有权访问的页面；展开范围仍由实际页面决定。', boundary: '公开可见性、作者权限和现场验证分别判断。' },
  { id: 'xhs.text', platform: 'xhs', type: 'text', name: '小红书图文笔记', scope: '笔记标题、正文和按顺序排列的图片轮播。', guest: '公开分享链接可先尝试。保留分享链接的访问参数。', gain: '将账号会话用于页面和图文增强读取；每条笔记的可见范围仍在访问时确认。', boundary: '当前图文范围包含笔记内容与图片。视频内容与评论分别界定读取范围。' },
  { id: 'youtube.text', platform: 'youtube', type: 'text', name: 'YouTube 视频信息', scope: '标题、作者、简介和作者提供的直接材料链接。', guest: '公开视频信息可先用游客方式读取。', gain: 'YouTube 页面会话用于账号有权访问的来源。Gemini 提问与这项读取分别判断。', boundary: '视频信息和字幕、画面分别记录覆盖范围。' },
  { id: 'youtube.video', platform: 'youtube', type: 'video', name: 'YouTube 视频文字', scope: '可获取的原始字幕、时间点链接、视频信息及作者材料。', guest: '公开字幕支持游客尝试；原生工具与浏览器字幕入口可分别回退。', gain: '字幕读取组件提供原始字幕获取方式。网页账号会话用于浏览器访问，原生字幕工具当前采用游客请求。', boundary: '当前版本读取字幕与文字；画面内容保持未知。缺少字幕时保留已获取的视频信息。' },
  { id: 'reddit.text', platform: 'reddit', type: 'text', name: 'Reddit 帖子与评论', scope: '目标帖子，或选中评论及其父帖和必要的上级评论。', guest: '公开帖子与评论支持游客访问。', gain: '使用账号会话访问该账号有权查看的社区与页面。', boundary: '目标帖子或评论与整个讨论串分别界定范围。' },
  { id: 'github.text', platform: 'github', type: 'text', name: 'GitHub README', scope: '公开仓库的默认 README，保留代码、表格、图片和链接。', guest: '公开 README 支持游客读取。', gain: '当前范围以公开默认 README 为准。', boundary: '仓库代码、Issues 和其他仓库文件属于另外的读取范围。' },
  { id: 'bili.text', platform: 'bili', type: 'text', name: 'Bilibili 页面文字', scope: '通过通用网页规则尝试读取可访问的标题、简介和页面正文。', guest: '可访问的公开页面文字支持游客尝试。', gain: '账号会话用于浏览器访问；字幕和音频作为视频扩展方案单独呈现。', boundary: '页面文字采集与视频内容解析分别记录。' },
  { id: 'web.text', platform: 'web', type: 'text', name: '通用网页', scope: '可访问的正文、图片、嵌入页面和一层直接引用材料。', guest: '按网站实际可访问内容读取。', gain: '网站要求账号或验证时，使用对应页面的访问流程。', boundary: '付费、私有或其他权限条件由来源网站决定。' },
  { id: 'xhs.video', platform: 'xhs', type: 'video', name: '小红书视频', future: true, scope: '方案：读取笔记配文与可访问音频，通过语音识别生成带时间点的文字。', guest: '方案先尝试公开来源；访问遇到登录或验证时再处理。', gain: '配置音频转写组件和模型后，可以处理缺少独立字幕轨的口述内容。', boundary: '画面操作、烧录在画面上的文字和纯视觉信息需要独立的画面能力。' },
  { id: 'bili.video', platform: 'bili', type: 'video', name: 'Bilibili 视频', future: true, scope: '方案：读取已有字幕与时间点；缺少字幕时可选择音频转写。', guest: '公开播放与字幕获取分别判断。字幕来源的登录门槛在试读时确认。', gain: '来源实际要求登录时使用账号会话；音频转写处理可访问音频中的口述内容。', boundary: '分 P 身份、字幕权限和音频可访问范围分别校验。画面分析作为独立能力。' },
];

export function presetState(preset = 'basic') {
  const state = { version: 1, preset, scope: 'current', model: preset !== 'first', chrome: preset !== 'first', readers: { youtube: true, xhs: true, bili: false, speech: false }, speechModel: false, sessions: { x: 'guest', xhs: 'guest', gemini: 'guest', youtube: 'guest', reddit: 'guest', bili: 'guest' }, experts: { x: [], xhs: [], youtube: [], reddit: [] }, bots: { telegram: { connected: false, authorized: false }, feishu: { connected: false, authorized: false } }, results: {} };
  if (['some', 'full', 'expired', 'missing'].includes(preset)) {
    state.sessions.x = 'signed'; state.sessions.xhs = 'signed'; state.experts.x = ['英文']; state.experts.xhs = ['中文']; state.experts.reddit = ['英文'];
  }
  if (['full', 'expired', 'missing'].includes(preset)) {
    Object.keys(state.sessions).forEach(site => state.sessions[site] = 'signed');
    state.experts.youtube = ['中文', '英文']; state.readers.speech = true; state.readers.bili = true; state.speechModel = true;
    state.bots.telegram = { connected: true, authorized: true }; state.bots.feishu = { connected: true, authorized: true };
  }
  if (preset === 'expired') { state.sessions.x = 'expired'; state.sessions.xhs = 'expired'; state.sessions.gemini = 'expired'; }
  if (preset === 'missing') { state.readers = { youtube: false, xhs: false, bili: false, speech: false }; }
  return state;
}

export function getSteps(state, capability, goal = 'default') {
  if (capability.future && state.scope === 'current') return [];
  const steps = [
    { id: 'model', name: '配置后台模型', description: '问题准备、采集调度、翻译与摘要共用。', done: state.model },
    { id: 'chrome', name: '准备浏览器', description: '用于打开页面、读取内容与平台会话。', done: state.chrome },
  ];
  if (capability.type === 'ai') {
    const key = sessionKey(capability.platform);
    if (capability.platform !== 'reddit') steps.push({ id: `login:${key}`, name: `${state.sessions[key] === 'expired' ? '重新登录' : '登录'} ${siteName(key)}`, description: '提问使用该平台的账号会话。', done: state.sessions[key] === 'signed' });
    steps.push({ id: `expert:${capability.platform}`, name: '启用语言专家', description: '选择本次可使用的提问语言。', done: state.experts[capability.platform].length > 0 });
  }
  if (goal === 'signed' && ['x', 'xhs'].includes(capability.platform)) steps.push({ id: `login:${capability.platform}`, name: `登录 ${siteName(capability.platform)}`, description: '使用账号会话尝试读取。', done: state.sessions[capability.platform] === 'signed' });
  if (capability.id === 'bili.video' && goal !== 'speech') steps.push({ id: 'reader:bili', name: '准备 Bilibili 字幕读取组件', description: '提供原生字幕获取、格式转换与分 P 定位。', done: state.readers.bili });
  if ((capability.id === 'xhs.video' || goal === 'speech') && state.scope === 'future') {
    steps.push({ id: 'reader:speech', name: '准备音频转写组件', description: '获取可访问音频并执行语音识别。', done: state.readers.speech });
    steps.push({ id: 'speech-model', name: '选择音频转写模型', description: '将口述内容转成带时间点的文字。', done: state.speechModel });
  }
  return steps;
}

export function availability(state, capability, goal = 'default') {
  if (capability.future && state.scope === 'current') return { kind: 'outside', label: '当前范围外', sub: '查看视频扩展方案' };
  const missing = getSteps(state, capability, goal).filter(step => !step.done);
  if (missing.length) return { kind: 'needs', label: missing[0].name, sub: `还需 ${missing.length} 步` };
  if (capability.type === 'ai') return { kind: 'ready', label: '可开始提问', sub: state.experts[capability.platform].join('、') + '专家' };
  const conditional = ['x', 'xhs', 'web', 'bili'].includes(capability.platform);
  return { kind: conditional ? 'guest' : 'ready', label: conditional ? '可尝试读取' : '可开始读取', sub: capability.id === 'youtube.video' && !state.readers.youtube && goal !== 'speech' ? '浏览器字幕回退' : capability.id === 'xhs.text' && !state.readers.xhs ? '浏览器图文回退' : capability.type === 'video' ? state.scope === 'future' && (goal === 'speech' || capability.id === 'xhs.video') ? '音频文字 · 方案' : '字幕访问时确认' : capability.platform === 'bili' ? '通用网页范围' : ['x', 'xhs'].includes(capability.platform) ? state.sessions[capability.platform] === 'signed' ? '使用账号会话' : '公开链接 · 游客' : '公开来源' };
}

export function availablePaths(state, platformId) {
  return capabilities.filter(capability => capability.platform === platformId).flatMap(capability => {
    const goals = ['default'];
    if (state.scope === 'future' && ['youtube.video', 'bili.video'].includes(capability.id)) goals.push('speech');
    return goals.map(goal => ({ capability, goal, status: availability(state, capability, goal) }));
  }).filter(path => ['ready', 'guest'].includes(path.status.kind));
}

const groupLabels = {
  'x.ai': 'Grok',
  'xhs.ai': '点点',
  'youtube.ai': 'Gemini',
  'reddit.ai': 'Reddit AI',
  'x.text': '帖子、图片',
  'xhs.text': '图文笔记',
  'youtube.text': '视频信息',
  'youtube.video': '字幕',
  'reddit.text': '帖子、评论',
  'github.text': 'README',
  'bili.text': '页面文字',
  'web.text': '网页正文',
  'bili.video': '原生字幕',
  'xhs.video': '音频转写',
};

export function capabilityGroups(state, platformId) {
  const groups = new Map();
  for (const capability of capabilities) {
    if (capability.platform !== platformId || capability.future && state.scope !== 'future') continue;
    const goals = ['default'];
    if (state.scope === 'future' && ['youtube.video', 'bili.video'].includes(capability.id)) goals.push('speech');
    for (const goal of goals) {
      const steps = getSteps(state, capability, goal);
      const requirements = [...new Set(steps.map(step => step.id))].sort();
      const key = JSON.stringify(requirements);
      if (!groups.has(key)) groups.set(key, {
        id: `${platformId}:${requirements.map(encodeURIComponent).join('|')}`,
        name: '',
        paths: [],
        steps,
        ready: steps.every(step => step.done),
      });
      groups.get(key).paths.push({ capability, goal });
    }
  }
  return [...groups.values()].map(group => ({
    ...group,
    name: [...new Set(group.paths.map(({ capability, goal }) => goal === 'speech' ? '音频转写' : groupLabels[capability.id] || capability.name))].join('、'),
  }));
}
