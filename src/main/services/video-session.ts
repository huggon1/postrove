import type { BrowserContext } from "playwright-core";
import type { VideoReadSession } from "./video-transcript";

/** Restrict session access to Bilibili's source metadata and subtitle endpoints. */
export function bilibiliJsonUrl(raw: string) {
  const url = new URL(raw);
  const api =
    url.hostname === "api.bilibili.com" &&
    ["/x/web-interface/view", "/x/player/wbi/v2"].includes(url.pathname);
  const subtitle =
    (url.hostname === "hdslb.com" || url.hostname.endsWith(".hdslb.com")) &&
    url.pathname.startsWith("/bfs/subtitle/");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(api || subtitle)
  )
    throw new Error("transcript_access_url_rejected");
  return url;
}
export async function fetchBilibiliJson(
  raw: string,
  signal: AbortSignal,
  cookie = "",
): Promise<unknown> {
  const url = bilibiliJsonUrl(raw);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    redirect: "error",
    headers: {
      Referer: "https://www.bilibili.com/",
      ...(cookie && url.hostname === "api.bilibili.com"
        ? { Cookie: cookie }
        : {}),
    },
  });
  if (!response.ok) throw new Error(`bilibili_http_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("transcript_extraction_failed");
  const buffers: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 20 * 1024 * 1024) throw new Error("transcript_output_limit");
      buffers.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}
export function bilibiliReadSession(context: BrowserContext): VideoReadSession {
  return {
    async getJson(raw, signal) {
      const url = bilibiliJsonUrl(raw);
      const cookies =
        url.hostname === "api.bilibili.com"
          ? await context.cookies(url.href)
          : [];
      return fetchBilibiliJson(
        url.href,
        signal,
        cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      );
    },
  };
}
