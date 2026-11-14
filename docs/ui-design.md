# UI design

[Product specification](product-spec.md) owns page behavior. This document owns application layout and review evidence. [UI content admission](../AGENTS.md#ui-content-admission) owns copy approval. Reuse the renderer's shared controls, blue accents, spacing, and typography.

## Navigation and hierarchy

The top bar contains the Postrove mark, Topics, Reading, Scheduled sends, Members, and Settings. The page heading identifies the selected destination. Topic cards open a conversation; collected material opens its reader. Each region names the object it presents.

Settings uses a category rail and a content pane. Section headings and their primary actions share a row at desktop widths. Connection cards open focused setup dialogs. Model setup presents connection method, authentication, and model options as three steps. Member setup shares a platform connection across its language experts. Settings member cards show the saved account name, an up-right home icon, and a circular-arrow refresh icon. Login completion saves the observed name; Refresh account name reads and saves a fresh observation. Refresh failure retains the prior name for the same session and shows inline feedback. These icon actions show their labels on pointer hover and keyboard focus. Connection detail shows the account name and available platform handle. The home action opens the same account's platform homepage in visible Chrome. The Bilibili account requirement includes its observed name and home icon.

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

At widths from 601 to 760 pixels, the top bar keeps the brand mark and the labeled navigation. Every navigation and settings control fits within the window, including the 640-pixel native minimum. Source summaries, timestamps, reading status, and schedule metadata use a 12-pixel minimum and the shared muted text color. Reading-card delete actions use a 34-pixel target; language and source actions use a 32-pixel minimum height.

Shared form components own labels, input spacing, validation feedback, and dialog actions. A failed operation retains the active form and its entered values. Secret controls retain the value while switching its visibility.

Menus dismiss on an outside pointer, Escape, or focus moving outside their region. Escape restores focus to the trigger. Menus choose the available space above or below their trigger and scroll internally; a trigger leaving the viewport dismisses its menu. A backdrop dismissal requires the pointer press and release to occur on the backdrop. Dialogs focus an explicit initial target, their first input, or Close in that order; confirmations choose Cancel. A pending form commit keeps its dialog open and displays a waiting indicator on the committing control.

The model-options form submits through Enter or Save. Invalid temperature, token count, and JSON inputs retain their values, expose linked field errors, and receive focus. Opening a saved model editor retains the connection's identity through reauthorization according to the [model selection contract](data-contracts.md#pi-model-connections).

Pending indicators and errors stay beside their operation's controls. Stop-and-delete and update-wait confirmations display their own errors. A failed pause or resume action keeps its retry beside the affected schedule. Account-status and speech-state read failures expose Reload in the corresponding settings region.

A reading card's image fills and crops within its fixed-height cover. The cover and title each open their reading record through their own click target.

The reader keeps its toolbar and material selector above the content scroll area. Long topic threads keep a horizontal member navigation below the dialog header. Source titles carry the external-opening indicator; collected material uses its separate Reading action. Individual and batch collection errors remain next to their triggering controls and scroll into view. Finished topic indicators match the recorded terminal outcome.

## Review evidence

For each added or expanded message, record its admission source and triggering state. Review the rendered interface and both interface languages.

For each interaction indicator, activate its control and compare the observed result with the table above. Check selected and unselected navigation, both disclosure states, internal destinations, and external-opening actions. Review desktop and compact widths in both languages, including the leading icons after a trailing indicator is removed.

The [workspace layout E2E](../tests/e2e/workspace-layout.spec.ts) checks page identity and overflow in both languages at desktop and compact widths. The [settings layout E2E](../tests/e2e/settings-layout.spec.ts) exercises setup, validation, member management, and model configuration through real controls. The [schedule E2E](../tests/e2e/schedules.spec.ts) exercises rich rules, previews, validation, pause, persistence, and both languages. It records copy admission sources and triggers. Tests save complete-window screenshots and layout measurements. The [test guide](../tests/README.md) owns broader verification scope.

The [layout clarity E2E](../tests/e2e/ui-layout-clarity.spec.ts) compares the home and schedule-card time in a saved zone that differs from the device zone, checks one presentation of a repeated name, and captures both languages at desktop and compact widths. The home zone reuses the saved schedule zone as required feedback for its next-send control.

The [operation feedback E2E](../tests/e2e/ui-operation-feedback.spec.ts) holds and fails controlled IPC responses through the production interface. It checks independent pending scopes, mutation retry, canceled-delete retry cleanup, errors in the active confirmation, account and speech read recovery, retained Bilibili identity, and disable-expert consequences in both interface languages.

The [overlay E2E](../tests/e2e/ui-overlays.spec.ts) checks bilingual draft retention, explicit cancellation, backdrop dragging, keyboard and outside dismissal, focus, menu bounds, offscreen triggers, field validation, and alternating new/saved model drafts. The [native Pi connection E2E](../tests/e2e/pi-model-connections.spec.ts) covers reauthorization of a saved connection. The numeric bound errors are required feedback on an attempted save of an out-of-range temperature or a non-integer or out-of-range token count. Choose recipients and Manage connection reuse their existing control labels.

The [reading navigation E2E](../tests/e2e/ui-reading-navigation.spec.ts) checks bilingual fixed controls, material/version positions, late image sizing, unique source selection, local collection errors, member jumps, matching terminal states, phase translations, retained search, draft replacement, atomic link submission, and independent action feedback. A material switch in the same event turn as scrolling verifies position retention while the browser scroll event is pending. Late image sizing uses a controlled dimension change, which exercises layout restoration independently of Chromium's decoded-image cache. Screenshots cover desktop and compact readers and the draft-replacement confirmation in both languages.

The [authentication pending E2E](../tests/e2e/ui-auth-pending.spec.ts) holds a native authentication response, checks locked input and dialog dismissal, and verifies that a failed submission retains its answer. Ask again stays disabled while the composer admits its current question.

| Added copy | Admission source and trigger |
| --- | --- |
| Clear search | Required control while the reading search contains a query. |
| Ask again; Member replies | Required topic recovery and reply-navigation controls. Ask again appears for partial, failed, or stopped topics; reply navigation appears for multiple members. |
| Replace current draft; Keep draft; Replace draft | Required choice when Ask again would replace a different unsent composer question. The confirmation previews the incoming question. |
| Translating materials; Generating summary | Translations of the existing saved processing-phase labels. |

| Added copy | Admission source and trigger |
| --- | --- |
| Reload | Required recovery control after an account, speech, or workspace snapshot read fails. |
| Affects {0} scheduled messages; {1} will be paused. | Required consequence feedback in the disable-expert confirmation when saved schedules include that expert. Counts come from the current saved schedules and enabled members. |

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

### Platform account review

| Added copy | Admission source and trigger |
| --- | --- |
| Observed account name and handle | Explicit user request to identify the configured account in connection settings. Shown after an authenticated self observation. |
| Open account home | Required operation for the home icon on a platform connection or Bilibili account requirement. |
| Refresh account name; Account name refresh failed. Try again. | Explicit user request for a manual account-name refresh icon and hover explanation; failure feedback follows a failed refresh. |
| Account name pending | Required state feedback on a connected member card or detail while self identity awaits observation. |

The [platform account E2E](../tests/e2e/platform-account.spec.ts) checks authenticated self controls, changed-session identity clearing, scoped sign-out, shared-profile home navigation, and credential exclusion from account metadata. Its application case renders Settings and connection detail in both languages at desktop and compact widths. Fictional account observations supply the layout evidence.

The [account home navigation E2E](../tests/e2e/platform-home-navigation.spec.ts) opens cold and headless-to-visible sessions with a committed homepage whose scripts are still loading. It verifies session retention, late account-name detection, and a failed document request.

The [account login E2E](../tests/e2e/platform-account-login.spec.ts) verifies one snapshot after login, static display during ordinary browser activity, and explicit refresh.

The reading result-path icon shows its existing action label on pointer hover and keyboard focus. The user explicitly requested this hover explanation. The [result-path E2E](../tests/e2e/reading-result-path.spec.ts) checks visible tooltip text and viewport bounds in both languages at desktop and compact widths.
