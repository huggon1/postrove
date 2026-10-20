# Renderer

[Product specification](../../docs/product-spec.md) owns page behavior. The workspace follows the approved topic prototype.

| Path                                                                            | Responsibility                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `App.tsx`                                                                       | Top navigation, page assembly, selected records, deletion/undo                                         |
| `workspace/Topics.tsx`                                                          | Composer, topic cards, replies, source actions, member receipts                                        |
| `workspace/Members.tsx`                                                         | Shared platform connections and language experts                                                       |
| `workspace/Reading.tsx`                                                         | HTTPS intake, library, material reader and reading status                                              |
| `workspace/Schedules.tsx`                                                       | Scheduled messages and editor                                                                          |
| `workspace/ScheduleFields.tsx`                                                  | Repeat-rule draft, controls, localized summary, and occurrence preview                                 |
| `workspace/Settings.tsx`                                                        | Settings categories and preferences                                                                    |
| `workspace/use-workspace.ts`                                                    | Snapshot refresh, operation/error state                                                                |
| `workspace/ui.tsx`                                                              | Avatars, accessible modal with nested focus/scroll restoration, icon controls and saved-time rendering |
| `workspace/forms.tsx`                                                           | Section headings, setup steps, masked credentials, inline feedback and confirmations                   |
| `workspace/use-platform-status.ts`                                              | Shared platform connection status for settings and members                                             |
| `workspace/workspace.css`, `workspace/settings.css`, `workspace/production.css` | Approved visual system and production control styles                                                   |
| `components/ModelSettings.tsx`                                                  | Staged native Pi connection/auth/model editor                                                          |
| `components/TelegramSettings.tsx`, `components/FeishuSettings.tsx`              | Bot onboarding and management                                                                          |
| `components/BotConnection.tsx`                                                  | Connection cards, setup dialog shell, verified identity and chat authorization rows                    |
| `components/Primitives.tsx`                                                     | Sanitized Markdown and diagrams                                                                        |
| `components/ApplicationUpdates.tsx`                                             | Update notices, confirmation and About controls                                                        |
| `bridge.ts`, `product-ui.ts`, `i18n/`                                           | Desktop API, saved-view mapping and translations                                                       |
