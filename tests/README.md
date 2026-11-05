# Application verification

[Product specification](../docs/product-spec.md) owns expected behavior. [Development](../docs/development.md) owns local launch and live-source preparation. Run artifacts record observed pass or failure.

## E2E scope

Fixtures use isolated profiles and controlled external responses.

[Xiaohongshu video fixtures](e2e/xiaohongshu-video.spec.ts) verify the task document, observed URL admission, guest cookies, share-link identity, ASR evidence, and metadata retention after media failure. Their process/model/audio boundaries use controlled responses. [Media rules](rules/xiaohongshu-media.test.ts) cover extraction and existing image/text behavior; [video rules](rules/xiaohongshu-video.test.ts) cover partial speech, zero segments, readiness, cancellation, and saved attempts. Live source acceptance has its own [scope](../docs/xiaohongshu-video.md#verification-scope).

| Test                                                            | Scope                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [application updates](e2e/application-updates.spec.ts)          | Version visibility, download cancellation, installation errors, shared queue hold, and queued search restart                                                                                                                                         |
| [application](e2e/application.spec.ts)                          | Startup, saved language, profile copy, and Telegram preparation                                                                                                                                                                                      |
| [application language](e2e/application-language.spec.ts)        | System-language defaults, native menu language, saved initial selection, and manual language persistence                                                                                                                                             |
| [Windows lifecycle](e2e/windows-lifecycle.spec.ts)              | Native minimize, final-window close, clean exit, and retained language and schedules after restart                                                                                                                                                   |
| [topic workspace](e2e/topic-workspace.spec.ts)                  | Shared language experts, independent replies, partial receipts, source collection, reading, schedules, files, responsive layout, and restart                                                                                                         |
| [schedules](e2e/schedules.spec.ts)                              | Rich rules, duplicate times, empty weekdays, date bounds, previews, pause, persistence, and bilingual layouts                                                                                                                                        |
| [Feishu bots](e2e/feishu-bot.spec.ts)                           | Setup, registration cancellation, concurrent receipt deduplication, SDK reconnection, history pagination, submission replay, authorization revocation, pending acknowledgement recovery, account isolation, paused review startup, and drawer layout |
| [Telegram setup](e2e/telegram-setup.spec.ts)                    | Connection card, verification recovery, chat authorization, restart, and setup layout                                                                                                                                                                |
| [Settings layout](e2e/settings-layout.spec.ts)                  | Title/action hierarchy, direct onboarding, secret visibility, local validation, exclusive model connection methods with retained drafts, nested member management, link intake, and English forms at narrow widths                                   |
| [record deletion](e2e/record-deletion.spec.ts)                  | Independent visibility, timed undo, candidate re-addition, and restart                                                                                                                                                                               |
| [reading](e2e/reading.spec.ts)                                  | Materials, frozen language, partial output, and restart                                                                                                                                                                                              |
| [reading fidelity](e2e/reading-fidelity.spec.ts)                | Code and link preservation                                                                                                                                                                                                                           |
| [reading diagnostics](e2e/reading-diagnostics.spec.ts) | Structured saved issues, selected-material feedback, and required failure messages in Chinese and English |
| [reading recovery](e2e/reading-recovery.spec.ts)                | Transport recovery, failed-task preservation, cancellation, and native logs                                                                                                                                                                          |
| [Pi log export](e2e/pi-log-export.spec.ts) | Single-file export, task and step names, offline navigation, application theme, native interactions, and page isolation |
| [material collection](e2e/material-collection.spec.ts)          | References, frame recovery after a transient click failure, provenance, and source structure                                                                                                                                                         |
| [browser Agent](e2e/browser-agent.spec.ts)                      | Capture identity, reply capture after a failed Ask click, observed access requirements, 404 admission after a failed source navigation, and recovery budgets                                                                                         |
| [browser tools](e2e/platform-browser.spec.ts)                   | Shared background browser identity, constrained actions, complete Grok replies with many inline citations, observed links, parallel connection pages, queued cancellation, maintenance barriers, shutdown draining, visibility changes, and retained sessions                                                                                                                                                |
| [model network](e2e/worker-network.spec.ts)                     | Main and worker GUI system proxy, explicit proxy precedence, and loopback routing                                                                                                                                                                    |
| [platform sessions](e2e/platform-session.spec.ts)               | Shared sessions, logout, and restart                                                                                                                                                                                                                 |
| [platform expansion](e2e/platform-expansion.spec.ts)            | Shared Gemini language setup, Reddit guest enablement, scheduled experts, Shadow DOM controls and complete Reddit answer bodies, partial-answer rejection, original citations, direct caption reading, and browser fallback                                                                                      |
| [Native Pi connections](e2e/pi-model-connections.spec.ts)       | Native catalog/auth UI, option propagation, frozen leases, restart, and inactive legacy settings                                                                                                                                                     |
| [Model settings](e2e/model-settings.spec.ts) | Direct connection/model selection, scoped checks, inactive edits, actions-menu keyboard behavior, and bilingual compact layouts |
| [Shared content capabilities](e2e/content-capabilities.spec.ts) | Tool-free Pi execution, bounded concurrency, cancellation, released model leases, and task traces                                                                                                                                                    |

## Service and contract scope

`tests/rules/schedules.test.ts` covers recurrence contracts, calendar anchors, month ends, daylight-saving transitions, fixed intervals, and legacy normalization. `tests/rules/search-follow-lifecycle.test.ts` covers exhausted rules, recipient changes, offline expiration, and clock rollback. `tests/rules/` also covers search/follow admission, expert cancellation, text fidelity, immutable results, upgrade retention, profiles, and prompt identity. Update-driver checks exercise Windows EXE selection and staged-file integrity, plus macOS native staging. Release checks exercise both platform feeds and reject incomplete or mixed package sets. The reading fixture can invoke internal recovery directly. That scope establishes saved-state behavior independently of available UI actions.

`tests/rules/reading-diagnostics.test.ts` covers bilingual model-output-limit feedback, typed causes, component readiness, access parameters, caption observations, HTTP 403, unknown errors, and legacy issue text. `tests/rules/reading-diagnostic-receipts.test.ts` covers durable task diagnostics and partial processing receipts with original content and completed translations.

`tests/rules/reading-diagnostic-provenance.test.ts` covers later translation and summary failures alongside earlier source issues, including retained original text and truncated output. `tests/rules/reading-source-diagnostics.test.ts` verifies source-scoped observations across redirect aliases, partial content, and uncaptured references.

`tests/rules/model-connections.test.ts` covers saved connection activation, independent editor catalogs, retained execution leases, failed writes, inactive credential replacement, reasoning compatibility, and late check completion after an active configuration change.

[Speech processing](../docs/speech-processing.md#verification-scope) owns local audio rule checks and native runtime verification, including the bounded Windows speech workflow and its public short-audio evidence.

[Product identity](e2e/product-identity.spec.ts) opens saved reading and its cached image across two launches, alongside retained connections and browser sessions.

`tests/rules/parallel-search.test.ts` covers four concurrent AI connections, serial language bridges, independent reading processing, topic admission order, partial failures, saved-answer retention, late progress after Stop, and worker cleanup before model-lease release. `tests/rules/browser-task-queue.test.ts` covers connection fairness, global maintenance barriers, queued cancellation, failure release, and shutdown draining.

## Commands and evidence

`tests/rules/translation-lifecycle.test.ts` covers shared question preparation across experts, topic-scoped reuse, the reported question-to-answer failure, cancellation and model-lease draining, saved preparation recovery, mixed-content reading preservation, Markdown separators, and retry of unfinished material chunks. The content-capabilities E2E checks the combined reading operation through the production worker and native Pi trace metadata. Live model trials assess semantic fidelity separately from controlled responses.

| Command              | Result                                    |
| -------------------- | ----------------------------------------- |
| `npm run check`      | Types, document references, and rules     |
| `npm run docs:check` | Markdown paths, anchors, and npm commands |
| `npm run test:rules` | Rule/service checks                       |
| `npm run test:e2e`   | App and fixture builds, then Playwright   |
| `npm run test:smoke` | App and fixture builds, then the tagged core application cases |
| `npm run check:full` | Shared checks and application E2E         |

[Playwright configuration](../playwright.config.ts) owns evidence settings. Screenshots, attachments, and retained failure traces enter `test-results/`; the report enters `playwright-report/`. Tests record fixture and build scope. Live trials establish actual platform login, current page behavior, retrieval quality, and usefulness. Desktop acceptance checks the real export chooser and exported pages.

The `@smoke` cases reuse the application tests for startup, browser-visibility settings across restart, saved language across system-language changes, and reading jobs with controlled source/model responses. `test:smoke` selects these cases with project dependencies disabled. The full suite also runs these cases.

The [Checks workflow](../.github/workflows/checks.yml) selects verification by event:

| Event | Verification |
| --- | --- |
| PR targeting `dev`, push to `dev` or `main` | Linux shared checks and macOS smoke cases |
| PR targeting `main`, manual Checks run | Linux shared checks, full macOS and Windows E2E, and Windows package/installation verification |

Windows application and package checks use separate jobs and evidence artifacts, so a failed stage can be rerun independently. The always-running `CI gate` requires each selected job to succeed and verifies that omitted Windows jobs match the quick scope. Failed, cancelled, missing, and unexpectedly skipped jobs fail the gate. [Contribution workflow](../docs/contributing.md) owns branch and merge rules. [Release](../.github/workflows/release.yml) owns both platform packages, signing, and native upgrade verification.

## Native update acceptance

[Failure cases](update-failures.md) define the shared update acceptance boundary. The controlled Electron fixture replaces update transport and native staging while retaining production UI, IPC, queue admission, and stores. The [macOS verifier](../scripts/development/verify-upgrade.mjs) proves native replacement, restart, compatible project signatures, and retained data with two real packages on separate build and verification runners. The [Windows verifier](../scripts/development/verify-windows-upgrade.mjs) installs a baseline and downloads its replacement through the production updater and NSIS. [Windows acceptance cases](windows-release-failures.md) define installation and data-retention checks. Release workflow runs upload each platform's evidence. The [release guide](../docs/releasing.md#signing-and-assets) owns signing and artifact setup.

## Packaged startup acceptance

The release package smoke check covers these failure cases:

- Missing ASAR resources, worker entries, icon, update configuration, or bundled Xiaohongshu reader stops verification before upload.
- A package version or source revision that differs from the workflow checkout fails the build identity check.
- Startup, preload, renderer, or page navigation failures produce a failed result and an available screenshot.
- A disabled packaged updater or an incorrect default browser mode fails the Settings check.
- A language change or scheduled message lost after restart fails the profile persistence check.

The check launches each platform's packaged executable twice with a fresh local profile and saves screenshots and a JSON result. Signing and native upgrade have their own checks. Live platform retrieval and the downloaded installer's first-open approval belong to [release acceptance](../docs/releasing.md#acceptance-and-publication).

`tests/rules/video-contracts.test.ts` covers generic video identity, part-specific timestamps, legacy YouTube evidence, application-ASR provenance, attempt publication, and connection-file exclusion. `tests/rules/bilibili-transcript.test.ts` covers native SRT, BV/av aliases, part/CID verification, explicit subtitle extraction, caption-access states, session fallback, cancellation, and scoped requests. The platform-expansion E2E exercises observed-URL admission and Bilibili caption material through the real Agent worker; the platform-session E2E exercises Bilibili login and scoped logout with controlled pages. Live subtitle availability and account access have separate acceptance evidence.
