import { escapeHTML as e } from "./content.js";

// Setup and data handling follow the root READMEs' Installation and use section.
// The platform list follows their AI members table.
export const detailsCopy = {
  en: {
    title: "Getting started",
    questions: [
      {
        question: "What do I need to get started?",
        answer:
          "Install Google Chrome and Postrove. In Settings → Background models, add a connection, complete authentication, and select a model. Open Members to sign in where required and enable the platform’s language experts.",
      },
      {
        question: "Which platform AI can I ask?",
        answer:
          "Ask Grok for X, Diandian for Xiaohongshu, Gemini for YouTube, or Reddit AI search (Ask). Grok and Gemini offer Chinese and English experts; Diandian offers Chinese, and Reddit offers English.",
      },
      {
        question: "Where is my data stored?",
        answer:
          "Reports and website sessions are stored on your computer. Tasks send related questions and materials to your configured model.",
      },
    ],
  },
  "zh-CN": {
    title: "开始使用",
    questions: [
      {
        question: "需要配置什么？",
        answer:
          "安装 Google Chrome 和 Postrove。在“设置 → 后台模型”中新建连接、完成认证并选择模型。打开成员管理，按平台要求登录并启用语言专家。",
      },
      {
        question: "可以向哪些平台 AI 提问？",
        answer:
          "可以向 X 的 Grok、小红书的点点、YouTube 的 Gemini 和 Reddit AI 搜索（Ask）提问。Grok 和 Gemini 提供中文与英文专家，点点提供中文专家，Reddit 提供英文专家。",
      },
      {
        question: "数据保存在哪里？",
        answer:
          "报告和网站会话保存在本机。任务执行时，相关问题和材料会发送给配置的模型。",
      },
    ],
  },
};

export function renderDetails(language) {
  const c = detailsCopy[language];
  if (!c) throw new Error(`Unsupported homepage language: ${language}`);
  return `<section class="setup-details section-width" id="getting-started" aria-labelledby="setup-title"><h2 id="setup-title">${e(c.title)}</h2><div class="setup-questions">${c.questions
    .map(
      ({ question, answer }) =>
        `<details open><summary>${e(question)}</summary><p>${e(answer)}</p></details>`,
    )
    .join("")}</div></section>`;
}
