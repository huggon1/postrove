# Platform AI and video collection expansion

Status: implementation and acceptance design, 2026-10-20. The runtime includes the four advisor routes, route source profiles, and transcript-backed YouTube collection. Controlled tests cover application contracts; live platform acceptance records actual account and source delivery separately. The [interactive architecture](architecture/index.html) shows the combined system.

## Connections, experts, and sources

An AI connection identifies the website session. An advisor route pairs one content platform with one AI product and binds its source profile and search Skill. Each route has its own enabled query languages; each enabled language projects one independently selectable expert. Languages within the same route share its operation Skill. Several routes can reference the same AI connection.

| Advisor route          | AI connection / browser entry | Source profile            | Search Skill            | Initial query languages              |
| ---------------------- | ----------------------------- | ------------------------- | ----------------------- | ------------------------------------ |
| `x-grok`               | X / Grok                      | X posts                   | `x-search`              | Chinese, English; existing           |
| `xiaohongshu-diandian` | Xiaohongshu / 点点            | Xiaohongshu notes         | `xiaohongshu-search`    | Chinese; existing                    |
| `youtube-gemini`       | Gemini Apps                   | YouTube videos            | `gemini-youtube-search` | Chinese, English; account acceptance pending |
| `reddit-ai`            | Reddit / Ask                  | Reddit posts and comments | `reddit-search`         | English; guest entry observed          |

The advisor registry declares each route’s connection, source platform, search Skill, and language experts. `sourceProfiles` declares localized enhancement sentences and revisions. Shared source helpers and `canonicalPost` define accepted original-source identities; `PlatformAccess` starts the shared capture Agent. Main resolves a search catalog from the route's declared Skill rather than constructing its name from a platform ID.

Gemini's website session belongs to the Gemini connection. A future Gemini route for another content platform has its own route identity, language switches, source-profile binding, and search-Skill binding while reusing that session. Member selection and scheduled recipients address route-and-language experts. Each selected expert receives its own conversation, answer, cancellation, and receipt state. Route settings affect later admissions for that route; signing out of a shared connection changes access for every route that uses it.

A YouTube source retains `sourcePlatform: youtube`. Source readers and access state follow the content platform, so different AI routes that discover the same source reuse its collection capabilities. Direct YouTube collection uses the same reader as Gemini-discovered video links. The background Pi model remains selected through the existing model connection.

README sign-in requirements describe the setup for Postrove's supported reading workflow. X and Xiaohongshu collection use signed-in source sessions; public GitHub README collection uses guest access. The YouTube scope covers publicly accessible video metadata and captions; the Reddit scope covers publicly accessible posts and comments. Both readers support guest access. Reddit AI questions also support guest access; sign-in remains optional. Other web pages follow their site's access requirements.

The public YouTube caption reader starts with guest access. YouTube age restrictions or sign-in challenges enter browser fallback with their observed access state; the browser uses the YouTube session or requests user sign-in and verification. The fixed transcript subprocess starts with anonymous requests, while Gemini's account session remains in the browser. Public Reddit pages allow guest access and reuse an existing browser session when available. Pages that request sign-in or age verification use the source site's access flow. Shared browser sessions allow AI questions and source reading on the same site to reuse its login, including Grok/X and 点点/Xiaohongshu. Actual source permissions and readable content determine collection coverage. Restricted-source access remains subject to its actual permissions and a separate acceptance scope.

