const copy = {
  en: {
    title: "Postrove — Ask across platforms. Save and read.",
    description:
      "Ask a question across platforms, compare independent replies, and save useful sources in one reading library. Postrove for macOS and Windows.",
    skip: "Skip to content",
    navigation: "Main navigation",
    product: "Explore Postrove",
    previews: "App previews",
    features: "Features",
    download: "Download",
    eyebrow: "ASK, SAVE AND READ",
    heroLineOne: "Ask across platforms.",
    heroLineTwo: "Save and read.",
    heroDescription:
      "Your AI members find the posts. Postrove helps you turn them into something worth reading.",
    getPostrove: "Download Postrove",
    seeIt: "Explore the app",
    tabTopics: "Ask",
    tabTopic: "Replies & sources",
    tabReading: "Read",
    screenshotCaption:
      "Screenshots show the current source interface with fictional questions, replies, sources, and reading material. Published packages follow their release notes.",
    platformsTitle: "YOUR AI MEMBERS",
    platformsDescription: "One question. Independent replies.",
    diandian: "Diandian",
    xiaohongshu: "Xiaohongshu",
    experimental: "Experimental",
    featureEyebrow: "FROM DISCOVERY TO READING",
    featureTitle: "Find it. Save it. Read it.",
    askTitle: "Ask your AI members",
    askDescription:
      "Start a topic and choose its members. Each member answers independently with its platform's posts and sources.",
    saveTitle: "Collect content to read later",
    saveDescription:
      "Save useful sources in one reading library. Add links directly, or forward them through your configured Telegram or Feishu bot.",
    readTitle: "Read in your language",
    readDescription:
      "Read text, images, and summaries in your chosen language. Switch to the original whenever you want to compare.",
    downloadEyebrow: "POSTROVE FOR DESKTOP",
    downloadTitle: "Keep something worth reading.",
    gettingStarted: "Getting started",
    macDownload: "Download for macOS",
    windowsDownload: "Download for Windows",
    footerTagline: "Ask · Save · Read",
    previewAlts: {
      topics: "Ask how to make a first pixel game with AI",
      topic: "Read independent replies and collect a pixel-game tutorial",
      reading:
        "Read a saved pixel-game tutorial with its summary, illustration, and original-text switch",
    },
  },
  "zh-CN": {
    title: "Postrove — 跨平台提问和阅读",
    description:
      "向不同平台的 AI 成员提出同一个问题，看看各自的回答，再把有用的来源收进阅读库。Postrove 支持 macOS 和 Windows。",
    skip: "跳至正文",
    navigation: "主导航",
    product: "查看 Postrove 界面",
    previews: "应用界面",
    features: "功能",
    download: "下载",
    eyebrow: "提问、收藏和阅读",
    heroLineOne: "让平台 AI 帮你找内容，",
    heroLineTwo: "把值得读的内容留下来。",
    heroDescription:
      "向不同平台的 AI 成员提出同一个问题，看看各自的回答，再把有用的来源收进阅读库。",
    getPostrove: "下载 Postrove",
    seeIt: "看看应用界面",
    tabTopics: "提问",
    tabTopic: "回复与来源",
    tabReading: "阅读",
    screenshotCaption:
      "截图使用虚构的问题、回答、来源和阅读材料，展示当前源码界面。安装包功能以对应版本说明为准。",
    platformsTitle: "你的 AI 成员",
    platformsDescription: "同一个问题，各自独立回答。",
    diandian: "点点",
    xiaohongshu: "小红书",
    experimental: "试用",
    featureEyebrow: "从发现到阅读",
    featureTitle: "提问、收藏和阅读。",
    askTitle: "向 AI 成员提问",
    askDescription:
      "发起一个话题，选择本次回答的成员。各成员独立回答，并附上平台帖子和来源。",
    saveTitle: "收集内容，稍后阅读",
    saveDescription:
      "把有用的来源收进阅读库。直接添加链接，或转发给配置好的 Telegram 或飞书应用机器人。",
    readTitle: "用自己的语言阅读",
    readDescription:
      "以你选择的语言查看正文、图片和摘要。保留原文和链接，随时切回原文对照。",
    downloadEyebrow: "POSTROVE 桌面应用",
    downloadTitle: "把值得读的内容留下来。",
    gettingStarted: "开始使用",
    macDownload: "下载 macOS 版",
    windowsDownload: "下载 Windows 版",
    footerTagline: "提问 · 收藏 · 阅读",
    previewAlts: {
      topics: "发起话题：我想用 AI 做一个像素小游戏，应该从哪里开始？",
      topic: "话题详情：阅读成员回答，将像素小游戏教程收进阅读库",
      reading: "阅读页：查看像素小游戏教程的译文、摘要和配图，随时切回原文",
    },
  },
};

const tabs = [...document.querySelectorAll("[data-scene]")];
const preview = document.querySelector("#app-preview");
const panel = document.querySelector("#preview-panel");
const languageButton = document.querySelector("#language-toggle");
let language = "en";
let scene = "topics";

function showScene(nextScene) {
  scene = nextScene;
  for (const tab of tabs) {
    const selected = tab.dataset.scene === scene;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) panel.setAttribute("aria-labelledby", tab.id);
  }
  preview.src = `./assets/screenshots/${scene}-${language}.png`;
  preview.alt = copy[language].previewAlts[scene];
}

function setLanguage(nextLanguage) {
  language = nextLanguage;
  const messages = copy[language];
  document.documentElement.lang = language;
  document.title = messages.title;
  document.querySelector('meta[name="description"]').content =
    messages.description;
  document.querySelector('meta[property="og:title"]').content = messages.title;
  document.querySelector('meta[property="og:description"]').content =
    messages.heroDescription;
  for (const element of document.querySelectorAll("[data-copy]")) {
    element.textContent = messages[element.dataset.copy];
  }
  for (const element of document.querySelectorAll("[data-label]")) {
    element.setAttribute("aria-label", messages[element.dataset.label]);
  }
  for (const brand of document.querySelectorAll(".brand")) {
    brand.setAttribute(
      "aria-label",
      language === "en" ? "Postrove home" : "Postrove 首页",
    );
  }
  languageButton.querySelector("span").textContent =
    language === "en" ? "中文" : "English";
  languageButton.lang = language === "en" ? "zh-CN" : "en";
  languageButton.setAttribute(
    "aria-label",
    language === "en" ? "切换到中文" : "Switch to English",
  );
  document.querySelector(".release-link").href =
    language === "en"
      ? "https://github.com/huggon1/postrove#installation-and-use"
      : "https://github.com/huggon1/postrove/blob/main/README.zh-CN.md#安装与使用";
  showScene(scene);
  try {
    localStorage.setItem("postrove-homepage-language", language);
  } catch {
    /* Language still works when browser storage is unavailable. */
  }
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => showScene(tab.dataset.scene));
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    tabs[nextIndex].focus();
    showScene(tabs[nextIndex].dataset.scene);
  });
}

languageButton.addEventListener("click", () =>
  setLanguage(language === "en" ? "zh-CN" : "en"),
);
const requestedLanguage = new URLSearchParams(location.search).get("lang");
let savedLanguage;
try {
  savedLanguage = localStorage.getItem("postrove-homepage-language");
} catch {
  /* Use the English default. */
}
setLanguage(
  Object.hasOwn(copy, requestedLanguage)
    ? requestedLanguage
    : Object.hasOwn(copy, savedLanguage)
      ? savedLanguage
      : "en",
);
