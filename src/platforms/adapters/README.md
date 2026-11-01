# Platform enhancement

`xhs/` supplies the optional `read_xiaohongshu` tool for image/text notes. It normalizes the returned source identity, text, images, and coverage through the parent `types.ts`.

Current parsing enters `PlatformAccess.collect` and browser capture. The [architecture](../../../docs/architecture-overview.md#collection-and-content-capabilities) owns that pipeline.

The fixed [YouTube transcript reader](../../main/services/youtube-transcript.ts) serves the capture Agent's `read_youtube_transcript` tool. Reading Skills guide tool choices, page operations, and collection scope for each platform.

The [Bilibili caption reader](../../main/services/bilibili-transcript.ts) implements the generic video reader. Its pinned yt-dlp call enables subtitle extraction with `--write-subs` during JSON extraction and consumes embedded SRT. The reader verifies BV/av identity, selected part, and CID through source metadata. Its source-scoped JSON session uses the application's current Bilibili cookies in memory. An accessible player subtitle response supplies fallback when anonymous extraction fails. The Bilibili reading Skill guides page capture and metadata-only partial results.
