# Postrove product specification

Postrove presents questions as topics. Selected AI members reply independently through their own platform. People collect useful sources into a separate reading library. This document owns product behavior; [architecture](architecture-overview.md) owns execution.

## Workspace

The top navigation contains Topics, Reading, and Scheduled messages. Settings and Members open from the top bar. A topic contains the original question, selected members, their replies, source links, and member receipts. Opening a card shows its conversation. The topic list supports all, unread, and scheduled views.

The composer sends the question to its selected enabled members. An HTTPS link opens Add link. Source collection offers individual, selected, and all-source actions. Selecting a collected source opens its reading record. AI members produce independent replies to the original question.

On Windows, closing the final window shuts down services and exits the application; minimizing keeps it running. On macOS, closing a window keeps the application running, and the Dock reopens the workspace.

## Members and language

A website connection owns its shared browser session. Each source-platform/AI route enables its own language experts. X/Grok and YouTube/Gemini offer Chinese and English; Xiaohongshu/点点 offers Chinese; Reddit AI offers English. Gemini routes share Google sign-in. Reddit supports guest questions and optional sign-in. Members opens platform connection cards, a focused sign-in step, login verification, language selection, and sign-out confirmation.

While signed out, the platform connection detail shows one inline account-risk reminder above Open sign-in window, recommending a secondary account. Confirmed sign-in hides the reminder.

Interface language controls application labels. On first startup, the primary system language selects Simplified Chinese for Chinese variants and English for other languages. The application saves this initial selection. Later launches use the saved preference; the user can change it in Settings. Expert language controls the exact question sent to the platform AI. Reading language controls prepared replies and collected material; its default follows the interface language. Main freezes the resolved reading language when accepting a run. Saved content keeps its original language after preference changes.

Main prepares one question version per selected expert language within each topic. Experts reuse that version and append their source-profile sentence requesting original posts, comments, or YouTube videos and their links. A language preparation failure ends preparation for its dependent experts while the other language continues. Each expert opens a fresh conversation. The application saves the exact submitted question and captured answer. One reading-version operation combines faithful translation and necessary Markdown formatting. The reader can switch between reading and original versions and inspect the actual question.

## Replies, receipts, and recovery

Main saves the platform answer before asking the same browser session to extract its citations. Receipt details show each member's answer, source state, and observed failure stage: question preparation, bridge, platform, sources, or reading processing. Partial success keeps useful replies and verified links readable. Empty sources produce a partial topic.

Topic receipts expose Stop for active members, Stop all, result-file access, and native Pi log export. Stopping one member lets the other selected members continue. A captured answer survives cancellation and later citation or translation failure. A submitted checkpoint records the existing conversation; crash recovery observes that conversation before continuing. An unavailable conversation produces a bridge failure. A fresh send creates a new topic.

Browser access uses a shared serial lock. Search and reading enter independent queues. The application retries transient browser/model failures within fixed budgets. Login, verification, and account agreements return an actionable platform state. A reading failure retains saved source content and completed translation chunks.

## Scheduled messages

A scheduled message stores a name, question, selected members, and a repeat rule. The editor supports one send on a date, daily repetition, selected weekdays, monthly repetition, and fixed minute or hour intervals. Calendar rules support an interval of 1–52 days, weeks, or months and up to six send times. Weekly presets select every day, Monday–Friday, or weekends. Monthly rules select a day, the last day, or the first through fourth or last occurrence of a weekday. A missing monthly date skips that month.

Each rule saves its time zone and start date. Repeating rules accept an inclusive end date. Daily and weekly intervals use the start date as their anchor; weekly intervals start on Monday. Monthly intervals use the start month. Fixed intervals use elapsed time from the start date and anchor time. Calendar sends retain their saved wall time across daylight-saving changes; a missing wall time skips the occurrence and a repeated wall time uses its first instant.

The editor previews up to three upcoming occurrences in the saved zone. A one-time rule previews its single occurrence. Save and resume require a future occurrence. An exhausted rule retains its record, displays Ended, and can be edited to a future date. Pause retains the rule's original interval anchor.

