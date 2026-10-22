---
name: youtube-reading
description: Read an individual YouTube video, including its metadata, available transcript, timestamps, and creator-supplied materials.
---

1. Resolve the supplied link to an individual video and open its page. watch, youtu.be, Shorts, and live links identify the same video ID. A playlist or channel needs a selected video.
2. Choose the available reading tools and page controls for the requested scope. read_youtube_transcript accepts an observed video URL and returns a captureId, original timestamped captions, metadata, and actual coverage. Retain that capture as part of the video's evidence. Repeated calls in this attempt reuse the saved outcome.
3. The caption capture includes available metadata and creator description. Expand the creator description when additional page content is needed. The observed `YTD-WATCH-METADATA` container holds the title, creator and description. Capture additional author material within its own container. Playback and advertising containers return a scope error; select the metadata, description or transcript container from a fresh snapshot. When the caption tool is unavailable or returns a saved failure, use the page's transcript control and capture the accessible transcript in source order. Scroll or expand its sections until the available transcript is captured. Preserve original video links and timestamps.
4. Record transcript coverage separately from visual coverage. Metadata alone is partial coverage. Report a visible login, age, verification, or access restriction using its actual state. Capture available content before returning partial results.
5. Return this video as the main material with its own successful capture IDs. Direct author-supplied material links in the description become one-level references when requested.
