# Agent prompt flow

## Startup packets

| Agent | Task/input | Tools | Skill visibility | Output |
| --- | --- | --- | --- | --- |
| Platform bridge | Prepared question, platform identity, capture rules; submitted checkpoint on recovery | `browser`, `load_platform_skill`, `capture_search_sources`, `structure_content` | Selected platform search Skill name and description; full body after load | Captured answer, exact question, verified citations and source state |
| Material capture | HTTPS address, main/reference scope, capture schema | `browser`, `load_platform_skill`, `structure_content`; optional `read_xiaohongshu`, runtime-ready `read_youtube_transcript` | Reading Skill names and descriptions; selected full bodies after load | Capture-backed material, source identity, ordered Markdown/images, coverage |
| Question translation | Original question as JSON, expert language, request-preservation rules | Empty | Empty | Validated source language and translated question |
| Translation | Current text chunk, target language, preservation rules | Empty | Empty | Translated Markdown |
| Formatting | Captured text, paragraph/list/heading rules, preservation rules | Empty | Empty | Markdown reading version |
| Structure | Current-task capture text and fixed JSON schema | Empty | Empty | Title, full Markdown, observed citation links |
| Introduction | One material's title, coverage, readable text, target language | Empty | Empty | Short material introduction |
| Connection check | Fixed connection-check system and OK request | Empty | Empty | Bounded check response |

[Browser prompts](../src/platforms/browser/prompts.ts) owns the generic system, reply/source tasks, and material scope. [Content capabilities](../src/worker/content/capabilities.ts) owns formatting and structure prompts and shares [reading prompts](../src/worker/jobs/forwarding/reading-prompts.ts) for translation and introduction.

## Question and answer flow

Main translates the original question into the expert language, then appends the route source profile’s localized sentence. [Source profiles](../src/shared/source-profiles.ts) owns the exact sentences for X posts, Xiaohongshu notes, YouTube videos, and Reddit posts/comments. The run snapshot retains its source-profile revision and complete prepared question.

`translate_question` uses the [question translator](../src/worker/content/question.ts) with a structured source-language and question result. Matching source and expert languages reuse the original question. Cross-language results preserve links, code, and identifiers. Invalid JSON or preservation failures receive one correction attempt; a repeated failure ends question preparation with the original question retained.

The bridge task contains that exact text and the output schema. The platform Skill supplies its fixed AI entry address and interaction guide. Main saves a captured stable answer before acknowledging the same session's citation phase. Browser captures provide the original answer bytes. Formatting and translation produce a separately saved reading version.

Reply admission checks the selected DOM container before saving. Page roots, composers, and containers with user messages return a scope error so the bridge can select the complete assistant body. Source panels and cards use the saved reply's separate citation scope.

YouTube material captures admit the video's author metadata, description, and transcript containers. A selected container with playback or advertising returns a source-scope error and directs the Agent to a narrower current container. Caption evidence supplies its original metadata, description, and timed text through the caption tool.

## Explicit Skill and tool loading

[Bundled Skills](../src/platforms/browser/skills.ts) derive their names and descriptions from their own `SKILL.md` frontmatter. Search sees the route’s declared search Skill summary. Collection sees reading catalogs for redirects and references. `load_platform_skill` validates the requested name against the current catalog and returns its body as a tool result.

Every collection starts the same material capture Agent. The loaded reading Skill guides its tool choices and page operations. A successful tool capture supplies evidence for the task; the Agent continues until the requested collection scope is covered and returns the combined capture IDs.

[Browser tools](../src/platforms/browser/tools.ts) defines operations. `read_youtube_transcript` resolves an observed video through the fixed reader with zero model calls and returns original timestamped text or a saved failure state for browser fallback. `structure_content` resolves a successful capture from the current task before invoking a tool-free content Agent. Main validates structured links against supplied source evidence. Translation, formatting, and introduction enter through Main services or the saved-material reading worker.

The Pi coding-session factory uses the application system and Pi working-directory section, with explicit tools and empty append-system input. Automatic context, Skill, extension, and template discovery remain disabled. Tool-free Agents use the explicit system directly. [Pi integration](../src/pi/README.md) owns native authentication and model options.

## Recovery and evidence

Browser recovery retains the same session and task budget. Transient model failures permit up to three attempts; invalid output has bounded corrections. Reading text calls use the same bounded transient retry policy. Fidelity validation permits one correction call and retains the original when the correction fails.

The content worker limits tool-free calls to one Agent turn and carries a task cancellation signal. Main bounds concurrent content workers at two and drains cancellation through credential persistence. Search stages share one frozen model lease.

Native Pi JSONL/HTML records systems, actual user tasks, loaded Skill bodies, tool definitions, observations, and responses. Browser sessions add model/settings metadata. [Execution identity](data-contracts.md#development-profiles-and-execution-identity) defines revision and trace association.
