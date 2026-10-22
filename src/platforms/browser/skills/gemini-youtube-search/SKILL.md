---
name: gemini-youtube-search
description: Use Gemini Apps to discover YouTube videos, capture its completed answer, and collect original video citations.
---

1. Open https://gemini.google.com/app. Inspect the current page. A sign-in screen returns login_required. An account, activity, or connected-app consent returns action_required for the user.
2. Start a new chat using the observed control. Submit the exact prepared question once. It already requests YouTube evidence. Use Gemini's YouTube source capability when the page offers it. Wait for generation to finish.
3. Inspect a fresh snapshot and capture the complete assistant reply container, including its answer paragraphs, lists, and inline video cards. Gemini exposes this body as `MODEL-RESPONSE-CONTENT` in the snapshot. Check the captured beginning and end against the visible reply. A page, conversation, user message, composer, or single paragraph produces a scope error; use the complete reply body's current reference. Return its reply capture ID and the exact submitted question. The application saves the answer before citation extraction.
4. During citation extraction, read inline links from the saved answer with capture_search_sources. Open the answer's observed source or video disclosures and capture the loaded cards. Return the exact observed YouTube watch, youtu.be, Shorts, or live video addresses, including HTTP addresses supplied by Gemini. The application validates each video identity and saves its HTTPS address. Keep observed timestamps as locators; each video has one source identity.
5. A result with general web links still preserves the answer. Only observed original video links enter the YouTube source list. A capability or account restriction returns its observed access state.
