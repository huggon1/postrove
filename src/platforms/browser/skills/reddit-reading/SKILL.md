---
name: reddit-reading
description: Read a Reddit original post or a selected comment permalink with the parent post and required ancestor context.
---

1. Open the supplied original Reddit permalink. Expand the post body and accessible embedded media. Use the shared browser session when present. Public posts can be read as a guest; an actual sign-in, age, verification, or community gate returns its observed access state.
2. For a post link, capture the original author's post text, title, media, and supplied links in source order. The main source identity is the Reddit post ID.
3. For a comment permalink, locate the selected comment, expand it, and capture its full text plus the parent post and necessary ancestor comments as context. Keep the selected comment ID as the main identity. Preserve attribution and boundaries between these containers.
4. Report coverage of the selected post or comment and any inaccessible context. Capture each included container on the original page and return its capture ID.
5. When references are requested, return direct material links supplied in the selected source with the capture that contains each link. The application reads those materials separately.
