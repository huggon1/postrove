# UI design

[Product specification](product-spec.md) owns page behavior. This document owns application layout and review evidence. [UI content admission](../AGENTS.md#ui-content-admission) owns copy approval. Reuse the renderer's shared controls, blue accents, spacing, and typography.

## Navigation and hierarchy

The top bar contains the Postrove mark, Topics, Reading, Scheduled sends, Members, and Settings. The page heading identifies the selected destination. Topic cards open a conversation; collected material opens its reader. Each region names the object it presents.

Settings uses a category rail and a content pane. Section headings and their primary actions share a row at desktop widths. Connection cards open focused setup dialogs. Model setup presents connection method, authentication, and model options as three steps. Member setup shares a platform connection across its language experts.

Each background-model card identifies its connection. The active card uses a blue In use indicator and contains the Current model selector followed by a blue primary Check connection button and its inline result. A successful check uses green feedback; cancellation uses neutral status text. Other cards expose Use this connection. The connection actions menu contains configuration editing and removal. At compact widths, the active indicator follows the connection name and check feedback wraps below its button.

The scheduled-message dialog uses two columns on desktop: message and recipients on the left, time and repeat controls on the right. Its large time fields support additional daily send times. Weekly day buttons expose their selected state and offer day-group presets. More settings expands the zone and date bounds. A live preview shows the next occurrences and input errors. Schedule cards show the rule, saved zone, next send or Ended state, and a pause switch.

## Interaction indicators

Each trailing indicator represents the control's actual result. Choose it from the interaction before styling the control.

| Interaction                                            | Presentation and state                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Select a page or settings category                     | The label, leading icon, and selected background identify the destination. `aria-current="page"` identifies the active item.                                                                           |
| Show or hide content in place                          | A caret follows the content's visibility. A custom disclosure exposes `aria-expanded`; its caret changes direction with that value. Native `details` and `summary` provide their own disclosure state. |
| Open an application detail, setup dialog, or next step | An optional right arrow points into the destination or step that the control opens.                                                                                                                    |
| Open a link or platform window outside the application | An optional up-right arrow accompanies the external-opening action.                                                                                                                                    |

The leading icon, label, and active styling form the complete indicator set for leaf page and category navigation. Disclosure carets belong to controls that show and hide content. When removing an indicator, retire its selectors at every breakpoint so positional SVG rules continue to style the intended icon.

Update availability, installation preparation, and success share the floating card layout. Installation preparation shows a blue rotating restart icon, its status title, and the existing restart message. Reduced-motion preferences keep that icon still. Compact windows place the cards above the bottom navigation.

## Adaptive layout

The topic feed and its supporting column share the desktop viewport. Compact widths place supporting content below the feed, move navigation to its compact position, and adapt settings categories and dialogs to the available width. Text, controls, and saved content remain within their scroll containers. The scheduled-message dialog stacks its columns below 660 pixels and scrolls inside its frame.

Shared form components own labels, input spacing, validation feedback, and dialog actions. A failed operation retains the active form and its entered values. Secret controls retain the value while switching its visibility.

A reading card's image fills and crops within its fixed-height cover. The cover and title each open their reading record through their own click target.

## Review evidence

For each added or expanded message, record its admission source and triggering state. Review the rendered interface and both interface languages.

For each interaction indicator, activate its control and compare the observed result with the table above. Check selected and unselected navigation, both disclosure states, internal destinations, and external-opening actions. Review desktop and compact widths in both languages, including the leading icons after a trailing indicator is removed.

The [workspace layout E2E](../tests/e2e/workspace-layout.spec.ts) checks page identity and overflow in both languages at desktop and compact widths. The [settings layout E2E](../tests/e2e/settings-layout.spec.ts) exercises setup, validation, member management, and model configuration through real controls. The [schedule E2E](../tests/e2e/schedules.spec.ts) exercises rich rules, previews, validation, pause, persistence, and both languages. It records copy admission sources and triggers. Tests save complete-window screenshots and layout measurements. The [test guide](../tests/README.md) owns broader verification scope.

### Capability and speech settings

Settings includes Capabilities and Speech to text. The capability table shows platform and current capability points. Selecting a platform opens its capability groups as rows with configuration-status buttons. Selecting a status opens a focused requirements dialog. Pending requirements appear before configured requirements; actions open their configuration destinations. Each dialog includes the shared background-model and Chrome requirements for that capability. Account-dependent capabilities appear as their own rows. Closing the requirements dialog restores focus to its status button.

Speech to text shows the bundled transcription component and the separate Whisper small model. Install starts preparation and model download. Download progress uses received bytes; verification uses an indeterminate indicator. Cancel stops an active installation. Retry starts another attempt after cancellation or failure. Installation continues while the user views another settings category.

| Added copy                                                                                              | Admission source and trigger                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Capabilities, platform names, current capability points, group names, and configuration requirements | User-approved platform matrix and the requested status-to-configuration flow; shown in the selected settings page, platform dialog, or requirements dialog.                    |
| Speech to text, Local transcription, component, model, and size labels                                  | Approved speech-installation demo; shown on the speech settings page.                                                                       |
| Configure, connect account, enable experts, install Chrome, update app, install, cancel, retry          | Required operation; each action opens its real configuration destination, performs its named operation, or recovers its missing dependency. |
| Configured, setup needed, loading, component/model readiness, download and verification states          | Required state feedback; displayed from the current Main-process configuration or installation snapshot.                                    |
| Component, download, checksum, timeout, and storage failures                                            | Required recovery feedback; displayed after the corresponding installation failure.                                                         |

The [capability settings E2E](../tests/e2e/capability-settings.spec.ts) opens real capability and speech IPC with a fresh profile. It records both languages at desktop and compact widths, checks the two-column matrix and focused requirements dialogs for all seven platform rows, plus account-dependent capabilities. It follows shared-model requirements to Background models and speech requirements to installation settings. Screenshots cover the matrix, platform dialog, requirements, and model-awaiting-download state. A controlled readiness snapshot exercises the fully configured status. The test checks viewport overflow, focus return, and renderer errors.
