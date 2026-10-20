<p align="center"><img src="assets/postrove-icon.svg" width="112" alt="Postrove app icon"></p>

# Postrove

[简体中文](README.zh-CN.md)

Postrove is a desktop app that helps you find posts with each platform's own AI and collect interesting content to read later.

## Features

### Ask your AI members

Start a topic and choose its members. Each member answers independently with its platform's posts and sources. Open the topic to read its replies, inspect member receipts, and collect individual, selected, or all sources into Reading.

| Content platform | Platform AI | Sign in to | Query languages | Status |
| --- | --- | --- | --- | --- |
| X | Grok | X | Chinese, English | Integrated |
| Xiaohongshu | 点点 | Xiaohongshu | Chinese | Integrated |
| YouTube | Gemini | Gemini Apps with a Google account | Chinese, English | Planned |
| Reddit | Reddit AI search (Ask) | Reddit | English | Planned |

One platform sign-in can enable several language experts. Grok in Chinese and English share the same X connection; 点点 uses Chinese on Xiaohongshu. Postrove translates each question into the expert language and prepares replies in your reading language while retaining the originals.

The expansion design gives each content-platform/AI pair an independent advisor route with its own language switches and replies. Future Gemini routes for other content platforms can share the Gemini sign-in.

Scheduled messages send a saved question daily or weekly while Postrove is open. Each occurrence creates its own topic.

Planned entries follow the [platform expansion design](docs/platform-expansion-design.md); implementation and live account acceptance determine their availability.

### Collect content to read later

Collect posts and articles from different platforms in one place. Read their text, images, and summaries in your chosen language.

For example, when you find a long technical article you want to read later, forward its link to your configured Telegram or Feishu app bot. Postrove retrieves the content and prepares a summary, so you can skim the summary first and read the article later in the app. You can also add links directly.

Reading rules define the content to capture. The Agent loads the relevant Skill for the observed page. Other pages use the general web rule, with the Agent identifying the main content and how to read it.

| Page | Sign-in required | Reading scope | Skill / retrieval tool | Status |
| --- | --- | --- | --- | --- |
| X post | Yes, X | Post text, ordered images, quoted posts, and author-supplied material links | [x-reading](src/platforms/browser/skills/x-reading/SKILL.md) | Integrated |
| Xiaohongshu note | Yes, Xiaohongshu | Note title, text, and ordered image carousel | [xiaohongshu-reading](src/platforms/browser/skills/xiaohongshu-reading/SKILL.md); optional `read_xiaohongshu` tool | Integrated |
| Public GitHub repository | No | Default README, including code, tables, images, and links | [github-reading](src/platforms/browser/skills/github-reading/SKILL.md) | Integrated |
| Public YouTube video | No | Metadata, publicly accessible captions, and timestamp links | `read_youtube_transcript` first, then browser transcript fallback through `youtube-reading` | Planned |
| Public Reddit post or comment | No | Post body, or the selected comment with its parent post and necessary ancestor context | `reddit-reading` | Planned |
| Other web pages | Depends on the site | Accessible body, images, frames, and directly referenced materials | [web-reading](src/platforms/browser/skills/web-reading/SKILL.md) | Integrated |

Skills define the reading scope; retrieval tools provide a source-specific way to fetch it. The macOS package includes `xiaohongshu-mcp` for the optional note reader. Planned YouTube and Reddit readers follow the [platform expansion design](docs/platform-expansion-design.md).

Sign in to X or Xiaohongshu in Members; questions and content reading share that account. Partial retrieval keeps the available content and shows its coverage.

## Architecture

![Postrove architecture](docs/architecture/overview.svg)

[Interactive architecture](docs/architecture/index.html) · [Agent prompts and tools](docs/agent-prompt-flow.md) · [Saved Markdown results](docs/data-contracts.md#result-packages)

This source revision contains the topic workspace refactor. Published packages have their own release notes.

## Installation and use

Installation packages are available for macOS Apple silicon.

1. Install Google Chrome.
2. Download the DMG from [GitHub Releases](https://github.com/huggon1/postrove/releases), move Postrove into Applications, and open it. Packages use a project signature; macOS may require System Settings → Privacy & Security → Open Anyway on first launch.
3. In Settings → Background models, create a connection, complete authentication, and select a model. Open Members to sign in to a platform and enable its language experts. Existing Codex connections offer a one-time migration to native Pi login.
4. Start a topic or add a link in Reading. For bot forwarding, configure Telegram or Feishu and authorize your chat in Settings. Feishu supports official scan-to-create registration or an existing app with direct-message, sending, and history permissions.

Reports and website sessions are stored locally. Tasks send related questions and materials to your configured model. Later versions can be downloaded and installed through Settings → About.

## Account risk

> ⚠️ Postrove uses your signed-in platform accounts for automated search and content retrieval. These actions may trigger platform safeguards, leading to extra verification, rate limits, account restrictions, or bans. We recommend dedicated secondary accounts for X, Xiaohongshu, and other platforms to reduce the impact of account restrictions.

[Development guide](docs/development.md) · [0.1.0 release notes](docs/releases/0.1.0.md) · [Release guide](docs/releasing.md) · [MIT License](LICENSE)
