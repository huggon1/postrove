import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { youtubeRuntimeVersion } from "./youtube-transcript";

export type XhsMediaIssue =
  | "runtime_unavailable"
  | "extraction_failed"
  | "identity_changed"
  | "media_unavailable"
  | "login_required"
  | "verification_required"
  | "access_parameters_invalid"
  | "source_unavailable"
  | "output_budget"
  | "timeout";
export class XhsMediaError extends Error {
  constructor(readonly code: XhsMediaIssue) {
    super(code);
  }
}
export interface XhsCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly?: boolean;
}
export interface XhsNoteIdentity {
  id: string;
  url: string;
  /** The full source address retains the source's access parameters. */
  requestUrl: string;
}
export interface XhsVideoMetadata {
  id: string;
  title: string;
  description: string;
  uploader: string;
  images: { url: string; alt: string }[];
  duration?: number;
}
export interface XhsMedia {
  url: string;
  allowedHosts: string[];
  headers: Record<string, string>;
}
export interface XhsMediaResult {
  note: XhsNoteIdentity;
  metadata?: XhsVideoMetadata;
  media?: XhsMedia;
  issue?: XhsMediaIssue;
  /** Cookie presence is transport evidence, independently of detected website login. */
  cookies: "absent" | "guest" | "account_session_present";
}
export type XhsProcessRunner = (
  executable: string,
  args: string[],
  directory: string,
  signal: AbortSignal,
) => Promise<string>;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown, max = 300_000) =>
  typeof value === "string" ? value.slice(0, max) : "";
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
const siteHosts = new Set(["xiaohongshu.com", "www.xiaohongshu.com"]);
const shortHosts = new Set([
  "xhslink.com",
  "www.xhslink.com",
  "xhslink.cn",
  "www.xhslink.cn",
]);
function safeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
export function xhsNoteIdentity(raw: string): XhsNoteIdentity | undefined {
  const url = safeUrl(raw);
  const id = url?.pathname.match(
    /^\/(?:explore|discovery\/item|search_result)\/([a-f0-9]{24})\/?$/,
  )?.[1];
  if (!url || !siteHosts.has(url.hostname) || !id) return undefined;
  const canonical = `https://www.xiaohongshu.com/explore/${id}`;
  return { id, url: canonical, requestUrl: `${canonical}${url.search}` };
}
/** Redirect resolution keeps the source on known note/share hosts. */
export async function resolveXhsNote(
  raw: string,
  signal: AbortSignal,
  fetcher = globalThis.fetch,
) {
  let url = safeUrl(raw);
  for (let count = 0; count < 5; count++) {
    if (signal.aborted) throw new Error("Cancelled");
    const note = url && xhsNoteIdentity(url.href);
    if (note) return note;
    if (!url || !shortHosts.has(url.hostname))
      throw new XhsMediaError("identity_changed");
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location)
      throw new XhsMediaError("source_unavailable");
    url = safeUrl(new URL(location, url).href);
  }
  throw new XhsMediaError("source_unavailable");
}
function siteCookie(cookie: XhsCookie) {
  const domain = cookie.domain.replace(/^\./, "");
  return (
    (domain === "xiaohongshu.com" || domain.endsWith(".xiaohongshu.com")) &&
    cookie.value.length > 0 &&
    (cookie.expires <= 0 || cookie.expires > Date.now() / 1000) &&
    [cookie.name, cookie.value, cookie.domain, cookie.path].every(
      (value) => !/[\r\n\t\0]/.test(value),
    )
  );
}
export function xhsCookieFile(cookies: XhsCookie[]) {
  return (
    "# Netscape HTTP Cookie File\n" +
    cookies
      .filter(siteCookie)
      .map((cookie) =>
        [
          cookie.httpOnly ? `#HttpOnly_${cookie.domain}` : cookie.domain,
          cookie.domain.startsWith(".") ? "TRUE" : "FALSE",
          cookie.path || "/",
          cookie.secure ? "TRUE" : "FALSE",
          String(Math.max(0, Math.floor(cookie.expires))),
          cookie.name,
          cookie.value,
        ].join("\t"),
      )
      .join("\n") +
    "\n"
  );
}
export function classifyXhsFailure(text: string): XhsMediaIssue {
  if (
    /captcha|verify (?:your|you)|verification required|安全验证|验证码|验证后/i.test(
      text,
    )
  )
    return "verification_required";
  if (
    /login required|log in (?:to|first)|sign in (?:to|first)|请先登录|登录后(?:查看|观看)/i.test(
      text,
    )
  )
    return "login_required";
  if (
    /xsec_token.*(?:invalid|expired)|(?:invalid|expired).*xsec_token|访问参数.*失效/i.test(
      text,
    )
  )
    return "access_parameters_invalid";
  if (/300031|当前笔记暂时无法浏览|HTTP Error (?:404|410)/i.test(text))
    return "source_unavailable";
  return "extraction_failed";
}
export const runXhsProcess: XhsProcessRunner = (
  executable,
  args,
  directory,
  signal,
) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled"));
    const env: NodeJS.ProcessEnv = {};
    for (const name of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TEMP",
      "TMP",
      "SYSTEMROOT",
      "WINDIR",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
      "no_proxy",
    ])
      if (process.env[name]) env[name] = process.env[name];
    const child = spawn(executable, args, {
      cwd: directory,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const output: Buffer[] = [];
    let bytes = 0,
      diagnostics = "",
      failure: Error | undefined;
    let treeStop: Promise<void> | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      if (process.platform === "win32" && child.pid) {
        treeStop = new Promise((resolve) => {
          const killer = spawn(
            join(
              process.env.SystemRoot ?? "C:\\Windows",
              "System32",
              "taskkill.exe",
            ),
            ["/pid", String(child.pid), "/T", "/F"],
            {
              windowsHide: true,
              stdio: "ignore",
              timeout: 5_000,
              env: { SystemRoot: process.env.SystemRoot },
            },
          );
          killer.once("error", () => {
            child.kill("SIGKILL");
            resolve();
          });
          killer.once("close", () => {
            child.kill("SIGKILL");
            resolve();
          });
        });
      } else {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };
    const abort = () => stop(new Error("Cancelled"));
    const timer = setTimeout(() => stop(new XhsMediaError("timeout")), 75_000);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (part: Buffer) => {
      bytes += part.length;
      if (bytes > 8 * 1024 * 1024) stop(new XhsMediaError("output_budget"));
      else output.push(part);
    });
    // Diagnostics are classified in memory; signed addresses and cookies stay out of logs.
    child.stderr.on("data", (part: Buffer) => {
      diagnostics = (diagnostics + part.toString("utf8")).slice(-32_768);
    });
    child.on("error", () => {
      failure ??= new XhsMediaError("runtime_unavailable");
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      await treeStop;
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new XhsMediaError(classifyXhsFailure(diagnostics)));
      else resolve(Buffer.concat(output).toString("utf8"));
    });
  });
