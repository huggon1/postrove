import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { isIP } from "node:net";
import { SpeechError } from "./process";

export interface StoredMedia {
  path: string;
  sha256: string;
  bytes: number;
}
export type SpeechFetch = typeof globalThis.fetch;

/** Streams bytes to a private staging file and publishes only a verified complete file. */
export async function storeBytes(
  directory: string,
  input: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
  expected?: { sha256: string; bytes: number; file: string },
): Promise<StoredMedia> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = join(directory, `.download-${randomUUID()}`);
  const file = await open(staging, "wx", 0o600);
  let bytes = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of input) {
      if (signal.aborted) throw new SpeechError("cancelled");
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new SpeechError("media_budget");
      hash.update(chunk);
      // FileHandle.write can make a partial write.
      let offset = 0;
      while (offset < chunk.byteLength) {
        const written = await file.write(
          chunk,
          offset,
          chunk.byteLength - offset,
        );
        if (!written.bytesWritten) throw new SpeechError("storage_failed");
        offset += written.bytesWritten;
      }
    }
    if (signal.aborted) throw new SpeechError("cancelled");
    const sha256 = hash.digest("hex");
    if (expected && (sha256 !== expected.sha256 || bytes !== expected.bytes))
      throw new SpeechError("download_integrity");
    if (!bytes) throw new SpeechError("media_unavailable");
    await file.sync();
    await file.close();
    const path = join(directory, expected?.file ?? sha256);
    await rename(staging, path);
    return { path, sha256, bytes };
  } finally {
    await file.close().catch(() => {});
    await rm(staging, { force: true });
  }
}

export async function importMedia(
  path: string,
  directory: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<StoredMedia> {
  const info = await stat(path).catch(() => {
    throw new SpeechError("media_unavailable");
  });
  if (!info.isFile()) throw new SpeechError("media_unavailable");
  if (info.size > maxBytes) throw new SpeechError("media_budget");
  try {
    return await storeBytes(
      directory,
      createReadStream(path, { signal }),
      signal,
      maxBytes,
    );
  } catch (error) {
    if (signal.aborted) throw new SpeechError("cancelled");
    throw error;
  }
}

/** The site adapter supplies exact CDN hosts and its task-scoped request headers. */
export async function acquireSpeechMedia(options: {
  url: string;
  allowedHosts: string[];
  headers?: Record<string, string>;
  directory: string;
  signal: AbortSignal;
  maxBytes?: number;
  timeoutMs?: number;
  fetch?: SpeechFetch;
}): Promise<StoredMedia> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = AbortSignal.any([options.signal, timeout]);
  const maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new SpeechError("media_unavailable");
  }
  const origin = url.origin;
  const fetcher = options.fetch ?? globalThis.fetch;
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
        /(^localhost$|\.(local|internal)$)/i.test(url.hostname) ||
        !options.allowedHosts.includes(url.hostname)
      )
        throw new SpeechError("media_unavailable");
      const response = await fetcher(url, {
        signal,
        redirect: "manual",
        headers: url.origin === origin ? options.headers : undefined,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new SpeechError("download_failed");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new SpeechError("download_failed");
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body.cancel();
        throw new SpeechError("media_budget");
      }
      return await storeBytes(
        options.directory,
        response.body,
        signal,
        maxBytes,
      );
    }
    throw new SpeechError("download_failed");
  } catch (error) {
    if (options.signal.aborted) throw new SpeechError("cancelled");
    if (timeout.aborted) throw new SpeechError("timeout");
    if (error instanceof SpeechError) throw error;
    throw new SpeechError("download_failed");
  }
}
