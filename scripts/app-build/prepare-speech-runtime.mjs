import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const pins = JSON.parse(
  await readFile(
    new URL("../../src/shared/speech-runtime.json", import.meta.url),
    "utf8",
  ),
);
const target = `${process.platform}-${process.arch}`;
if (!["darwin-arm64", "win32-x64"].includes(target))
  throw new Error("Speech runtime supports macOS arm64 and Windows x64");
const parent = resolve(".runtime", "speech");
const stage = join(parent, `.stage-${randomUUID()}`);
const output = join(stage, "runtime");
await mkdir(output, { recursive: true, mode: 0o700 });

async function digest(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
async function download(pin, name) {
  const path = join(stage, name);
  // Build-only cache. Every reused byte still passes the pinned digest.
  const cache = process.env.POSTROVE_SPEECH_ARTIFACTS;
  let copied = false;
  if (cache) {
    try {
      await copyFile(join(cache, pin.sha256), path);
      copied = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!copied) {
    const response = await fetch(pin.url, {
      signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok || !response.body)
      throw new Error(`Speech artifact download failed: ${response.status}`);
    const file = await open(path, "wx", 0o600);
    let total = 0;
    try {
      for await (const bytes of response.body) {
        total += bytes.byteLength;
        if (total > 256 * 1024 * 1024)
          throw new Error("Speech artifact exceeds build budget");
        let offset = 0;
        while (offset < bytes.byteLength)
          offset += (await file.write(bytes, offset, bytes.byteLength - offset))
            .bytesWritten;
      }
    } finally {
      await file.close();
    }
  }
  if ((await digest(path)) !== pin.sha256)
    throw new Error("Speech artifact checksum mismatch");
  return path;
}
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    timeout: 1_200_000,
  });
}
async function extract(archive, destination) {
  await mkdir(destination, { recursive: true });
  run("tar", ["-xf", archive, "-C", destination], stage);
}

