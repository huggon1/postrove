# Releasing Postrove

This document owns release preparation and publication. The [development guide](development.md) owns source launch and local packaging; [tests](../tests/README.md) owns automated acceptance scope.

## Prepare a release

1. Finish the release PRs and review both READMEs and `docs/releases/<version>.md`. Set the same stable version in package.json and package-lock.json.
2. Merge the reviewed changes into main and confirm its Checks workflow passes.
3. Run the [Release workflow](../.github/workflows/release.yml) manually on that revision. Native macOS and Windows runners build both installation packages, verify packaged startup and persistence, and exercise application replacement and restart through each platform's updater.
4. Record the source revision, workflow runs, package identity, screenshots, live trials, and remaining acceptance items in a local release evidence directory.
5. Obtain publication approval from the release owner, then tag the approved main revision as `v<version>` and push the tag. The tag run creates a GitHub Release draft with reviewed notes and verified attachments.

Upgrade verification builds the current package version and a verification version with the next patch number. The macOS workflow also verifies the latest published version against the candidate when their versions differ. Draft creation waits for both upgrade checks and both platform packages. These pairs stay in Actions artifacts. Manual runs produce evidence; tag runs repeat native verification and create one Release draft containing both platforms.

## Signing and assets

macOS packages use the fixed project certificate in the `release-signing` environment. `MAC_CSC_LINK` holds the base64 P12, `MAC_CSC_KEY_PASSWORD` unlocks it, and `MAC_CERT_SHA256` identifies the expected certificate. Later releases retain the same certificate and private key so native updates satisfy the installed application's signing requirement. This is a project signature, separate from Apple Developer ID and notarization.

Windows x64 packages use a per-user NSIS installer with a selectable installation directory. Windows installers are currently unsigned. The updater retains electron-updater's digest validation and publisher verification when a signing identity is configured. macOS retains its native signature validation.

Both platforms share one stable version and one GitHub Release:

| Platform            | Initial installation | Application updates      |
| ------------------- | -------------------- | ------------------------ |
| macOS Apple silicon | Versioned DMG        | ZIP and `latest-mac.yml` |
| Windows x64         | Versioned EXE        | EXE and `latest.yml`     |

Release attachments also include generated blockmaps, `signing-requirement.txt`, per-platform build manifests, a combined `build-manifest.json`, and `SHA256SUMS.txt`. The draft job checks each platform's required files, version, committed revision, and hashes before combining assets. Missing packages, mixed revisions, duplicate filenames, or altered bytes fail draft creation.

Manual runs can reuse the macOS signed pair through `package_run_id` after source validation confirms matching production inputs. Application code, dependencies, assets, and packaging changes select a fresh pair. The separate macOS verification runner uses a clean signing environment. Windows builds a fresh NSIS pair and tests the installed production updater against a loopback feed. Both verifiers record replacement, restart, retained records, and a session-directory marker; actual website login belongs to live acceptance.

## Acceptance and publication

Download the draft's DMG from GitHub on a macOS Apple silicon machine. Move Postrove to Applications, then verify first launch and the system's first-open approval path. A project-signed build may require approval in System Settings → Privacy & Security → Open Anyway. [Apple's guide](https://support.apple.com/en-us/102445) describes that approval and its security implications.

Download the same draft's EXE on Windows x64. Check installation, first launch, final-window close, restart, and saved settings. The automated [Windows acceptance cases](../tests/windows-release-failures.md) cover Unicode paths, reinstall, uninstall, and native updates. Record the downloaded package's system approval path separately.

Connect a model and sign in to the platforms used for acceptance. Exercise X Grok and Xiaohongshu 点点 AI search, read original answers and source links, add a source to parsing, and parse a GitHub README. Record source coverage, a partial or access-limited outcome, and native Pi log export. Restart and check saved reports and sessions. [Product behavior](product-spec.md) defines expected results.

Review the draft's version, notes, artifacts, checksums, and acceptance record. Release owner approval allows publishing the draft as a stable latest Release. Installed clients discover it through the public GitHub source. A failed package check retains the draft and its diagnostic evidence for correction. Published artifacts identify one immutable version; a correction uses a new version.

The 0.1.0 migration behavior is described in its [release notes](releases/0.1.0.md). Ongoing update choices belong to the [product specification](product-spec.md#application-updates).
