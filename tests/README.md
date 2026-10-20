# Application verification

[Product specification](../docs/product-spec.md) owns expected behavior. [Development](../docs/development.md) owns local launch and live-source preparation. Run artifacts record observed pass or failure.

## E2E scope

Fixtures use isolated profiles and controlled external responses.

| Test                                                            | Scope                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [application updates](e2e/application-updates.spec.ts)          | Version visibility, download cancellation, installation errors, shared queue hold, and queued search restart                                                                                                                                         |
| [application](e2e/application.spec.ts)                          | Startup, saved language, profile copy, and Telegram preparation                                                                                                                                                                                      |
| [application language](e2e/application-language.spec.ts) | System-language defaults, native menu language, saved initial selection, and manual language persistence |
| [Windows lifecycle](e2e/windows-lifecycle.spec.ts)              | Native minimize, final-window close, clean exit, and retained language and schedules after restart                                                                                                                                                   |
| [topic workspace](e2e/topic-workspace.spec.ts)                  | Shared language experts, independent replies, partial receipts, source collection, reading, schedules, files, responsive layout, and restart                                                                                                         |
| [Feishu bots](e2e/feishu-bot.spec.ts)                           | Setup, registration cancellation, concurrent receipt deduplication, SDK reconnection, history pagination, submission replay, authorization revocation, pending acknowledgement recovery, account isolation, paused review startup, and drawer layout |
| [Telegram setup](e2e/telegram-setup.spec.ts)                    | Connection card, verification recovery, chat authorization, restart, and setup layout                                                                                                                                                                |
| [Settings layout](e2e/settings-layout.spec.ts)                  | Title/action hierarchy, direct onboarding, secret visibility, local validation, exclusive model connection methods with retained drafts, nested member management, link intake, and English forms at narrow widths                                   |
| [record deletion](e2e/record-deletion.spec.ts)                  | Independent visibility, timed undo, candidate re-addition, and restart                                                                                                                                                                               |
| [reading](e2e/reading.spec.ts)                                  | Materials, frozen language, partial output, and restart                                                                                                                                                                                              |
| [reading fidelity](e2e/reading-fidelity.spec.ts)                | Code and link preservation                                                                                                                                                                                                                           |
| [reading recovery](e2e/reading-recovery.spec.ts)                | Transport recovery, failed-task preservation, cancellation, and native logs                                                                                                                                                                          |
| [material collection](e2e/material-collection.spec.ts)          | References, frame recovery after a transient click failure, provenance, and source structure                                                                                                                                                         |
| [browser Agent](e2e/browser-agent.spec.ts)                      | Capture identity, reply capture after a failed Ask click, observed access requirements, 404 admission after a failed source navigation, and recovery budgets                                                                                         |
| [browser tools](e2e/platform-browser.spec.ts)                   | Constrained actions, observed links, visibility changes, and retained sessions                                                                                                                                                                       |
| [model network](e2e/worker-network.spec.ts)                     | Main and worker GUI system proxy, explicit proxy precedence, and loopback routing                                                                                                                                                                    |
| [platform sessions](e2e/platform-session.spec.ts)               | Shared sessions, logout, and restart                                                                                                                                                                                                                 |
| [platform expansion](e2e/platform-expansion.spec.ts)            | Shared Gemini language setup, Reddit guest enablement, scheduled experts, Shadow DOM controls, original citations, direct caption reading, and browser fallback                                                                                      |
| [Native Pi connections](e2e/pi-model-connections.spec.ts)       | Native catalog/auth UI, option propagation, frozen leases, restart, and inactive legacy settings                                                                                                                                                     |
| [Shared content capabilities](e2e/content-capabilities.spec.ts) | Tool-free Pi execution, bounded concurrency, cancellation, released model leases, and task traces                                                                                                                                                    |

## Service and contract scope

`tests/rules/` covers search/follow admission, expert cancellation, text fidelity, immutable results, upgrade retention, profiles, and prompt identity. Update-driver checks exercise Windows EXE selection and staged-file integrity, plus macOS native staging. Release checks exercise both platform feeds and reject incomplete or mixed package sets. The reading fixture can invoke internal recovery directly. That scope establishes saved-state behavior independently of available UI actions.

## Commands and evidence

| Command              | Result                                    |
| -------------------- | ----------------------------------------- |
| `npm run check`      | Types, document references, and rules     |
| `npm run docs:check` | Markdown paths, anchors, and npm commands |
| `npm run test:rules` | Rule/service checks                       |
| `npm run test:e2e`   | App and fixture builds, then Playwright   |
| `npm run check:full` | Shared checks and application E2E         |

[Playwright configuration](../playwright.config.ts) owns evidence settings. Screenshots, attachments, and retained failure traces enter `test-results/`; the report enters `playwright-report/`. Tests record fixture and build scope. Live trials establish actual platform login, current page behavior, retrieval quality, and usefulness. Desktop acceptance checks the real export chooser and exported pages.

The [Checks workflow](../.github/workflows/checks.yml) runs shared checks on Linux and application E2E on macOS and Windows. Windows also verifies its NSIS package and installation lifecycle. [Release](../.github/workflows/release.yml) owns both platform packages, signing, and native upgrade verification.

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