try {
  const whisperSourceArchive = await download(pins.source, "whisper.tar.gz");
  await extract(whisperSourceArchive, join(stage, "whisper-source"));
  const whisperSource = join(
    stage,
    "whisper-source",
    `whisper.cpp-${pins.whisper}`,
  );
  await copyFile(
    join(whisperSource, "LICENSE"),
    join(output, "WHISPER-LICENSE"),
  );
  {
    const cmake = process.env.POSTROVE_SPEECH_CMAKE ?? "cmake";
    const build = join(stage, "whisper-build");
    run(
      cmake,
      [
        "-S",
        whisperSource,
        "-B",
        build,
        "-DCMAKE_BUILD_TYPE=Release",
        "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
        "-DBUILD_SHARED_LIBS=OFF",
        "-DGGML_METAL=OFF",
        "-DGGML_NATIVE=OFF",
        "-DWHISPER_BUILD_TESTS=OFF",
        ...(target === "darwin-arm64"
          ? ["-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0"]
          : [
              "-G",
              "Visual Studio 17 2022",
              "-A",
              "x64",
              "-DCMAKE_POLICY_DEFAULT_CMP0091=NEW",
              "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
              "-DGGML_AVX=OFF",
              "-DGGML_AVX2=OFF",
              "-DGGML_FMA=OFF",
              "-DGGML_F16C=OFF",
            ]),
      ],
      stage,
    );
    run(
      cmake,
      [
        "--build",
        build,
        "--config",
        "Release",
        "--target",
        "whisper-cli",
        "-j",
        "4",
      ],
      stage,
    );
    await copyFile(
      target === "darwin-arm64"
        ? join(build, "bin", "whisper-cli")
        : join(build, "bin", "Release", "whisper-cli.exe"),
      join(
        output,
        target === "darwin-arm64" ? "whisper-cli" : "whisper-cli.exe",
      ),
    );
  }
  if (target === "darwin-arm64") {
    const archive = await download(pins.ffmpegSource, "ffmpeg.tar.xz");
    await extract(archive, join(stage, "ffmpeg-source"));
    const source = join(stage, "ffmpeg-source", `ffmpeg-${pins.ffmpeg}`);
    const ffmpegBuild = join(stage, "ffmpeg-build");
    await mkdir(ffmpegBuild);
    run(
      join(source, "configure"),
      [
        "--disable-everything",
        "--disable-autodetect",
        "--disable-network",
        "--disable-doc",
        "--disable-debug",
        "--disable-shared",
        "--enable-static",
        "--disable-x86asm",
        "--disable-ffplay",
        "--disable-ffprobe",
        "--enable-ffmpeg",
        "--enable-protocol=file,pipe",
        "--enable-decoder=aac,aac_latm,mp3,mp3float,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,flac,vorbis,opus",
        "--enable-demuxer=mov,mp3,wav,ogg,flac,matroska,aac,mpegts",
        "--enable-parser=aac,aac_latm,mpegaudio,flac,vorbis,opus",
        "--enable-muxer=wav",
        "--enable-encoder=pcm_s16le",
        "--enable-filter=aresample,aformat,anull",
      ],
      ffmpegBuild,
    );
    run("make", ["-j", "4", "ffmpeg"], ffmpegBuild);
    await copyFile(join(ffmpegBuild, "ffmpeg"), join(output, "ffmpeg"));
    for (const name of ["LICENSE.md", "COPYING.LGPLv2.1"])
      await copyFile(join(source, name), join(output, `FFMPEG-${name}`));
    for (const name of ["whisper-cli", "ffmpeg"])
      await chmod(join(output, name), 0o755);
  } else {
    const ffmpegArchive = await download(pins.windowsFfmpeg, "ffmpeg.zip");
    await extract(ffmpegArchive, join(stage, "ffmpeg-windows"));
    const source = join(
      stage,
      "ffmpeg-windows",
      `ffmpeg-${pins.ffmpeg}-essentials_build`,
    );
    await copyFile(
      join(source, "bin", "ffmpeg.exe"),
      join(output, "ffmpeg.exe"),
    );
    for (const name of ["LICENSE", "README.txt"])
      await copyFile(join(source, name), join(output, `FFMPEG-${name}`));
  }
  const suffix = process.platform === "win32" ? ".exe" : "";
  const version = execFileSync(join(output, `ffmpeg${suffix}`), ["-version"], {
    encoding: "utf8",
  });
  if (
    !version.startsWith(`ffmpeg version ${pins.ffmpeg}`) ||
    version.includes("--enable-nonfree")
  )
    throw new Error("FFmpeg version or build configuration mismatch");
  execFileSync(join(output, `whisper-cli${suffix}`), ["--help"], {
    stdio: "ignore",
  });
  await writeFile(
    join(output, "SPEECH-NOTICE.txt"),
    [
      `whisper.cpp ${pins.whisper}: ${pins.source.url}`,
      `FFmpeg ${pins.ffmpeg}: ${pins.ffmpegSource.url}`,
      target === "win32-x64"
        ? `Windows FFmpeg distribution: ${pins.windowsFfmpeg.url}`
        : "macOS: minimal static FFmpeg audio build",
      "License texts accompany these separate command-line programs.",
      "The speech model is provisioned separately into the selected local profile.",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  const files = {};
  for (const name of await readdir(output))
    files[name] = await digest(join(output, name));
  await writeFile(
    join(output, "runtime.json"),
    JSON.stringify({
      whisper: pins.whisper,
      ffmpeg: pins.ffmpeg,
      target,
      files,
    }),
    { mode: 0o600 },
  );
  const destination = join(parent, target),
    backup = join(parent, `.backup-${randomUUID()}`);
  let backedUp = false;
  try {
    await rename(destination, backup);
    backedUp = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(output, destination);
  } catch (error) {
    if (backedUp) await rename(backup, destination);
    throw error;
  }
  await rm(backup, { force: true, recursive: true });
  console.log(
    `Speech runtime ${pins.whisper} / FFmpeg ${pins.ffmpeg} verified for ${target}`,
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
