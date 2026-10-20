# Main process

[Architecture](../../docs/architecture-overview.md) owns runtime boundaries; [data contracts](../../docs/data-contracts.md) owns persistence.

| Path                                                                                                  | Responsibility                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `services.ts`, `main.ts`, `window.ts`, `preload.ts`                                                   | Service assembly, lifecycle, windows, and renderer bridge                |
| `services/focus-search/`                                                                              | Search admission, follow scheduler, and candidate submission             |
| `services/forwarding/`                                                                                | Collection orchestration and reading queue                               |
| `services/tasks/`                                                                                     | Task snapshots and native Pi export                                      |
| `services/platform-access.ts`                                                                         | Capture and material validation                                          |
| `services/browser-agent.ts`                                                                           | Browser and skill tool bridge                                            |
| `services/platform-browser.ts`                                                                        | Shared Chrome operations and access lock                                 |
| `integrations/bots/`, `integrations/feishu/`                                                          | Shared inbox and lifecycle, adapter registry, and Feishu transport       |
| `integrations/telegram/`                                                                              | Authorization, receipts, and acknowledgments                             |
| `services/application-updates.ts`, `services/electron-update-driver.ts`, `services/execution-gate.ts` | Update state, native validation, and execution admission                 |
| `services/model-service.ts`                                                                           | Native Pi connections, authentication interactions, and execution leases |
| `runtime/profile.ts`                                                                                  | Validated profile preparation and upgrade retention                      |
| `storage/`                                                                                            | Atomic local stores                                                      |

`services/content-service.ts` runs bounded shared text capabilities. `services/result-publisher.ts` publishes immutable terminal Markdown packages. `storage/advisor-store.ts` saves enabled language experts.