export function normalizeXhsVideoMetadata(raw: unknown, note: XhsNoteIdentity) {
  const input = object(raw);
  if (input.id !== note.id) throw new XhsMediaError("identity_changed");
  const images: XhsVideoMetadata["images"] = [];
  const thumbnails = Array.isArray(input.thumbnails)
    ? input.thumbnails
    : [{ url: input.thumbnail }];
  for (const item of thumbnails) {
    const url = safeUrl(string(object(item).url, 4096));
    if (url && !images.some((image) => image.url === url.href))
      images.push({ url: url.href, alt: "Video cover" });
    if (images.length === 30) break;
  }
  const formats = (Array.isArray(input.formats) ? input.formats : [input]).map(
    object,
  );
  const candidates = formats
    .flatMap((format) => {
      const url = safeUrl(string(format.url, 8192));
      if (
        !url ||
        !url.hostname.endsWith(".xhscdn.com") ||
        format.acodec === "none"
      )
        return [];
      const headers = object(format.http_headers ?? input.http_headers);
      const allowedHeaders: Record<string, string> = {
        Referer: note.requestUrl,
      };
      for (const key of ["User-Agent", "Accept", "Accept-Language"])
        if (
          typeof headers[key] === "string" &&
          !/[\r\n]/.test(headers[key] as string)
        )
          allowedHeaders[key] = string(headers[key], 2000);
      return [
        {
          format,
          media: {
            url: url.href,
            allowedHosts: [url.hostname],
            headers: allowedHeaders,
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.format.vcodec === "none") -
          Number(a.format.vcodec === "none") ||
        (number(a.format.filesize) ?? Infinity) -
          (number(b.format.filesize) ?? Infinity),
    );
  const selected = candidates[0];
  return {
    metadata: {
      id: note.id,
      title: string(input.title, 500),
      description: string(input.description),
      uploader: string(input.uploader || input.uploader_id, 300),
      images,
      duration: number(input.duration) ?? number(selected?.format.duration),
    } satisfies XhsVideoMetadata,
    media: selected?.media,
  };
}
/** Removes request credentials before metadata enters the source-evidence directory. */
export function xhsMetadataEvidence(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(xhsMetadataEvidence);
  if (raw && typeof raw === "object")
    return Object.fromEntries(
      Object.entries(raw)
        .filter(
          ([key]) =>
            !/^(?:http_headers|cookies|cookie|authorization|proxy|_filename|filepath)$/i.test(
              key,
            ),
        )
        .map(([key, value]) => [key, xhsMetadataEvidence(value)]),
    );
  return raw;
}
export class XiaohongshuMediaReader {
  constructor(
    private runtimeRoot: string,
    private run: XhsProcessRunner = runXhsProcess,
  ) {}
  async available() {
    try {
      const root = join(this.runtimeRoot, "youtube");
      const manifest = JSON.parse(
        await readFile(join(root, "runtime.json"), "utf8"),
      );
      if (manifest.downloader !== youtubeRuntimeVersion.downloader)
        return false;
      await access(
        join(root, `yt-dlp${process.platform === "win32" ? ".exe" : ""}`),
        constants.X_OK,
      );
      return true;
    } catch {
      return false;
    }
  }
  async read(options: {
    url: string;
    directory: string;
    signal: AbortSignal;
    cookies?: XhsCookie[];
    fallback?: XhsVideoMetadata;
  }): Promise<XhsMediaResult> {
    const note = xhsNoteIdentity(options.url);
    if (!note) throw new XhsMediaError("identity_changed");
    if (options.fallback && options.fallback.id !== note.id)
      throw new XhsMediaError("identity_changed");
    const cookies = (options.cookies ?? []).filter(siteCookie);
    const result: XhsMediaResult = {
      note,
      metadata: options.fallback,
      cookies: !cookies.length
        ? "absent"
        : cookies.some((cookie) => cookie.name === "web_session")
          ? "account_session_present"
          : "guest",
    };
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const temporary = await mkdtemp(join(options.directory, ".transport-"));
    try {
      if (options.signal.aborted) throw new Error("Cancelled");
      if (!(await this.available()))
        throw new XhsMediaError("runtime_unavailable");
      const cookiePath = join(temporary, "cookies.txt");
      if (cookies.length)
        await writeFile(cookiePath, xhsCookieFile(cookies), { mode: 0o600 });
      const raw = await this.run(
        join(
          this.runtimeRoot,
          "youtube",
          `yt-dlp${process.platform === "win32" ? ".exe" : ""}`,
        ),
        [
          "--ignore-config",
          "--no-plugin-dirs",
          "--no-remote-components",
          "--no-cache-dir",
          "--no-playlist",
          "--skip-download",
          "--ignore-no-formats-error",
          "--no-progress",
          "--no-warnings",
          "--socket-timeout",
          "20",
          "--retries",
          "1",
          ...(cookies.length ? ["--cookies", cookiePath] : []),
          "--dump-single-json",
          "--",
          note.requestUrl,
        ],
        temporary,
        options.signal,
      );
      if (Buffer.byteLength(raw) > 8 * 1024 * 1024)
        throw new XhsMediaError("output_budget");
      const parsed: unknown = JSON.parse(raw);
      const normalized = normalizeXhsVideoMetadata(parsed, note);
      if (options.signal.aborted) throw new Error("Cancelled");
      await writeFile(
        join(options.directory, "metadata.json"),
        JSON.stringify(xhsMetadataEvidence(parsed)),
        { mode: 0o600 },
      );
      result.metadata = {
        ...normalized.metadata,
        title: normalized.metadata.title || options.fallback?.title || "",
        description:
          normalized.metadata.description ||
          options.fallback?.description ||
          "",
        uploader:
          normalized.metadata.uploader || options.fallback?.uploader || "",
        images: normalized.metadata.images.length
          ? normalized.metadata.images
          : (options.fallback?.images ?? []),
        duration: normalized.metadata.duration ?? options.fallback?.duration,
      };
      result.media = normalized.media;
      if (!result.media) result.issue = "media_unavailable";
    } catch (error) {
      if (options.signal.aborted) throw new Error("Cancelled");
      result.issue =
        error instanceof XhsMediaError ? error.code : "extraction_failed";
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return result;
  }
}
