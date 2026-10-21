# Postrove promotional film

This authoring package creates a 58-second Postrove film in Simplified Chinese and English. Each version renders at 1920 × 1080 and 60 fps. [story.json](story.json) owns the scene boundaries, duration, frame rate, and bilingual narration.

A three-second title card introduces Postrove and its purpose before the first problem. The film then follows two research problems: repeated manual searches across apps and social posts that AI web search can miss. Concrete examples of Grok searching X and Diandian searching RedNote explain why someone would ask these advisors together. Postrove then sends one question to selected advisors and shows their independent replies and source links. A pixel-game question appears as an example inside this workflow.

The second story starts with long posts saved across separate bookmarks. Forwarding to a configured Feishu or Telegram bot brings the same material into Reading. The film ends with Postrove's summaries, article text, original-source access, and saved materials that the user's own agent can read.

Phone bookmark actions stay inside the source application. Sending, bot acknowledgement, and the matching library record mark the forwarding sequence. Repeated covers and titles retain source identity. Procedural device scenes use perspective, lighting, and a stable desk; readable screens face the camera.

## Build and render

Run these commands on an Apple Silicon Mac from the repository root:

```sh
cd scripts/promo-video
npm ci
node capture-demo.mjs
node audio.mjs
node narration.mjs
node render.mjs
node render.mjs --english
```

The capture command uses application dependencies from this checkout or the primary Git checkout. `POSTROVE_CAPTURE_NODE_MODULES` selects another application dependency directory. The renderer uses installed macOS Google Chrome; `POSTROVE_RENDER_CHROME` selects another executable.

Generate review frames with:

```sh
node render.mjs --stills
node render.mjs --stills --english
```

Use `node render.mjs --draft --skip-stills` for a 960 × 540, 30 fps motion draft. Final renders retain 1920 × 1080 at 60 fps.

The renderer creates the visual track first, then combines it with the corresponding language mix. Rebuilding the score and narration before final rendering updates the audio and its timing manifest together.

## Application captures

[capture-demo.mjs](capture-demo.mjs) opens the current Electron interface with isolated, schema-validated fictional records. It captures the topic, replies and source links, reading list, original text, and reading version into [demo-assets](demo-assets/). Capture evidence records the application revision, image dimensions, and checks. The capture profile and its authored records belong to the film task.

[Film.tsx](src/Film.tsx) creates the phone scenes, repeated searches, animated messages, visible state changes, and camera movement with deterministic code. Those illustrated phone scenes explain the workflow. Current desktop-interface captures show the product itself. Distinct source colors and repeated titles connect the same material across discovery, forwarding, and reading. The records, replies, and source addresses are authored examples.

Both editions use their corresponding interface language. The English film and capture text use RedNote as the display name for Xiaohongshu; capture evidence records this presentation alias. Repeated titles and covers identify the forwarded article in Reading. Answer cards fade from the original replies into their reading-language text. The reader scene aligns both versions at the article cover, then reveals the translation across actual interface captures: the Chinese edition translates the English X article, and the English edition translates the Chinese Xiaohongshu article. The Original and Reading version controls show the selected state.

## Audio

[audio.mjs](audio.mjs) creates an original score at 48 kHz in stereo. Rounded keyboard plucks, soft tonal taps, bass, sustained harmony, and sine-based kicks follow the scene timing. The two stories share a four-chord motif, with lighter percussion during the unread-bookmarks and reading scenes. A final envelope brings the score to silence at the story boundary.

[narration.mjs](narration.mjs) synthesizes the eight narration cues in each language with pinned `edge-tts` 7.3.1 and caches the source MP3 files in [voice-assets](voice-assets/). Chinese uses Yunxi; English uses Guy. Synthesis uses the natural voice rate and playback stays at 1×. A cue can supply `spokenText` for pronunciation while `text` supplies its subtitle. Chinese AI cues join the acronym to its surrounding sentence in speech input. Localized `speechEdits` shorten the AI word spans with pitch-preserving processing and short audio crossfades. The rest of each sentence retains its natural pace. Each edit is tied to the cached source audio hash; changing that source requires a new timing review. The cache checks both forms before reusing a voice file. The mixer checks each spoken cue against its window in `story.json`. A cue that exceeds its window reports its duration so the wording or scene timing can be revised.

The narration timing manifest records the actual start and end of each spoken cue. Subtitles use this manifest. Music stays at a steady background level between phrases, drops smoothly under speech, and recovers over 0.8 seconds. Mix reports record duration, sample rate, RMS, and peak levels. Cached voices support offline regeneration of the final mixes.

## Verify

```sh
npm run typecheck
node verify.mjs
node verify.mjs --english
```

Verification derives duration, frame count, cue count, and cue boundaries from `story.json`. It checks H.264 video, stereo AAC audio, complete frame and audio decoding, and narration at 1× inside the declared windows. It also compares decoded MP4 audio with the current source mix, which catches a stale or mismatched audio track.

Review covers key frames in both languages, phone and desktop text at playback size, platform and source identity, narration pronunciation, subtitle placement, and the encoded MP4. Audio review includes the search sequence, each scene arrival, speech-to-music transitions, and the final fade. GitHub delivery review checks the inline README players and compares downloaded attachment hashes with the verified local files.

Generated deliverables stay in the ignored `output/` directory:

- `postrove-zh-CN-1080p.mp4` and `postrove-en-1080p.mp4`
- `soundtrack.wav`, `narration-*.wav`, and `mix-*.wav`
- Key-frame PNGs and rendering reports
- `verification-*.json`, narration timing, and audio reports

The root [English README](../../README.md) and [Chinese README](../../README.zh-CN.md) contain their corresponding GitHub video attachments. Animation source, fixtures, cached narration, and render scripts remain in this package for later revisions.
