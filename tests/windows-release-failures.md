# Windows release acceptance

Windows x64 and macOS Apple silicon use the same release version, GitHub Release, and application-update controls. Native runners verify each platform's installation path.

| Trigger                                                    | Required result                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build a Windows package                                    | NSIS includes application resources, the ICO, native readers and licenses, `app-update.yml`, `latest.yml`, and checksums.                                 |
| Install into a path with spaces and Chinese characters     | The current-user installation opens the workspace and exposes application updates.                                                                        |
| Change language and save a scheduled message, then restart | Language, scheduled message, and profile identity remain saved.                                                                                           |
| Minimize the window                                        | The application and admitted work remain active.                                                                                                          |
| Close the final Windows window                             | Main saves state, stops services, releases the profile, and exits.                                                                                        |
| Reinstall or uninstall                                     | Reinstallation reads retained records; uninstallation removes program files and retains the separate data profile.                                        |
| Request an update                                          | The installed app reads `latest.yml`, downloads the EXE, and checks its digest before installation.                                                       |
| Finish active work before installation                     | The staged EXE is checked again before the installer starts. A missing or altered file returns an installation failure.                                   |
| Complete an update                                         | NSIS replaces the installed application and opens the newer version with the same profile and saved records.                                              |
| Combine release assets                                     | Both platforms have the same version and committed revision. Missing packages, update feeds, conflicting filenames, or changed bytes fail draft creation. |

The native Windows verifier uses two packaged builds, a loopback update feed, production update services, and an isolated profile. A generated entry selects that profile across installer restarts. Live account acceptance records platform login, model authentication, and real retrieval separately.
