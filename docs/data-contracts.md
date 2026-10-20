# Postrove data and message contracts

This document defines logical objects, cross-process fields, and persistence order for the topic workspace. The [product specification](product-spec.md) owns business behavior; [architecture](architecture-overview.md) owns runtime responsibilities. TypeScript schemas define the exact implemented field shapes.

## Identity and persistence ownership

The [architecture](architecture-overview.md#runtime-boundaries-and-data-ownership) defines writable-state ownership.

| Identity                 | Object                                                   |
| ------------------------ | -------------------------------------------------------- |
| `followId`               | Saved search conditions and recurring schedule           |
| `reportId`               | One independent search report                            |
| `taskId`                 | One search or parsing execution                          |
| `sectionId`              | One language expert's reply in a topic                 |
| `candidateId`, `postKey` | A candidate occurrence and its canonical source identity |
| `resultId`, `materialId` | Parsing delivery identity and saved reading report       |

Timestamps use ISO strings with timezone information. The interface displays local time. Saved follow snapshots keep reports readable after configuration edits or deletion.

## Search conditions, follows, and reports

`StartFocusSearch` accepts `question`, unique selected `advisorIds`, and matching unique `platforms`. The service trims outer question whitespace. New sends use `period: all`; historical period values remain readable. An advisor is one supported platform AI plus query language. `x-grok-zh` and `x-grok-en` share `connectionId: x-grok`; `xiaohongshu-diandian-zh` uses `xiaohongshu-diandian`. `advisors.json` stores the enabled IDs. Legacy callers and historical sections map X to English and Xiaohongshu to Chinese. Interface, query, and reading languages are independent. `preferences.json` stores interface language, reading language (`app`, `zh-CN`, `en`), and browser visibility.

`Follow` saves `followId`, name, question, platforms, period, schedule, paused state, revision, creation/update times, and `nextRunAt`. A schedule has `cadence` daily or weekly, `time` in local HH:mm, and a weekday for weekly execution. Weekday uses zero for Sunday through six for Saturday. `lastSkippedAt` records the latest skipped occurrence when available. `lastOccurrenceAt` retains the latest consumed occurrence so a clock rollback and restart preserve schedule admission identity.

`FocusSearchReport` saves `reportId`, `taskId`, question, output language, creation time, origin manual or follow, period, platforms, sections, and candidate submissions. Follow runs add `followId`, `followName`, `followRevision`, and `scheduledFor`. New runs freeze these inputs when admitted to the queue.

Report status is queued, running, completed, partial, failed, or stopped. `finishedAt` records its terminal time. `taskOutcome` persists completion, failure, or cancellation so startup can reconcile an interrupted task event after report commit. Each section saves `advisorId`, `connectionId`, independent `runId`, query language, prompt/Skill revisions, exact prepared and submitted prompts, original reply bytes, optional `readingReply`, candidates, state, warnings, and failure stage. `checkpoint` records prepared, submitted, or answered plus the observed conversation URL. `processingIssue` retains reading-version failure alongside the original answer. Cancellation is scoped to the section or parent topic.

Section `citationExtraction` records pending, running, completed, empty, or failed, with an optional error. The main process commits the captured answer before acknowledging source extraction. Interrupted reports retain those committed replies.

Report loading keeps current schema fields and strips retired synthesis data. Existing platform replies, candidates, and submission associations remain available.

## Candidate sources and parsing submission

Candidates contain identity, canonical `postKey`, URL, title, description, and optional displayed publication date. The saved answer and associated source captures establish citation evidence; titles and dates come from those captures. Main validates each candidate's platform and post identity. New Xiaohongshu candidates require an observed source-card address with access parameters, or a readable note whose own content container and document navigation share its note identity. Bare inline links remain answer evidence while source verification runs. Admitted addresses preserve their access parameters for parsing submission.

A submission association maps report plus canonical post identity to reserved parsing `taskId` and `resultId`. The service persists that reservation before submitting to forwarding. Repeated addition reuses the saved identity. The parsing task follows its own lifecycle and material persistence.

## Schedule admission and recovery

Follow changes and ticks use serialized mutations. A due occurrence advances `nextRunAt` before admission. `lastOccurrenceAt` protects occurrence identity across clock rollback. [Product scheduling](product-spec.md#scheduled-messages) owns skip and queue rules. Startup derives terminal report status from saved platform and citation states, preserves stopped reports, and retains saved answers after interruption.

## Submitted sources and reports

One application or Telegram HTTPS URL enters the forwarding queue with task, result, and material identities. Parsing tasks freeze their output language.

`SourceContent` saves requested URL, platform, source identity, retrieval time, ordered Markdown, images, and actual completeness. Images keep an HTTPS address and an optional local cached address. Capture validation compares canonical X and Xiaohongshu post identities and observed URLs for other pages; saved source bytes establish translation provenance.

`ReadingMaterial` contains an ID, main or reference role, URL, title, optional source, translation chunks, summary, state, and issue. A chunk saves original text, translated text, and completion. Materials begin with one main item and unique IDs and URLs. Completed material has a source, summary, and completed chunks; partial and failed items preserve available content. Source rejection saves the observed platform reason as the material issue; Xiaohongshu `300031` retains “当前笔记暂时无法浏览”.

Workers emit initial materials, individual material updates, phases, execution identity, stage failures, and final results. Main-process validation preserves identity, saved source bytes, and finished chunks. The final report matches saved material state. Stopping retains the saved portion of each material.

## Task snapshots and activity messages

`TaskSnapshot` is the execution view of task identity, kind, state, phase, progress, update time, readable error, and result reference. Search reports use result kind `focus_search_report`. Parsing records contribute their queue and processing states through the unified view.

The main process saves the initial task and report before execution, then validates and saves progress before notifying the renderer. Final report persistence precedes terminal task status. Search report partial state expresses useful saved material when task execution has ended.

`TaskActivity` contains ordered stage summaries and bounded public messages. Complete model messages and tool actions belong to the Pi session.

A task can own several Pi sessions for browser work and reading attempts. Trace association uses the parent task identity and individual execution/session identity. Native HTML export copies the associated Pi files to the selected local destination. Persisted JSONL remains in the local profile; export reports an unavailable state when native HTML is absent. Trace contents remain local until the user chooses to export them.

## Record visibility and undo journal

Main owns `record-deletions.json` with version 1, `hidden` record references, and `undo` operations. A reference contains kind `task`, `parsed`, or `search` plus its identity. Parsed references use root `materialId`; search references use `reportId`. Each undo operation contains its UUID, references, and expiry timestamp. Main serializes Delete and Undo and atomically saves the journal before publishing visibility changes. Bulk history clearing freezes the terminal records admitted to that operation.

Deletion changes visibility independently of the execution stores. Original records, receipt deduplication, candidate provenance, cached media, and Pi traces remain local historical evidence. Result-facing IPC filters hidden content; task-facing IPC filters hidden history and marks deleted results. Profile copy carries the journal with its original identities. An expired operation keeps the deletion and retires its recovery action; a later journal write removes expired recovery entries. Candidate addition replaces a reservation whose parsing output is hidden while retaining the previous parsing execution as history.

## Development profiles and execution identity

`RuntimeProfile` records installed, review, or test mode, resolved data directory, and integration policy. Storage, credentials, browser sessions, and traces resolve under the selected profile. Independent instances use independent profiles. Review mode pauses background integrations during preparation.

Installed profiles retain their storage location, encryption identity, browser sessions, and cached image addresses. Fresh installations use `Postrove/profiles/default` under the operating system's application-data directory.

`PromptExecution` associates task and attempt identity, revision, output language, model, and build with reading. New records also include provider ID, Pi version, requested reasoning, and effective reasoning; advanced API mode records `api_options`. Historical records retain their original optional fields. Current reading `promptRevision` hashes its translation and introduction system strings; its scope is that base post-collection instruction pair. Browser tool definitions and loaded skill bodies are recorded in native session messages. Search saves `outputLanguage` in its report and uses native sessions for execution context.

Model execution acquires a connection lease that freezes the provider, complete Pi model metadata, reasoning, and user options. Reports and interface state read redacted connection information. Shared Chrome retains website sessions. Platform sign-out clears that platform's session state.

## Pi model connections

`pi/connections.json` stores version 2, a saved connection list, an optional active connection UUID, retirement UUIDs, and a completed-legacy-migration marker. Each connection saves its provider ID, model ID, display name, common/API options, and environment-credential policy. A migrated custom model with a former server-selected output limit also retains `serverDefaultOutputModelId`; a model change retires this compatibility marker and an explicit output setting takes precedence. Browser and reading reasoning choices save `task_default` or a Pi level. At acquisition, task defaults resolve against the current model's supported levels; an explicit level that has disappeared requires a new selection. The private worker channel carries the frozen model, options, and credential-file paths.

`pi/connections/<uuid>/auth.json` belongs to Pi AuthStorage. Pi retains complete native API-key or OAuth records, including provider-specific fields, and serializes token replacement across processes. Each directory also owns native `models.json` and `models-store.json`. The selected-connection view derives its built-in/custom classification from the selected provider entry in models.json. The provider list marks IDs supplied by the independent `pi/catalog` runtime as built-in. `pi/device.json` supplies the stable installation identity requested by native login. Files use mode 0600 and new parent directories use mode 0700.

Stored credentials stay in their connection directory. A connection using ambient credentials explicitly carries that environment policy into workers. Default workers retain the existing minimal environment. Environment-enabled workers inherit the app environment with process-control and application-control variables filtered; Pi resolves the selected provider's environment, profile, or cloud credentials.

General API migration first writes and validates the new connection, then atomically saves the active UUID. After native commit, migration writes credential-free `model-connection.migrated.json` evidence and retires the original plain/encrypted credential copies. Interrupted source cleanup resumes at startup. An existing general API becomes a Pi custom provider. OpenAI Codex uses Pi native authorization. Previous CLI connection files remain outside active connection selection, with their original files retained. The completed-migration marker keeps the retired API source outside future connection selection.

Removing a connection first saves its retirement UUID and clears its active selection. Existing leases retain the credential directory until release. Cleanup uses native Pi logout and removes the owned connection directory, then clears its retirement UUID. Startup completes saved retirements and removes abandoned authorization drafts from this namespace. Provider-side authorization management stays in the provider account.

Reauthorizing a saved connection stages a new credential directory with its existing catalog, model, and options. Saving commits the replacement connection and retires the prior directory through the same lease-aware cleanup. Cancellation keeps the saved connection active.

Credentials and file paths cross the private execution channel. Public task snapshots and model views contain connection metadata, option identities, and classified failures. Authentication errors use bounded application messages. Native session export follows the local trace boundary above.

## Telegram queue and upgrade retention

Telegram state saves an optional verified `botUsername`, authorized chats, pending authorization candidates, confirmed `updateOffset`, inbound receipts, queued forwarding, and connection status. Accepted receipt, queue identity, pending acknowledgment, and cursor advance persist together. Successful forwarding submission and acknowledgment delivery then save their progress. Chat and message identity form the deduplication key. Successful Bot verification saves its username separately from credentials; status returns that username while a Token is configured. Token save verifies the submitted Bot before committing its credentials and username; Token clearing removes the cached identity. Polling connection updates preserve the verified identity and chat authorization.

The topic upgrade preserves business records, pending receipt identities, credentials, browser sessions, cached images, and result packages. Legacy `business-generation.json` remains historical evidence. Current startup reads the live stores directly. `FocusSearchStore` maps old platform sections and schedules to language experts; original questions, replies, source associations, dates, and historical periods retain their saved values.

## Shared bot receipts and Feishu accounts

`BotOrigin` identifies a channel, account, and message. New bot parsing tasks use `entry: bot` and this origin. Existing `entry: app` and `entry: telegram` tasks retain their identities. Telegram's store adapter maps its existing message keys into the shared inbox contract. Optional grants add the authorization time while existing authorized chats remain readable.

`feishu.json` stores application-keyed account identities, authorized chat IDs, sender-bound grants, discovered chats, durable receipts, queued submissions, and per-chat history checkpoints. A receipt and its reserved task and result identities persist in one atomic store update. Concurrent deliveries deduplicate within that update. Submission progress and pending acknowledgement state persist separately after delivery. Receipt retries use a stable outbound UUID derived from application and message identities.

History scans freeze an end time and overlap the prior checkpoint by one second. Authorization time and sender identity filter admission. Every page enters the same inbox as live events. The checkpoint advances after complete pagination. Revocation removes future admission; previously accepted submissions retain their identities.

`feishu-credentials.json` stores the active application credentials in a current-user file with mode 0600. Profile copying includes this file and bot account state only with `--include-auth`. Status, task views, and exported receipt evidence contain connection and message metadata. App Secrets and transport access tokens stay within Main's credential and transport boundaries. Scan registration uses the official account authorization host and keeps cancellation state in memory.

## Update receipt and queue recovery

`application-update.json` stores the current and target versions immediately before installation. Startup consumes a matching target receipt and exposes the previous version for the completion notice. A failed installation clears the receipt. Upgrades keep the selected runtime profile and its saved business records.

A queued search with pending, empty platform sections resumes from its saved conditions at startup. A submitted checkpoint resumes observation of the saved conversation; interrupted captured answers remain readable. Queued task snapshots keep that state. Searches that already ran follow the saved-result recovery path. Parsing retains its queued records through shutdown. The [updater behavior](product-spec.md#application-updates) owns installation admission and user actions.

## Result packages

Main publishes each terminal search and reading attempt under the current profile:

```text
results/
  search/<taskId>/
    result.md
    input.json
    manifest.json
    sources/<candidateId>.md
    assets/<cached-image>
  reading/<attemptId-or-legacy-resultId>/
    result.md
    input.json
    manifest.json
    sources/material-<index>.md
    assets/<cached-image>
  search/latest.md
  search/latest.json
  reading/latest.md
  reading/latest.json
```

`result.md` contains readable replies or materials, sources, and actual terminal receipts. `input.json` contains saved non-secret input and language/identity metadata. `manifest.json` records version, run identity, admission/publication times, status, SHA-256 of the canonical result, and absolute result path. Source files preserve their captured text or saved citation reference. Cached images use package-relative paths.

Main writes a private staging directory, then renames it into place after all files finish. A published package remains fixed. Reading retries create a fresh `attemptId` and `attemptStartedAt` while retaining the previous package. `latest.md` contains the full content of the newest admitted terminal run plus its canonical absolute path. Admission time governs ordering when older runs finish later or are republished after restart. `latest.json` records that identity. A result-file action regenerates a missing terminal package before revealing it.

Result files use mode 0600 and new directories use mode 0700. Credentials, model auth paths, and browser sessions remain in connection storage. Published packages preserve historical evidence after record visibility changes. Profile copying retains result packages and cached images while its credential option controls authentication storage.

## Source routes and transcript evidence

Search sections retain optional `routeId` and `sourceProfileRevision` alongside the existing advisor, connection, language, and prompt fields. Existing X and Xiaohongshu identities retain their saved values. New source records keep the canonical identifier in `sourceKey`; `sourceIdentity` retains the observed author or title for presentation. A YouTube video uses `youtube:video:<id>`; watch, short, Shorts, and live URL variants share that key. Citation timestamps remain locators on the saved URL. Reddit posts use `reddit:post:<id>` and selected comments use `reddit:comment:<id>`.

YouTube captures retain original track language, creator/automatic track kind, stable segment IDs, start/end times, timestamp links, transcript coverage, and separate visual coverage. Raw extraction writes to `capture-evidence/<attemptId>/youtube/<videoId>/` under the selected profile. `reader-attempt.json` records running, completed, or unavailable state. Repeated reads in the same attempt reuse that state; a retry uses its new attempt identity.

A successful reader preserves `metadata.json`, `captions.json3`, `segments.json`, `references.json`, and the source record. Terminal reading publication copies raw evidence and completed or unavailable reader state into `results/reading/<attemptId>/evidence/youtube/<videoId>/`. The package manifest records capture identity, actual coverage, reader-attempt paths, and evidence-file SHA-256 hashes. Profile copying retains capture evidence with business material. Website credentials remain in browser storage.
