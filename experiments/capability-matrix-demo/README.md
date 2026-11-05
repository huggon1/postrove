# Capability review demo

Run from this directory with Node.js:

```sh
node serve.mjs --port 4391
```

Open `http://127.0.0.1:4391`. The loopback server accepts a configurable port. `/health` reports readiness.

The main table lists platforms and configured capability groups. Platform details combine capabilities with the same required configuration. Additional configuration, scope, and trial controls use collapsed sections.

Presets cover first use, basic setup, partial sign-in, complete setup, expired sessions, and missing components. Current-version mode shows existing capabilities. The video-extension toggle adds proposed video and speech paths.

All configuration, accounts, source results, and inbox actions use browser-local fixtures. State persists in local storage. Reset loads the basic preset. The interface uses Simplified Chinese.

Open `/#speech` for the speech-installation proposal. One action prepares the component and pinned model. The installer shows progress, verification, cancellation, failure, retry, and readiness. The review controls select a successful download, interrupted download, or failed checksum. Platform setup opens the same installer and updates both resource requirements. This flow uses timers and saved fixture flags.
