<p align="center"><img src="assets/postrove-icon.svg" width="112" alt="Postrove 应用图标"></p>

# Postrove

[English](README.md)

Postrove 是一款桌面应用，通过各平台自身的 AI 查找相关帖子，并统一收集感兴趣的内容，方便稍后阅读。

## 功能

### 向 AI 成员提问

发起一个话题，选择本次回答的成员。各成员独立回答，并附上平台帖子和来源。打开话题后，可以阅读回复、查看成员回执，按单条、选中或全部收集来源。

| 内容平台 | 平台 AI | 登录站点 | 提问语言 | 状态 |
| --- | --- | --- | --- | --- |
| X | Grok | X | 中文、英文 | 已接入 |
| 小红书 | 点点 | 小红书 | 中文 | 已接入 |
| YouTube | Gemini | Gemini Apps，使用 Google 账号 | 中文、英文 | 待接入 |
| Reddit | Reddit AI 搜索（Ask） | Reddit | 英文 | 待接入 |

同一次平台登录可以启用多位语言专家。Grok 中文和英文共用 X 连接，点点在小红书使用中文。应用按专家语言准备提问，按阅读语言生成阅读版本，并保留原文。

扩展设计中，每组“内容平台 × 平台 AI”拥有独立的顾问路线，分别启用语言专家并生成独立回复。未来用 Gemini 获取其他平台内容时，各条路线可以共用 Gemini 登录。

定时发送可以每天或每周发送已保存的问题。应用运行时，每次发送创建一个新话题。

待接入项遵循[平台扩展设计](docs/platform-expansion-design.md)，完成实现和真实账号验收后开放。

### 收集内容，稍后阅读

将各平台看到的感兴趣帖子和文章统一收集到 Postrove，以你选择的语言查看正文、图片和摘要。

比如看到一篇很长的技术文章，想留到以后读，可以把链接转发给配置好的 Telegram 或飞书应用机器人。Postrove 会读取内容并生成摘要，之后你就可以在应用中先看摘要，再阅读正文。链接也可以直接在应用中添加。

读取规则明确要采集的内容。Agent 按实际页面加载对应 Skill。其他页面使用通用网页规则，由 Agent 识别正文并选择读取方式。

| 页面 | 需要登录 | 读取范围 | Skill / 读取工具 | 状态 |
| --- | --- | --- | --- | --- |
| X 帖子 | 是，登录 X | 正文、按顺序排列的图片、引用帖子及作者提供的材料链接 | [x-reading](src/platforms/browser/skills/x-reading/SKILL.md) | 已接入 |
| 小红书笔记 | 是，登录小红书 | 笔记标题、正文和按顺序排列的图片轮播 | [xiaohongshu-reading](src/platforms/browser/skills/xiaohongshu-reading/SKILL.md)；可用时调用 `read_xiaohongshu` | 已接入 |
| GitHub 公开仓库 | 否 | 默认 README，包含代码、表格、图片和链接 | [github-reading](src/platforms/browser/skills/github-reading/SKILL.md) | 已接入 |
| YouTube 公开视频 | 否 | 视频信息、公开字幕及时间点链接 | 优先调用 `read_youtube_transcript`，失败后通过 `youtube-reading` 尝试网页字幕 | 待接入 |
| Reddit 公开帖子或评论 | 否 | 帖子正文，或选中评论及其父帖和必要的上级评论 | `reddit-reading` | 待接入 |
| 其他网页 | 按网站要求 | 可访问的正文、图片、嵌入页面及直接引用材料 | [web-reading](src/platforms/browser/skills/web-reading/SKILL.md) | 已接入 |

Skill 约定读取范围，工具提供对应来源的获取方式。macOS 安装包自带 `xiaohongshu-mcp`，供笔记读取工具使用。YouTube 和 Reddit 的读取流程见[平台扩展设计](docs/platform-expansion-design.md)。

在成员管理中登录 X 或小红书后，提问和内容读取共用该账号。部分读取成功时，应用保留已获取的内容，并显示读取范围。

## 架构

![Postrove 架构](docs/architecture/overview.svg)

[交互架构图](docs/architecture/index.html) · [Agent 提示词与工具](docs/agent-prompt-flow.md) · [Markdown 结果文件](docs/data-contracts.md#result-packages)

当前源码包含话题工作区重构。已发布安装包的功能以对应版本说明为准。

## 安装与使用

目前提供 macOS Apple silicon 安装包。

1. 安装 Google Chrome。
2. 从 [GitHub Releases](https://github.com/huggon1/postrove/releases) 下载 DMG，将 Postrove 拖入 Applications 并打开。安装包使用项目签名，首次打开时，macOS 可能要求在“系统设置 → 隐私与安全”中选择“仍要打开”。
3. 在“设置 → 后台模型”中新建连接，完成认证并选择模型。打开成员管理，登录平台并启用语言专家。现有 Codex 连接可通过一次重新授权迁移到 Pi 原生登录。
4. 发起话题，或在阅读页添加链接。使用机器人转发时，先在设置中配置 Telegram 或飞书并授权聊天。飞书支持官方扫码创建应用，或连接具备单聊接收、发送和历史消息权限的已有应用。

报告和网站会话保存在本机。任务执行时，相关问题和材料会发送给配置的模型。后续版本可以通过“设置 → 关于”下载安装。

## 账号风险

> ⚠️ Postrove 使用已登录的平台账号执行自动搜索和内容读取。这类操作可能触发平台风控，导致额外验证、限流、账号限制或封禁。建议为 X、小红书等平台使用专用小号，以降低账号受限时的影响。

[开发指南](docs/development.md) · [0.1.0 发布说明](docs/releases/0.1.0.md) · [发布指南](docs/releasing.md) · [MIT 许可证](LICENSE)
