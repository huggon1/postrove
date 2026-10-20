# Postrove promotional film

This separate authoring package creates a 48-second Postrove film in Simplified Chinese and English. Each version renders at 1920 × 1080 and 60 fps.

The opening introduces Postrove as a tool for finding content through platform AIs. One fictional example then drives the story: “I want to make a pixel game with AI. Where do I start?” The example uses X/Grok, Xiaohongshu/Diandian, Gemini/YouTube, and Reddit/Ask. Platform content appears before each answer and its source links. A YouTube tutorial then enters the reading library. The Chinese edition shows the original text and Chinese translation; the English edition shows the original and reading versions. The final scene names cross-platform questions and reading. Gemini/YouTube and Reddit/Ask retain their Preview status from the root README.

## Render

Run these commands on an Apple Silicon Mac from the repository root:

```sh
cd scripts/promo-video
npm ci
node audio.mjs
node narration.mjs
node render.mjs
node render.mjs --english
```

The root [English README](../../README.md) and [Chinese README](../../README.zh-CN.md) each begin with their corresponding film, hosted as a GitHub video attachment.

Generate review frames separately:

```sh
node render.mjs --stills
node render.mjs --stills --english
```

The renderer uses installed macOS Google Chrome by default. Set `POSTROVE_RENDER_CHROME` to select another Chrome executable. Rendering uses a single browser tab for the visual track, then combines that track with the selected narration and music mix.

## Audio

```sh
node audio.mjs
node narration.mjs
```

The score uses deterministic tonal synthesis at 48 kHz in stereo: sustained chords, keyboard notes, bass, and sine-based kicks. Fixed mastering gain preserves the arrangement's levels. Neural narration uses Chinese Yunxi and English Guy voices at a fixed synthesis rate. Cached sources play at 1× speed. Six source MP3 files and the actual cue times remain in `voice-assets/`; the mixer uses those cached sources for offline regeneration. Missing or changed source files trigger bounded requests through `uvx` and pinned `edge-tts` 7.3.1. Music stays below its source level between spoken passages and drops further during speech. The mixer restores the background level gradually after each cue. Mix reports record duration, sample rate, RMS, and peak levels.

## Application captures

[Demo assets](demo-assets/) contain bilingual captures of the real Electron interface with isolated fictional records. [capture-demo.mjs](capture-demo.mjs) rebuilds the interface into a local temporary runtime, validates saved fixtures, and captures the topic, sources, reading version, original version, and reading code. The capture tool finds installed application dependencies from this checkout or the primary Git checkout. Network requests stay blocked during capture.

The same named YouTube tutorial and game illustration appear in discovery, source collection, and reading. Placeholder source addresses belong to the fictional demo records. Captures preserve actual product labels and controls.

Both language editions use an English tutorial as the original source. The Chinese edition opens its translated Chinese reading version. The English edition keeps its post titles, source text, and reading text in English. Capture checks inspect every English scene for Chinese text and record the real Chinese expert's identity marks separately.

## Verify

```sh
node verify.mjs
node verify.mjs --english
```

Verification checks dimensions, frame rate, all 2,880 frames, stereo AAC audio, the 48-second duration, narration cue bounds, and complete media decoding. Reports record the selected mix's RMS and peak levels.

Generated deliverables stay in the ignored `output/` directory:

- `postrove-zh-CN-1080p.mp4` and `postrove-en-1080p.mp4`
- `soundtrack.wav`, `narration-*.wav`, and `mix-*.wav`
- `stills-v4-zh-CN/` and `stills-v4-en/` review frames
- `render-*.json`, `verification-*.json`, and audio verification reports

## Copy and review evidence

[Film.tsx](src/Film.tsx) owns animation, timing, and bilingual captions. [prepare.mjs](prepare.mjs) copies artwork, game-demo captures, and audio into the local render assets. [audio.mjs](audio.mjs) owns the original procedural score; [narration.mjs](narration.mjs) owns timed speech and music mixing.

The user's approved revision covers the content-search opening, the game example, platform AI routes selected for this example, English material in the English edition, source links, translated reading, short narration with subtitles, and the “Ask across platforms. Save and read.” finish. Functional headings state the action or displayed result: asking, searching, viewing replies and sources, saving, and reading. The reading narration names the original text and Chinese translation in Chinese; English narration names the original and reading versions. Example labels scope the visible platform routes to this film's scenario. Product labels reuse existing interface copy. The Preview labels reflect the current root README platform table. The user approved placing each film at the start of its corresponding root README.

Key-frame review covers both languages, readable text, source identity, original/reading transitions, platform status, and the approved functional copy. Audio review compares the reported 20-second, transition, and later passages against V3, checks the reduced high-frequency content, and measures cue boundaries and music recovery. Playback review covers the final encoded MP4 files in both languages. README review checks each language attachment and its inline player. Review artifacts belong to this video task and can be regenerated after each film edit.
