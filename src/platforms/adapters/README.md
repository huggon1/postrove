# Platform enhancement

`xhs/` supplies the optional `read_xiaohongshu` tool for image/text notes. It normalizes the returned source identity, text, images, and coverage through the parent `types.ts`.

Current parsing enters `PlatformAccess.collect` and browser capture. The [architecture](../../../docs/architecture-overview.md#collection-and-content-capabilities) owns that pipeline.

The fixed [YouTube transcript reader](../../main/services/youtube-transcript.ts) serves the capture Agent's `read_youtube_transcript` tool. Reading Skills guide tool choices, page operations, and collection scope for each platform.

The [Xiaohongshu media reader](../../main/services/xiaohongshu-media.ts) resolves share identities and extracts video metadata through the same pinned downloader. It retains the complete share query for requests, checks the returned note identity, and selects an audio-bearing HTTPS stream on an observed `xhscdn.com` host. Its injected process boundary supports isolated fixture checks. A source-specific failure retains verified page metadata supplied by the caller. Cookie evidence distinguishes guest transport from an account-session cookie; website sign-in and access challenges retain their own observed states. Temporary cookie files use private permissions and are removed after process cleanup. Saved metadata excludes request credential headers.
