# Development guide

Commands run from the repository root with Node.js 24 or later and npm.

## Run the application from source

```sh
npm ci
npm run dev
```

`dev` builds `dist/` and launches Electron. Quit and rerun after source changes. The default launch uses regular application data. The topic upgrade preserves business records, connections, platform sessions, and results through the [retention contract](data-contracts.md#telegram-queue-and-upgrade-retention).

## Try changes with separate data

```sh
POSTROVE_TEST_DATA="$PWD/tmp/dev-profile" npm run dev
```

The selected directory retains its records across launches. A separate path defaults to review mode, with bot receiving paused during preparation. Saving bot credentials starts the selected receiver for that instance.

In Windows PowerShell, set the same profile with `$env:POSTROVE_TEST_DATA = "$PWD/tmp/dev-profile"` before running `npm run dev`.

## Work with platform content

Install Google Chrome and configure the platform connection in Members. Shared Chrome retains site sessions under the selected profile. Reddit supports guest use. `npm run setup:xhs` prepares the optional Xiaohongshu note reader. `npm run setup:youtube` downloads and verifies pinned yt-dlp and Deno for original YouTube captions; browser capture supplies fallback. `npm run prepare:runtime` prepares both packaged readers.

## Check types or build output

`npm run typecheck` reports TypeScript diagnostics. `npm run build` rebuilds Electron, workers, and the renderer. The [test guide](../tests/README.md) owns the verification commands and evidence scope.

## Preview the homepage

`npm run homepage:dev` serves the [homepage](../website/index.html) at `http://127.0.0.1:4317`. Add `-- --port 4320` to select another port. The preview serves files from `website/` and artwork from `assets/`.

`npm run homepage:build` copies the page and its artwork into `dist/homepage/`. Preview that output with `npm run homepage:dev -- --dir dist/homepage`.

The homepage presents platform AI, multilingual members, source collection, forwarded posts, reading enhancements, and local material in that order. A final architecture section presents Pi, model access, browser and content agents, and local storage. The reading section shows summaries for collected material, automatic translation, and structured text; it also states that AI replies support translation. `website/content.js` owns their bilingual copy and illustrated sample content. `website/videos.js` selects the public introductory films; `website/media/` contains their posters and timed captions. The language control switches the copy, film, illustrations, and application screenshots. English is the initial language; `?lang=zh-CN` opens Chinese directly.

Open `/cards.html` for the eight portrait feature cards and PNG downloads. The cards share the homepage's content and artwork, with portrait layouts in `website/cards.css`. `/cards.html?id=translate&lang=zh-CN` opens one fixed 1080 × 1440 composition. After changing shared artwork or copy, render each card in both languages, capture the complete composition at 1080 × 1440 pixels, and replace the PNGs and ZIP archives in `website/exports/`. Check every card for text clipping, artwork overlap, and readable type at phone width.

The [Homepage workflow](../.github/workflows/pages.yml) builds the static homepage on related pull requests. Updates to homepage files on `main`, or a manual workflow run on `main`, publish that artifact to [GitHub Pages](https://huggon1.github.io/postrove/). The build uses Node.js built-ins. The [screenshot guide](../assets/screenshots/README.md) owns the shared promotional captures.

## Create an installation package

```sh
npm run prepare:runtime
npm run package:app
```

Run `npm run package:app` on macOS Apple silicon or `npm run package:windows` on Windows x64. Packaging clears generated `release/` output and rebuilds the app and icon. macOS produces DMG, ZIP, and `latest-mac.yml`; Windows produces a per-user NSIS EXE and `latest.yml`. Both commands write blockmaps, SHA-256 checksums, and a build manifest after checking the update feed's package digest. The cleanup also retires the obsolete bird-search runtime.

## Application artwork

[`assets/postrove-icon.svg`](../assets/postrove-icon.svg) supplies the README, window, Dock, favicon, and package icon. [`assets/postrove-mark.svg`](../assets/postrove-mark.svg) supplies the compact workspace mark. `npm run build` copies both SVGs and renders `dist/assets/postrove.png`; `npm run build:icon` renders `build/postrove.ico` and, on macOS, `build/postrove.icns` from the same artwork.

## Prepare a review profile

```sh
npm run review -- --profile /absolute/path/to/review-data
npm run review -- --profile /absolute/path/to/new-review-data --from /absolute/path/to/source-data
```

Copy preparation requires an inactive source and preserves current-generation records. `--include-auth` includes supported credentials, including the native Pi connection directory and its model catalogs. Review startup keeps bot receiving paused until the selected connection is configured or verified in that instance. The launcher displays build and profile identity.

## Verify the topic workspace

Use a review profile with the intended model and platform sessions. Enable language experts, send a topic, read independent replies and member receipts, save a scheduled message, collect sources into Reading, stop an active member, and export its Pi logs. Check partial-platform results and English output. Record inputs, screenshots, saved state, and observed failures in a local acceptance directory. [Product behavior](product-spec.md) defines expected outcomes.

## README screenshots

The [screenshot guide](../assets/screenshots/README.md) owns the current scenes and sample-data scope. Capture both interface languages from the running topic workspace with separate profiles and fictional records.

## Verify reading with live sources

Submit a public source link in Reading. Inspect source coverage, translated body, introduction, and direct references. The [reading helper](../scripts/development/verify-reading.ts) submits through Electron IPC and exports saved material:

```sh
npm run build
npx tsx scripts/development/verify-reading.ts --profile /absolute/path/to/review-data --output /absolute/path/to/reading-evidence
```

The helper's `--help` lists sample selection. `--retry-existing` exercises the retained internal recovery API; user-facing flows expose retry and Stop in reading status.

## Release preparation

After local packaging, `npm run test:package` launches the native packaged executable with separate data, checks startup, enabled updates, and retained language and schedules after restart. It saves evidence under `.tmp/package-verification/`. Options `--app`, `--profile`, and `--output` select the installation, retained test data, and evidence paths.

On Windows, `npm run test:windows-installation` exercises installation, reinstallation, and uninstallation in a Unicode path. `npm run test:windows-upgrade` builds two versions, installs the baseline, and uses the production updater to download, replace, and restart the application. Evidence enters `.tmp/windows-installation/` and `.tmp/windows-upgrade/evidence/`.

The [release guide](releasing.md) owns approval, signing, assets, and GitHub publication. On macOS, its workflow uses `npm run prepare:upgrade` to build a signed pair and `npm run test:upgrade` to verify native replacement and restart on a separate runner. Evidence enters `.tmp/signed-upgrade/evidence/` and workflow artifacts.
