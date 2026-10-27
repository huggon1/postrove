---
name: reddit-search
description: Use Reddit AI search or Ask to answer from Reddit posts and comments and capture their original permalinks.
---

1. Open https://www.reddit.com/answers/. Inspect the page and follow the observed Ask or AI search entry. A sign-in screen returns login_required. Verification returns verification_required. A disabled AI entry or account restriction returns access_limited.
2. Use a fresh Ask question. Wait for the question textbox to finish loading. When an existing answer is open, use the observed New question control to return to the fresh question entry. Submit the exact prepared English question once in the AI question control. Wait for generation to finish. Capture the complete assistant body, including the final section and its inline citations. The refreshed answer uses the guides-response-ssr container; a live answer uses the rendererd-rtjson body inside the streaming response Shadow DOM. Choose its snapshot reference by the full text length and opening text. Confirm the capture includes the final visible advice before returning its ID.
3. Return the completed reply capture ID and exact submitted question. The application saves that answer before citation extraction.
4. During citation extraction, use capture_search_sources on the saved answer, then open its observed source cards or disclosures. Capture the loaded source containers. Return original Reddit post and comment permalinks already present in these captures. Preserve comment targets when a specific comment supports the answer.
5. Keep community names, titles, and displayed dates from the captured cards. Retain the saved answer when a citation fails. The browser session's user handles login, age checks, and account agreements.
