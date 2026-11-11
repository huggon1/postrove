# Postrove product specification

Postrove presents questions as topics. Selected AI members reply independently through their own platform. People collect useful sources into a separate reading library. This document owns product behavior; [architecture](architecture-overview.md) owns execution.

## Workspace

The top navigation contains Topics, Reading, and Scheduled messages. Settings and Members open from the top bar. A topic contains the original question, selected members, their replies, source links, and member receipts. Opening a card shows its conversation. The topic list supports all, unread, and scheduled views.

The composer sends the question to its selected enabled members. An HTTPS address or a domain address opens Add link. Source collection offers individual, selected, and all-source actions. Selecting a collected source opens its reading record. AI members produce independent replies to the original question.

The renderer tracks pending states, errors, and retry actions by operation scope. Controls in independent scopes stay available while another scope runs. A failed mutation retains a retry of that mutation; a failed snapshot read offers Reload. Confirmation dialogs display their operation errors inside the active dialog. Cancelling a destructive confirmation clears its retry action.

On Windows, closing the final window shuts down services and exits the application; minimizing keeps it running. On macOS, closing a window keeps the application running, and the Dock reopens the workspace.

## Members and language

A website connection owns its shared browser session. Each source-platform/AI route enables its own language experts. X/Grok and YouTube/Gemini offer Chinese and English; Xiaohongshu/点点 offers Chinese; Reddit AI offers English. Gemini routes share Google sign-in. Reddit supports guest questions and optional sign-in. Members opens platform connection cards, a focused sign-in step, login verification, language selection, and sign-out confirmation.

Connection settings show the saved account name and platform handle when available. Login completion captures the account name once. Refresh account name captures and saves a fresh observation; ordinary settings views retain the saved value. A failed refresh retains the current session’s prior name and shows inline feedback. The home icon opens the platform homepage in the same visible Chrome profile. Connected sessions awaiting an observed self identity show Account name pending in connection detail. Platform status labels reflect the shared session's sign-in state: Connected after detected sign-in and Disconnected while signed out. The member catalog, connection detail, and Settings use the same labels. Reddit's English expert remains available for guest use while its connection shows Disconnected.

Initial account-status reads show a loading state. A failed read retains the last valid account observation and displays Read failed with Reload. Member setup displays its missing-Chrome message after an explicit missing-installation observation. Capability requirements use the same account-read feedback, including Bilibili's reading connection.

While signed out, the platform connection detail shows one inline account-risk reminder above Open sign-in window, recommending a secondary account. Confirmed sign-in hides the reminder.

Interface language controls application labels. On first startup, the primary system language selects Simplified Chinese for Chinese variants and English for other languages. The application saves this initial selection. Later launches use the saved preference; the user can change it in Settings. Expert language controls the exact question sent to the platform AI. Reading language controls prepared replies and collected material; its default follows the interface language. Main freezes the resolved reading language when accepting a run. Saved content keeps its original language after preference changes.

Main prepares one question version per selected expert language within each topic. Experts reuse that version and append their source-profile sentence requesting original posts, comments, or YouTube videos and their links. A language preparation failure ends preparation for its dependent experts while the other language continues. Each expert opens a fresh conversation. The application saves the exact submitted question and captured answer. One reading-version operation combines faithful translation and necessary Markdown formatting. The reader can switch between reading and original versions and inspect the actual question.

## Replies, receipts, and recovery

Main saves the platform answer before asking the same browser session to extract its citations. Receipt details show each member's answer, source state, and observed failure stage: question preparation, bridge, platform, sources, or reading processing. Partial success keeps useful replies and verified links readable. Empty sources produce a partial topic.

Topic receipts expose Stop for active members, Stop all, result-file access, and native Pi log export. Stopping one member lets the other selected members continue. A captured answer survives cancellation and later citation or translation failure. A submitted checkpoint records the existing conversation; crash recovery observes that conversation before continuing. An unavailable conversation produces a bridge failure. A fresh send creates a new topic.

Topics run in admission order. Within one topic, different AI connections search concurrently. Language experts sharing an AI connection take turns through answer capture and citation extraction. Reading-version processing runs independently while the next expert searches. Topic completion waits for every expert and its reading processing. Search and reading enter independent queues. Collection, sign-in, sign-out, and explicit browser-mode changes take exclusive browser access. The application retries transient browser/model failures within fixed budgets. Login, verification, and account agreements return an actionable platform state. A reading failure retains saved source content and completed translation chunks. A source acquisition issue keeps its material partial after text processing finishes. Retry captures affected sources again, preserves saved content during capture failure, and refreshes reading text when captured content changes.

## Scheduled messages

A scheduled message stores a name, question, selected members, and a repeat rule. The editor supports one send on a date, daily repetition, selected weekdays, monthly repetition, and fixed minute or hour intervals. Calendar rules support an interval of 1–52 days, weeks, or months and up to six send times. Weekly presets select every day, Monday–Friday, or weekends. Monthly rules select a day, the last day, or the first through fourth or last occurrence of a weekday. A missing monthly date skips that month.

Each rule saves its time zone and start date. Repeating rules accept an inclusive end date. Daily and weekly intervals use the start date as their anchor; weekly intervals start on Monday. Monthly intervals use the start month. Fixed intervals use elapsed time from the start date and anchor time. Calendar sends retain their saved wall time across daylight-saving changes; a missing wall time skips the occurrence and a repeated wall time uses its first instant.

