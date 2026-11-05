import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, open, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const transportCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const isTransportFailure = (error) =>
  transportCodes.has(error?.code) ||
  transportCodes.has(error?.cause?.code) ||
  error?.name === "TimeoutError" ||
  error?.name === "AbortError";

export async function downloadSpeechArtifact(
  pin,
  path,
  { maxBytes = 256 * 1024 * 1024 } = {},
) {
  let ownsOutput = false;
  try {
    try {
      const response = await fetch(pin.url, {
        signal: AbortSignal.timeout(600_000),
      });
      if (!response.ok || !response.body)
        throw new Error(`Speech artifact download failed: ${response.status}`);
      const file = await open(path, "wx", 0o600);
      ownsOutput = true;
      let total = 0;
      try {
        for await (const bytes of response.body) {
          total += bytes.byteLength;
          if (total > maxBytes)
            throw new Error("Speech artifact exceeds build budget");
          let offset = 0;
          while (offset < bytes.byteLength)
            offset += (
              await file.write(bytes, offset, bytes.byteLength - offset)
            ).bytesWritten;
        }
      } finally {
        await file.close();
      }
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      if (ownsOutput) {
        await rm(path, { force: true });
        ownsOutput = false;
      }
      const reservation = await open(path, "wx", 0o600);
      ownsOutput = true;
      await reservation.close();
      console.warn(
        "Speech artifact transport interrupted; retrying the pinned URL with system curl.",
      );
      const urls = [pin.url, ...(pin.mirrors ?? [])];
      for (const [index, url] of urls.entries()) {
        try {
          await execute(
            process.platform === "win32" ? "curl.exe" : "curl",
            [
              "--fail",
              "--location",
              "--silent",
              "--show-error",
              "--retry",
              "2",
              "--retry-all-errors",
              "--connect-timeout",
              "20",
              "--max-time",
              "120",
              "--max-filesize",
              String(maxBytes),
              "--proto",
              "=http,https",
              "--proto-redir",
              "=https",
              "--output",
              path,
              url,
            ],
            { timeout: 400_000, maxBuffer: 65_536 },
          );
          break;
        } catch (curlError) {
          if (
            ![5, 6, 7, 18, 28, 35, 52, 55, 56, 92].includes(curlError.code) ||
            index === urls.length - 1
          )
            throw curlError;
          await rm(path, { force: true });
          ownsOutput = false;
          const retryFile = await open(path, "wx", 0o600);
          ownsOutput = true;
          await retryFile.close();
          console.warn(
            "Speech artifact transport interrupted; trying the manifest mirror with the same pinned digest.",
          );
        }
      }
      await chmod(path, 0o600);
    }
    if ((await stat(path)).size > maxBytes)
      throw new Error("Speech artifact exceeds build budget");
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    if (hash.digest("hex") !== pin.sha256)
      throw new Error("Speech artifact checksum mismatch");
    return path;
  } catch (error) {
    if (ownsOutput) await rm(path, { force: true });
    throw error;
  }
}
