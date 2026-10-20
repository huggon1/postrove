# Platform enhancement

`xhs/` supplies the optional `read_xiaohongshu` tool for image/text notes. It normalizes the returned source identity, text, images, and coverage through the parent `types.ts`.

Current parsing enters `PlatformAccess.collect` and browser capture. The [architecture](../../../docs/architecture-overview.md#collection-and-content-capabilities) owns that pipeline.

The fixed [YouTube transcript reader](../../main/services/youtube-transcript.ts) serves the capture Agent's `read_youtube_transcript` tool. Reading Skills guide tool choices, page operations, and collection scope for each platform.
