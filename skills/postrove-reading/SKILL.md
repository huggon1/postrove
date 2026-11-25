---
name: postrove-reading
description: Locate and read saved Postrove reading results on explicit user invocation.
disable-model-invocation: true
---

# Postrove Reading

Read the Postrove archive only when the user explicitly invokes `postrove-reading` for the current request or asks you to use this file to read their archive.

Postrove saves reading results for links added in the app or forwarded through Telegram or Feishu. Results can include summaries, captured or translated text, source links, and images.

Use the path the user provides, or look in the default reading folder for the platform.

- macOS `~/Library/Application Support/Postrove/profiles/default/results/reading/`
- Windows `%APPDATA%\Postrove\profiles\default\results\reading\`

Open `result.md` inside an attempt folder. For recent collections, use the collection timestamp near the top of `result.md`. Retries share the same `taskId` in `input.json`. The folder also retains historical packages for records removed from Reading.
