# Postrove architecture

Postrove is a local Electron application. Main owns configuration, scheduling, persistent state, browser access, and result publication. Pi Agents operate platform pages and process captured text. The renderer reads snapshots and sends validated preload commands.

[Interactive architecture](architecture/index.html) and its [Chinese edition](architecture/zh-CN/index.html) include each Agent's task, tools, Skill catalog, prompts, and outputs. [Product behavior](product-spec.md), [data contracts](data-contracts.md), and [prompt flow](agent-prompt-flow.md) own their respective details.

![System architecture](architecture/overview.svg)

[Diagram sources and publishing](architecture/README.md) describes regeneration, version control, and static hosting.

The diagram includes Gemini/YouTube, Reddit AI, source profiles, and platform reading tools. [Platform expansion design](platform-expansion-design.md) records the route design and live acceptance boundaries.

## Runtime boundaries and data ownership

| Layer           | Responsibility                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| React workspace | Topics, independent replies, reading, schedules, member setup, settings                               |
| Electron Main   | Admission, frozen identities/languages, queues, model leases, cancellation, stores, receipts, results |
| Browser worker  | One Pi coding session per bridge or capture job; explicit tools and Skill loading                     |
| Content worker  | Bounded tool-free text Agents for shared content operations                                           |
| Reading worker  | Saved material chunks, translation, fidelity correction, introduction, progress                       |
| Shared Chrome   | Platform login sessions and serialized HTTPS browser access                                           |

`FocusSearchStore` saves topics and schedules in `focus-search.json`. `AdvisorStore` saves enabled language experts in `advisors.json`. Website connections share login across route-and-language experts. The advisor registry binds each route to a source platform and search Skill. Reddit also admits guest use. `ForwardingStore` saves reading tasks and materials in `forwarding.json`; `TaskStore` saves execution events in `tasks.json`. Main validates every update before notifying React. [Data contracts](data-contracts.md) own exact fields and ordering.

## Topic execution

A manual or scheduled send resolves enabled experts and freezes role, connection, question language, reading language, run identity, and prompt/Skill revisions. Main acquires an execution lease, calls the shared translation capability, and appends the route source profile’s enhancement sentence. It saves the actual question before browser execution.

Each expert receives a separate bridge task. The bridge sees a generic system, prepared question, output contract, browser tools, and the selected route’s Skill summary. It selects and loads that Skill. The Skill supplies the platform's fixed entry address and page guide. The bridge submits the prepared question once and captures the stable answer.

Main commits the answer and acknowledges it. The same Pi session continues into citation extraction. Captures and observed URLs establish provenance; Main validates the source profile’s original post, comment, or video identity before accepting sources. Main then formats and translates the answer through shared text capabilities. Original and reading versions remain separate. Each expert has its own cancellation signal and receipt state. The global browser lock serializes access.

## Collection and content capabilities

Manual links, collected topic sources, and authorized bot messages use one reading pipeline. `PlatformAccess.collect` starts a capture Agent for every source. The Agent receives an address, capture scope, output contract, browser tools, and reading Skill summaries. It loads the relevant Skill and chooses page operations and available platform reading tools for that scope. Main validates and saves the captured source, then dispatches direct references one level deep. The reading worker consumes saved material.

Platform reading tools provide specific retrieval operations within the capture session. `read_xiaohongshu` retrieves observed notes through its installed adapter. `read_youtube_transcript` uses pinned yt-dlp and Deno to preserve original captions, metadata, and timestamps for an observed video. The YouTube Skill guides additional page capture and browser transcript fallback. Repeated caption reads reuse the saved attempt. Tool and browser captures share task-scoped evidence validation and result publication.

`translate_content`, `format_content`, `structure_content`, and `introduce_content` share one implementation. Main calls service operations directly for preparation and presentation. Browser Agents can call `structure_content` with a current-task capture ID; Main resolves the evidence and invokes the same isolated implementation. Text Agents receive explicit content and output instructions with empty tool and Skill lists. Text-service concurrency is bounded at two; each task carries cancellation and output budgets.

The reading worker uses the same translation and introduction implementations with its chunk/progress channel. Markdown fidelity checks preserve links, executable code, and identifiers. One correction attempt repairs fidelity failures. Original captures survive processing failures.

## Browser, model, and integration boundaries

`PlatformBrowser` owns Chrome, sessions, constrained operations, and the serial access lock. `BrowserAgent` maps worker calls to validated operations and current-task captures. `PlatformAccess` validates source identity and caches images. Both browser Agent types use explicit `load_platform_skill`; automatic project instruction and extension discovery stays disabled in the Pi session factory.

[The Pi bridge](../src/pi/README.md) adapts native ModelRuntime, authentication, stream handling, reasoning, and request options. Main owns active connection selection and leases. A lease freezes model/options and retains its credential directory through worker cleanup. Browser and tool-free sessions export native transcripts under `browser-traces`. Task log export includes expert run IDs and reading attempts.

Worker environments inherit explicit proxy policy. On macOS and Windows, GUI startup resolves explicit proxy variables before manual system proxy settings. Loopback traffic retains direct routing. Default workers receive the minimal permitted environment; environment-auth connections explicitly opt into native ambient credential resolution.

`integrations/bots/` owns durable intake, authorization, account lifecycle, history reconciliation, deduplication, and receipts. Telegram and Feishu adapters own their protocols and transport credentials. Both submit the same forwarding identity contract. Bot acceptance and reading completion have independent receipts.

## Recovery, files, and profiles

Main persists the submitted checkpoint and observed conversation URL before continuing. Recovery of submitted work inspects the existing conversation; it retains captured answers when later stages fail. Queued work keeps its admitted input. Terminal runs publish an atomic, immutable result directory; latest follows the newest admitted terminal run. [Result packages](data-contracts.md#result-packages) define files and retry identities.

Profiles isolate business records, connections, platform sessions, cached media, results, and traces. The topic upgrade preserves those stores and maps legacy platform sections to language experts. Profile copying validates regular local files and includes credentials only through its explicit option. The current startup keeps historical business-generation markers as inert migration evidence.