Each due occurrence creates a new topic with frozen conditions. The running application admits occurrences; occurrences missed while closed expire. An outstanding run for the same schedule skips that occurrence. Edits affect later admissions; pause and delete affect future occurrences.

Member changes update future recipient sets. A schedule with zero enabled recipients becomes paused. The editor requires an enabled recipient before save or resume. Already admitted topics retain their member snapshot. Historical time-range fields remain readable; new sends use the exact question and the post-enhancement sentence.

## Reading and link intake

Reading contains saved and partial materials. Add link accepts HTTPS addresses. Telegram and Feishu authorized messages enter the same collection pipeline. Main saves the accepted message identity before acknowledging intake. Repeated message identities reuse their queue entry.

Collection captures the main text, images, and one level of direct references. The capture Agent loads the source's reading Skill and chooses available tools and page controls for its scope. GitHub collection targets the default README. YouTube collection uses original captions, metadata, and creator-supplied materials, with timestamp links retaining video identity. Reddit collection reads the selected post or comment with its required context. Materials keep their individual sources, coverage, translated chunks, introductions, and issues. The reader offers a material selector, original/reading versions, source navigation, progress, Stop, retry, result files, and native logs. Markdown preserves links, code, images, and diagrams.

Telegram settings has a collapsed connection card and a focused setup drawer: verified Token, discovered-chat authorization, then reading access. Feishu uses scan-to-create or existing App ID/Secret, application permissions, discovered direct-chat authorization, and account management. Credential replacement verifies the new account before commit. Revocation affects later intake while preserving accepted records. Review profiles start bot receiving paused. [Bot contracts](data-contracts.md#shared-bot-receipts-and-feishu-accounts) own deduplication and history recovery.

## Settings

Settings contains Inbox connections, AI members, Background models, Preferences, and About. Background models shows a card for each saved connection. Use this connection activates its saved model and options. The active card shows In use, a Current model selector, and Check connection. Selecting a model validates its authentication and saved reasoning options before committing the change. A failed change retains the active configuration and shows the required correction. Connection checks use the active saved configuration. Switching its connection, model, credentials, or execution options cancels an outstanding check and resets its result. A name edit or a change to another saved connection retains the active check result.

Each connection's actions menu offers Edit configuration and Remove connection. Model setup separates connection method, native Pi authentication, and model/options. The connection method selects either a built-in provider or a custom service configured with a provider ID and Pi `models.json`. Each method shows its own fields and advances through Continue. Switching methods retains field values and clears the previous method's validation feedback. A new connection ends with Save and use. Editing a saved connection opens its model/options; Save connection updates that connection and retains the active selection. Reauthorization replaces the edited connection on save and preserves its active or inactive status. Authentication controls follow the native provider's text, secret, selection, browser, or device-code prompts.

Main freezes model metadata and options for active execution through a lease. Existing API connections migrate to Pi. Native authorization commits when the user saves the connection. Historical Codex settings remain inactive. Cancellation retains the active connection. Browser visibility applies at the next browser operation. Platform sign-in always opens a visible window.

## Saved results and deletion

Terminal runs publish immutable Markdown packages. Result file opens the current run's location. [Result contracts](data-contracts.md#result-packages) define stable paths and latest results for further Agent work.

Deleting a topic or reading record changes visibility and offers Undo for eight seconds. Main stops active execution before deleting it. Source associations, material evidence, logs, and receipt identities remain saved. Undo restores the same record identity. Recollecting a hidden reading result creates a fresh reading identity.

## Application updates

Installed macOS and Windows builds check GitHub Releases after startup and every six hours. About shows version, check state, release notes, download, cancellation, and installation. Source builds show the installed-build requirement. Download requires a user action.

Install and Restart waits for active work after confirmation, holds admission in both queues, validates the package, and shuts down services. A failure resumes admission. Cancelling the wait resumes queued work. Restart opens the same profile, preserves accepted records, and resumes queued work. [Release preparation](development.md#release-preparation) owns signing and package acceptance.
