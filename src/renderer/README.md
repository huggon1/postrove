# Renderer

[Product specification](../../docs/product-spec.md) owns page behavior. The workspace follows the approved topic prototype.

| Path | Responsibility |
| --- | --- |
| `App.tsx` | Top navigation, page assembly, selected records, deletion/undo |
| `workspace/Topics.tsx` | Composer, topic cards, replies, source actions, member receipts |
| `workspace/Members.tsx` | Shared platform connections and language experts |
| `workspace/Reading.tsx` | HTTPS intake, library, material reader and reading status |
| `workspace/Schedules.tsx` | Scheduled messages and editor |
| `workspace/Settings.tsx` | Settings categories and preferences |
| `workspace/use-workspace.ts` | Snapshot refresh, operation/error state |
| `workspace/ui.tsx` | Avatars, accessible modal, icon controls and saved-time rendering |
| `workspace/workspace.css`, `workspace/settings.css`, `workspace/production.css` | Approved visual system and production control styles |
| `components/ModelSettings.tsx` | Staged native Pi connection/auth/model editor |
| `components/TelegramSettings.tsx`, `components/FeishuSettings.tsx` | Bot onboarding and management |
| `components/Primitives.tsx` | Sanitized Markdown, diagrams and setup dialogs |
| `components/ApplicationUpdates.tsx` | Update notices, confirmation and About controls |
| `bridge.ts`, `product-ui.ts`, `i18n/` | Desktop API, saved-view mapping and translations |
