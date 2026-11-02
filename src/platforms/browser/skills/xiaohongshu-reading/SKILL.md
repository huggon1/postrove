---
name: xiaohongshu-reading
description: Read a supplied Xiaohongshu note, including its image carousel or spoken video content.
---

# Read a Xiaohongshu note

1. Open the supplied note or share link. Follow its browser redirect and retain the full observed note address with its access parameters. Wait and inspect a fresh snapshot while its container loads. A `sourceError` preserves the platform's source rejection, including `300031` when the note is currently unavailable. Return that observed failure after bounded recovery; it leaves the source stage incomplete.
2. Once the note loads, take a fresh snapshot and select the note's own content container. Capture its title, body, and ordered image carousel. A `source_scope` response requires a fresh snapshot and a reference inside that note.
3. For an image/text note, `read_xiaohongshu` can retrieve the same successfully observed note through the installed enhancement. Its result includes a capture identity. Browser capture remains available when enhancement retrieval fails.
4. For a video note, call `read_video_transcript` with the full observed note address when that tool is available. It captures metadata and uses application speech recognition for accessible media. Retain its capture identity and actual speech coverage. A metadata-only or zero-segment result keeps the captured title, written description, and cover as partial material. Preserve its specific access, media, runtime, or speech failure.
5. Return actual text, image, and speech coverage. Page text and a cover establish partial video coverage. Application speech recognition establishes spoken-content coverage; visual coverage follows the returned evidence.
