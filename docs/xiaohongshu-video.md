# Xiaohongshu video reading

[XiaohongshuVideoReader](../src/main/services/xiaohongshu-video.ts) implements the common video reader. The reading Skill selects it for video notes. The existing image/text adapter keeps its image-carousel path. [Video contracts](data-contracts.md#source-routes-and-transcript-evidence) own shared identities and provenance.

## Source and access

The reader accepts original `explore`, `discovery/item`, and `search_result` note addresses. Requests retain the complete share query, including `xsec_token` and `xsec_source`. Browser navigation resolves share links to an observed original note. The standalone media module also exposes a bounded resolver for known Xiaohongshu short-link hosts.

The [source contract](data-contracts.md#source-routes-and-transcript-evidence) preserves share intake and resolved-note evidence identities.

The task page supplies its matching document identity, own note state, and site cookies. Guest cookies and an account-session cookie produce separate transport observations. Website login and verification requirements come from observed challenges. A generic extraction failure retains its source-stage cause. Cookies enter a temporary downloader file under the private evidence directory; process cleanup removes that file. Saved metadata excludes credential headers.

The pinned [yt-dlp extractor](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/xiaohongshu.py) supplies metadata and media formats. The adapter checks its returned note ID and selects an audio-bearing HTTPS stream from an observed `xhscdn.com` host. Subtitle retrieval remains a separate platform capability; this extractor's video-content path uses application ASR.

Observed HTTP media and cover addresses on `*.xhscdn.com` use HTTPS with their original path and query. Media selection requires an audio codec or a positive audio-channel count; zero audio channels identify a video-only stream. Credentialed and explicitly ported CDN addresses fail URL admission.

## Capture and retention

The reader checkpoints title, written description, and cover before media acquisition. ASR readiness is checked before the media download. The common speech service downloads the allowed media and returns timestamped segments. Evidence identifies `application_asr`, its backend/model, speech coverage, and unknown visual coverage. Segment links retain the full usable note address; segment start/end fields retain time positions.

Partial results return their typed source observation through the [diagnostic contract](data-contracts.md#submitted-sources-and-reports). Access, media, speech readiness, and recognition keep their observed stage and bounded failure code. An ASR model-resource issue directs reading-component setup. The reading worker retains that source observation when later translation or introduction processing fails.

`transcription.json` preserves the speech service's original result, including `recognizerEnd` estimates beyond the media boundary. Public transcript segments contain their stable ID, bounded start/end times, recognized text, and source link.

Each reading attempt saves its own `xiaohongshu/<note-id>` evidence directory. Repeated calls reuse that attempt's committed outcome. A capture awaiting local resources resumes after its media reader and speech resources become ready. The retry retains saved metadata and completed speech if later page or media access fails. A later attempt retains the earlier directory. Speech progress checkpoints completed segments. Cancellation saves the metadata and completed speech before returning the cancelled task state. A partial speech result keeps its recognized segments and original issue. A completed zero-segment result keeps the written material and records the recognition outcome.

Source composition includes the creator and direct HTTPS links from the written description. Metadata merging retains matching page fields when extractor fields are blank or contain a shorter prefix. Covers from both observations keep their order and unique addresses.

Metadata output has an 8 MiB budget and extraction has a 75-second process budget. The [speech service](speech-processing.md) owns media, duration, chunk, and transcription budgets. Source composition admits up to 20,000 complete segments and one million recognized text characters; an exhausted composition budget records partial speech coverage.

## Verification scope

[Media rules](../tests/rules/xiaohongshu-media.test.ts) cover share identity, redirect boundaries, guest cookies, returned identity, output budgets, fallback metadata, and the existing image/text path. [Video rules](../tests/rules/xiaohongshu-video.test.ts) cover recognized speech, zero segments, partial results, model readiness, cancellation, and saved attempts. [Chrome fixtures](../tests/e2e/xiaohongshu-video.spec.ts) cover the task document, matching note state, cookies, and observed access challenges.

Fixtures establish controlled behavior. Live acceptance separately checks a current image note, spoken video, quiet/music video, usable and expired share parameters, actual login/verification challenges, partial results, and cancellation. The owning task records executed live observations in its local review evidence.