The editor previews up to three upcoming occurrences in the saved zone. A one-time rule previews its single occurrence. Save and resume require a future occurrence. An exhausted rule retains its record, displays Ended, and can be edited to a future date. Pause retains the rule's original interval anchor.

Scheduled-message cards and the home next-send card display each occurrence in its saved zone. Both views identify that zone. A schedule whose name equals its question presents the question once.

Each due occurrence creates a new topic with frozen conditions. The running application admits occurrences; occurrences missed while closed expire. An outstanding run for the same schedule skips that occurrence. Edits affect later admissions; pause and delete affect future occurrences.

Member changes update future recipient sets. A schedule with zero enabled recipients becomes paused. The editor requires an enabled recipient before save or resume. Already admitted topics retain their member snapshot. Historical time-range fields remain readable; new sends use the exact question and the post-enhancement sentence.

Before disabling an expert, the confirmation shows the number of affected saved schedules and the number that will become paused.

## Reading and link intake

Reading contains saved and partial materials. Add link accepts HTTPS addresses and domain addresses. Domain addresses receive an HTTPS prefix; path, query parameters, and fragments retain their submitted values. Telegram and Feishu authorized messages enter the same collection pipeline. Main saves the accepted message identity before acknowledging intake. Repeated message identities reuse their queue entry.

Collection captures the main text, images, and one level of direct references. The capture Agent loads the source's reading Skill and chooses available tools and page controls for its scope. GitHub collection targets the default README. YouTube and Bilibili collection prefer native captions. When captions are absent, collection transcribes accessible audio through the local speech service. Metadata checkpoints survive media and transcription failures; timestamp links retain video and part identity. Xiaohongshu video uses the same local speech service. Reddit collection reads the selected post or comment with its required context. Materials keep their individual sources, coverage, translated chunks, introductions, and issues. The reader offers a material selector, original/reading versions, source navigation, progress, Stop, retry, result files, and native logs. Markdown preserves links, code, images, and diagrams.

Telegram settings has a collapsed connection card and a focused setup drawer: verified Token, discovered-chat authorization, then reading access. Feishu uses scan-to-create or existing App ID/Secret, application permissions, discovered direct-chat authorization, and account management. Credential replacement verifies the new account before commit. Revocation affects later intake while preserving accepted records. Review profiles start bot receiving paused. [Bot contracts](data-contracts.md#shared-bot-receipts-and-feishu-accounts) own deduplication and history recovery.

## Settings

Settings contains Capability map, Speech to text, Inbox connections, AI members, Background models, Preferences, and About. The capability map shows each platform and its current capability points. Opening a platform lists its capability groups with a clickable configuration status. Selecting a status opens that group's requirements, with pending items before configured items. Each pending item opens its configuration destination. Account-dependent capabilities appear as groups with an account requirement. The view reads actual model, Chrome, reader, speech-resource, session, and enabled-expert states. Speech to text verifies packaged components and downloads the pinned local model after an explicit installation action. Installation reports transferred bytes, verification, readiness, cancellation, and retry. Navigation retains the Main-owned installation. Application shutdown cancels and drains its active download. Background models shows a card for each saved connection. Use this connection activates its saved model and options. The active card shows In use, a Current model selector, and Check connection. Selecting a model validates its authentication and saved reasoning options before committing the change. A failed change retains the active configuration and shows the required correction. Connection checks use the active saved configuration. Switching its connection, model, credentials, or execution options cancels an outstanding check and resets its result. A name edit or a change to another saved connection retains the active check result.

Each connection's actions menu offers Edit configuration and Remove connection. Model setup separates connection method, native Pi authentication, and model/options. The connection method selects either a built-in provider or a custom service configured with a provider ID and Pi `models.json`. Each method shows its own fields and advances through Continue. Switching methods retains field values and clears the previous method's validation feedback. A new connection ends with Save and use. Editing a saved connection opens its model/options; Save connection updates that connection and retains the active selection. Reauthorization replaces the edited connection on save and preserves its active or inactive status. Authentication controls follow the native provider's text, secret, selection, browser, or device-code prompts.

Main freezes model metadata and options for active execution through a lease. Existing API connections migrate to Pi. Native authorization commits when the user saves the connection. Historical Codex settings remain inactive. Cancellation retains the active connection. Browser visibility changes apply at the next task admission after active task pages drain; overlapping task pages retain their shared browser mode. Platform sign-in always opens a visible window.

## Saved results and deletion

Terminal runs publish immutable Markdown packages. Result file opens the current run's location. The reading header's copy icon copies the current attempt's absolute `result.md` path and briefly shows a check after copying. [Result contracts](data-contracts.md#result-packages) define stable paths and latest results for further Agent work.

Deleting a topic or reading record changes visibility and offers Undo for eight seconds. Main stops active execution before deleting it. Source associations, material evidence, logs, and receipt identities remain saved. Undo restores the same record identity. Recollecting a hidden reading result creates a fresh reading identity.

## Application updates

Installed macOS and Windows builds check GitHub Releases after startup and every six hours. About shows version, check state, release notes, download, cancellation, and installation. Source builds show the installed-build requirement. Download requires a user action.

Install and Restart waits for active work after confirmation, holds admission in both queues, validates the package, and shuts down services. A failure resumes admission. Cancelling the wait resumes queued work. Restart opens the same profile, preserves accepted records, and resumes queued work. [Release preparation](development.md#release-preparation) owns signing and package acceptance.
