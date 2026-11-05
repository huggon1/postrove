import { open, stat, writeFile } from "node:fs/promises";
import { SpeechError } from "./process";

export async function inspectWave(path: string) {
  const file = await open(path, "r");
  try {
    const size = (await stat(path)).size;
    const head = Buffer.alloc(12);
    await file.read(head, 0, 12, 0);
    if (
      head.toString("ascii", 0, 4) !== "RIFF" ||
      head.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new SpeechError("decode_failed");
    let position = 12,
      validFormat = false;
    while (position + 8 <= size) {
      const header = Buffer.alloc(8);
      await file.read(header, 0, 8, position);
      const kind = header.toString("ascii", 0, 4);
      const length = header.readUInt32LE(4);
      const start = position + 8;
      if (start + length > size) throw new SpeechError("decode_failed");
      if (kind === "fmt ") {
        if (length < 16) throw new SpeechError("decode_failed");
        const format = Buffer.alloc(16);
        await file.read(format, 0, 16, start);
        validFormat =
          format.readUInt16LE(0) === 1 &&
          format.readUInt16LE(2) === 1 &&
          format.readUInt32LE(4) === 16_000 &&
          format.readUInt16LE(12) === 2 &&
          format.readUInt16LE(14) === 16;
      }
      if (kind === "data") {
        if (!validFormat || !length || length % 2)
          throw new SpeechError("decode_failed");
        return { offset: start, bytes: length, duration: length / 32_000 };
      }
      position = start + length + (length % 2);
    }
    throw new SpeechError("decode_failed");
  } finally {
    await file.close();
  }
}

export async function sliceWave(
  input: string,
  output: string,
  offset: number,
  bytes: number,
) {
  const file = await open(input, "r");
  const pcm = Buffer.alloc(bytes);
  try {
    let read = 0;
    while (read < bytes) {
      const result = await file.read(pcm, read, bytes - read, offset + read);
      if (!result.bytesRead) throw new SpeechError("decode_failed");
      read += result.bytesRead;
    }
  } finally {
    await file.close();
  }
  let silent = true;
  for (let i = 0; i < bytes; i += 2) {
    if (Math.abs(pcm.readInt16LE(i)) > 2) {
      silent = false;
      break;
    }
  }
  // Whisper expects at least one second. Padding keeps the original time bounds.
  const data =
    bytes < 32_000 ? Buffer.concat([pcm, Buffer.alloc(32_000 - bytes)]) : pcm;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(output, Buffer.concat([header, data]), { mode: 0o600 });
  return { silent };
}