Interface, query, and reading languages retain the [existing language policy](product-spec.md#members-and-language). Query language guides the platform question; observed source language records what the platform actually returns. Source-language filtering would require a separate explicit policy. Reddit begins with English questions and uses the shared translator for the reader's chosen language.

## One preparation flow, source-specific sentences

Main translates only the original question into the expert's query language, appends one sentence selected from its source profile, and saves the complete submitted text. The browser bridge submits that text once. Source profile and prompt revisions join the frozen run snapshot.

| Source profile     | Chinese sentence                                                | English sentence                                                                                                         |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| X posts            | 请基于相关 X 帖子回答，并附原帖链接。                           | Answer using relevant X posts and include links to the original posts.                                                   |
| Xiaohongshu notes  | 请基于相关小红书笔记回答，并附原笔记链接。                      | Answer using relevant Xiaohongshu notes and include links to the original notes.                                         |
| YouTube videos     | 请搜索 YouTube 相关视频并据此回答，附原视频链接和适用的时间点。 | Search YouTube for relevant videos, answer from them, and include original video links with timestamps where applicable. |
| Reddit discussions | 请基于相关 Reddit 帖子和评论回答，并附原始链接。                | Answer using relevant Reddit posts and comments and include their original links.                                        |

The Chinese Reddit and English Xiaohongshu sentences describe the preparation contract; enabled experts follow the route's accepted query-language list.

The common browser system continues to own observation, capture, and task boundaries. Search Skills own fixed AI entry URLs, page interactions, readiness checks, and citation disclosure steps. A Skill handles product-specific controls such as Gemini's YouTube capability and Reddit's Ask entry. Main owns the enhancement sentence so preparation finishes before the bridge loads its guide.

## Agent packets and tools

| Execution              | Task and input                                                                                        | Tools                                                                               | Visible Skills                                                                                      | Result                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Platform bridge        | Submit the prepared question; capture the answer, then its citations after Main's save acknowledgment | `browser`, `load_platform_skill`, `capture_search_sources`, `structure_content`     | The route's one search Skill summary; full body after the Agent loads it                            | Exact question, original answer capture, observed citation captures and source state          |
| Material capture       | Read the supplied URL and scope; choose page operations and available tools using the loaded Skill   | `browser`, `load_platform_skill`, `structure_content`; eligible source-reader tools | Reading summaries including `youtube-reading` and `reddit-reading`; full bodies loaded by the Agent | Original material captures, coverage, and direct reference hints                              |
| Platform reading tools | Retrieve an observed source requested by the capture Agent                                           | Installed retrieval adapters; caption extraction uses zero model calls              | Instructions belong to the capture Agent's loaded reading Skill                                     | Task-scoped captures, original material, source identity, and actual coverage                  |
| Shared text operations | Translate, format, structure, or introduce supplied saved content                                     | Empty                                                                               | Empty                                                                                               | Reading versions associated with their original evidence                                      |

Both browser Agents retain explicit `load_platform_skill`. Gemini and Reddit reuse the bridge runtime, cancellation, model lease, checkpoints, receipts, and same-session answer/citation phases. Transcript reading adds a fixed tool, while the existing text operations handle its presentation.

## YouTube reading path

1. Main accepts a manual, bot, or selected citation URL through the existing reading queue. Canonicalization resolves `watch`, `youtu.be`, `shorts`, and `live` video addresses to a video ID. Playlist-only and channel URLs use general browser collection. A cited timestamp remains a locator on that video.
2. `PlatformAccess.collect` starts the same capture Agent used for every platform. The Agent loads `youtube-reading`, opens the video, and selects page operations and available tools for the requested scope. `read_youtube_transcript` wraps pinned yt-dlp and Deno to retrieve metadata and original caption tracks. Its request carries the observed URL, task identity, cancellation, timeout, and output limits. Fixed arguments isolate the subprocess from global downloader configuration and confine files to its task directory; application runtime preparation owns dependency versions.
3. The reader prefers a creator caption track in the identified spoken language, then an automatic track in that language. Available creator or automatic alternatives retain their declared language. Tracks with a translation target are excluded from original caption selection. Reading-language translation happens after original track selection. Empty responses and transient caption failures retain their actual error and retry within a fixed budget.
4. Main stores raw caption bytes and metadata before normalizing timed segments. Deterministic normalization merges rolling-caption overlap while retaining legitimate repetitions. Each segment retains start/end times and a link to the original video position. The saved source uses the same task-scoped `captureId` boundary as browser sources, with `evidence.kind: transcript` and adapter provenance.
5. A successful tool read returns evidence to the same capture Agent. The Agent captures additional requested material and returns the combined evidence IDs. A failed or unavailable reader directs the Agent to the accessible transcript UI through the existing Chrome gateway. Browser metadata or a description alone produces partial coverage. Source-reader tools register when their backend is ready. Calls accept current-task observed video URLs; a repeated URL in the same attempt returns the saved outcome. This also covers videos discovered after a browser redirect.
6. Shared translation and formatting preserve segment IDs, video links, and timestamp targets. Introduction uses the saved text and coverage. Direct links from the creator's captured description follow the existing one-level reference scope.

Platform reading tools run within the capture task's browser-session boundary. Main bounds caption subprocess execution and preserves cancellation and attempt state. Transcript records describe caption coverage and available time ranges. Visual coverage remains unknown on this path, including when all available captions were retrieved. Missing captions retain available metadata and the observed cause. Future audio or visual tools can join the same tool catalog; the YouTube Skill will guide their use and combined coverage within this collection flow.

## Gemini and Reddit discovery

Gemini Apps receives the YouTube-specific sentence through its web UI. Its search Skill verifies the signed-in state and observed YouTube capability, then captures video cards and links associated with the saved answer. An account setting or consent requirement returns the existing actionable platform state. Citation validation admits individual YouTube videos from captured evidence; other observed links remain answer evidence. User collection then enters the same capture Agent and reading Skill used by manual links.

Reddit's search Skill opens Ask, submits the English prepared question, and captures its answer and original post/comment permalinks. `reddit-reading` captures a cited post's body or a cited comment with the parent post and necessary ancestor context. Selected comment identity remains separate from the parent post. Thread coverage records the captured scope; an entire discussion requires an explicitly wider collection task.

Main evolves `canonicalPost` into a source-identity registry. Examples are `x:<postId>`, `xiaohongshu:<noteId>`, `youtube:video:<videoId>`, `reddit:post:<postId>`, and `reddit:comment:<commentId>`. Candidates retain source kind and source platform. YouTube timestamps stay in citation locators while collection deduplicates by video identity. Video metadata bounds normalized caption-segment times. Main validates the captured link, source type, and canonical identity. A saved AI answer and a readable original material remain separate outcomes.

## Evidence, result files, and recovery

Caption evidence extends the existing [result package](data-contracts.md#result-packages):

```text
results/reading/<attemptId>/
  result.md
  input.json
  manifest.json
  sources/material-1.md
  evidence/youtube/<videoId>/
    metadata.json
    captions.json3
    segments.json
    references.json
    reader-attempt.json
```

`captions.json3` preserves the selected original track. Raw metadata retains video identity, duration, creator, description, and offered tracks. Source evidence records the selected language, creator or automatic origin, segment IDs, and actual coverage. `reader-attempt.json` records pinned runtime versions, time, and completed or unavailable state. Segments refer to raw-caption evidence and preserve time positions. Manifest hashes cover these evidence files. Source Markdown contains timestamp links; `result.md` remains the readable entry for another Agent. The existing `latest.md` and immutable publication rules apply. A reading retry creates a new attempt and retains prior evidence.

Search snapshots add route, AI connection, source-profile revision, and the complete submitted prompt. Existing questions, replies, post keys, and result packages retain their saved values. Legacy X and Xiaohongshu records map to their current routes.

Failures retain the current preparation, bridge, platform, sources, and reading-processing stages. Source-reader errors additionally record caption absence, extraction failure, or runtime availability. Main persists the useful answer, source metadata, and finished chunks before reporting partial results. Recovery reuses saved conversation checkpoints or source captures as appropriate.

## Delivery sequence and boundaries

1. Separate AI-connection identity, advisor route, and source profile. Preserve existing IDs and migrate legacy records through their current routes.
2. Add Gemini/YouTube and Reddit search Skills, source identities, citation validation, connection checks, and shared-language expert controls.
3. Add the pinned transcript runtime, source-reader service/tool, caption evidence, YouTube/Reddit reading Skills, and result-file publication.
4. Run live acceptance with complex questions, observed original citations, manual and bot links, collected citations, missing captions, comments with context, cancellation, and restart recovery. A representative video set checks creator captions, automatic captions, duplicate rolling cues, source languages, timestamp links, long-video coverage, and unavailable videos.

Audio transcription and visual analysis remain separate capability slots for a later design. Each requires a configured backend and its own evidence type, budget, coverage, and data-sharing policy. Gemini's platform reply retains its AI-answer provenance. Captured transcripts retain their caption provenance. This implementation includes the route registry, platform Skills, shared connection controls, fixed caption reader, and evidence publication. Live account acceptance remains separate from controlled verification.

## Verified upstream references

Checked on 2026-10-20. These sources establish upstream capabilities; live acceptance establishes application delivery.

- [Gemini Apps and YouTube](https://support.google.com/gemini/answer/16622858?hl=en): public-video discovery and questions; sign-in and Keep Activity requirements.
- [Reddit AI search](https://support.reddithelp.com/hc/en-us/articles/32026729424916-Reddit-s-AI-search): Ask entry, post/comment synthesis, original citations, and supported languages.
- [Agent Reach video guide](https://github.com/Panniantong/Agent-Reach/blob/main/agent_reach/skill/references/video.md): subtitle retrieval through yt-dlp, browser fallback, and separately configured audio transcription.
- [Agent Reach YouTube channel](https://github.com/Panniantong/Agent-Reach/blob/main/agent_reach/channels/youtube.py): backend and JavaScript-runtime health checks.
- [yt-dlp subtitle options](https://github.com/yt-dlp/yt-dlp#subtitle-options): creator and automatic caption tracks, language selection, and caption formats.
- [yt-dlp YouTube authentication](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies): account access is content-dependent and browser cookies require explicit transfer to the subprocess.
- [YouTube age restrictions](https://support.google.com/youtube/answer/10070779?hl=en): signed-in access and applicable age verification for restricted videos.
- [Reddit public content](https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy): public content is generally accessible to guests.
- [Reddit age requirements](https://support.reddithelp.com/hc/en-us/articles/360043066492-How-old-do-I-need-to-be-to-use-Reddit): sign-in and age-verification conditions for restricted content.
- [Gemini API video understanding](https://ai.google.dev/gemini-api/docs/video-understanding): a separate potential audio/visual backend from the Gemini Apps bridge.
