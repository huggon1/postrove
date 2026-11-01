---
name: bilibili-reading
description: Read Bilibili BV or av video pages, selected parts, native captions, timestamps, and creator materials.
---

1. Open the requested video URL and preserve its selected `p` value. Observe the page and its video address before reading captions.
2. Call `read_video_transcript` with that observed address when the tool is available. Retain the returned captureId, caption language, provenance, part/CID identity, and timestamps. Each attempt reuses its saved outcome.
3. Capture the title, creator, expanded description, and relevant creator links from their own observed containers. When the caption tool returns an unavailable state, inspect the page's subtitle/transcript controls and capture accessible text in source order. A `need_login_subtitle` result describes subtitle access; the page's visible sign-in and media access remain separate observations.
4. Return available caption and page captures as the main material. Identify metadata-only coverage as partial. Preserve the original requested URL, part-specific timestamp links, and direct creator references. Set visual coverage from actual visual evidence; caption-only evidence keeps visual coverage unknown.
