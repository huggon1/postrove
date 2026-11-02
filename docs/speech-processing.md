# Local speech processing

The main-process [speech module](../src/main/services/speech/index.ts) acquires bounded media, normalizes its audio, and runs whisper.cpp. The video adapter supplies website identity, access observations, and timestamp links. [Architecture](architecture-overview.md) owns the collection pipeline. This document owns the speech service and its resource contract.

## Integration

```ts
const speech = new SpeechService({ runtimeRoot, dataDir });
const readiness = await speech.check();
const media = await speech.acquireMedia({
  url: observedMediaUrl,
  allowedHosts: adapterCdnHosts,
  headers: taskScopedHeaders,
  signal,
});
const result = await speech.transcribe({
  mediaPath: media.path,
  language: "zh",
  signal,
  onProgress: saveCompletedSpeechChunks,
});
```

`runtimeRoot` comes from the existing runtime layout. `dataDir` is the selected isolated or installed profile. `SpeechTranscriber` supplies the typed `check` and `transcribe` boundary. `SpeechProcessRunner` accepts an executable, argument array, working directory, signal, timeout, and output budget; service tests inject this boundary. `SpeechRuntime.downloadModel` also accepts a fetch implementation for the application's main-process networking policy.

Website adapters resolve login, verification, media access, and observed native captions. Audio service issues describe runtime, model, transfer, decoding, recognition, and storage observations. A failed HTTP request returns `download_failed`; website adapters retain their own access evidence. Text-model credentials and website login remain owned by their existing services.

`SpeechResult` carries `provenance: application_asr`, the backend version, model identity and checksum, requested language, media checksum, completed chunks, and flattened segments. Each segment preserves the recognized text bytes and start/end seconds in the original media. An estimated end beyond its input chunk keeps the original estimate in `recognizerEnd` and clips `end` to the chunk boundary. Validation admits one second of timestamp slack beyond the chunk's rounded input duration. Each chunk records its original time range and optional detected language. Native captions retain the video contract's separate provenance. Recognition quality and visual coverage require their own evidence.

## Budgets, cancellation, and recovery

| Boundary                               | Default     |
| -------------------------------------- | ----------- |
| Media file or download                 | 256 MiB     |
| Media download timeout                 | 120 seconds |
| Audio duration                         | 2 hours     |
| Audio chunk                            | 5 minutes   |
| Decoder or recognizer timeout          | 10 minutes  |
| Whole transcription                    | 1 hour      |
| Retry after process failure            | 1           |
| Combined process output per invocation | 1 MiB       |
| Recognizer JSON per chunk              | 1 MiB       |
| Active recognition jobs per profile    | 1           |

Main can supply smaller budgets. Media transfer streams into a private staging file. The service checks file size before import and checks streamed bytes during import and download. FFmpeg converts the audio to 16 kHz mono PCM, bounded to the duration budget plus one second. A decoded duration above the budget returns `duration_budget`. The decoder accepts the listed media containers through local file and pipe protocols.

The service divides normalized audio into consecutive chunks. The final chunk keeps its original end time. Subsecond chunks receive recognizer input padding; saved timestamps end at the original media duration. Digital silence records a timed `no_speech` chunk. Other audio uses the recognizer's transcript output. Chunk boundaries can split spoken words; manual quality acceptance covers these boundaries and recognition errors.

Each finished chunk commits atomically before progress notification. Cancellation terminates the current process and waits for its exit before removing temporary audio. `cancelled`, `partial`, and `unavailable` results retain every completed chunk in memory and on disk. A later call with the same media checksum, model, language, pipeline version, and chunk size reuses validated chunk checkpoints. A process failure retries within its fixed budget; each recognition attempt starts with a fresh output file. Invalid output, missing resources, and exhausted budgets return their own issue codes.

## Runtime and model preparation

```sh
npm run setup:speech
npm run setup:speech-model -- --profile /absolute/path/to/review-data
```

`setup:speech` prepares `.runtime/speech/<platform>-<architecture>/`. The packaged runtime resolves under the application's resources directory through the existing `.runtime` resource rule. `prepare:runtime` includes speech preparation. The [pin manifest](../src/shared/speech-runtime.json) records upstream versions, immutable model revision, artifact sizes, and SHA-256 checksums.

| Target              | whisper.cpp 1.8.2                                              | FFmpeg 8.0.1                                       |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| macOS Apple silicon | Fixed source archive; static CPU build with system Accelerate  | Fixed source archive; minimal static audio decoder |
| Windows x64         | Fixed source archive; CPU variant DLLs and static MSVC runtime | Fixed Gyan essentials ZIP                          |

macOS preparation requires Xcode command-line tools, CMake, and Make. Windows preparation requires CMake, Visual Studio 2022 or 2026 C++ build tools with the x64 compiler, and the system `tar` utility. Preparation resolves the installed C++ instance through `vswhere` and passes its location to CMake. Visual Studio 2026 requires CMake 4.2 or later. The Windows whisper build selects the static MSVC runtime and bundles ggml's CPU variant DLLs. The upstream loader selects a supported CPU variant from the executable directory, including a generic x64 fallback. OpenMP stays disabled in this build; ggml owns its worker threads. `POSTROVE_SPEECH_CMAKE` selects a CMake executable. `POSTROVE_SPEECH_ARTIFACTS` selects an optional build cache whose filenames are pinned SHA-256 digests. Cached archives receive the same checksum validation as downloads. Preparation verifies the executables on the target system. Each target retains its upstream license texts and source locations. Publication review includes those runtime notices and source-distribution requirements.

Runtime preparation checks archive digests before extraction, records installed-file digests, and replaces the target directory after executable verification. `check()` validates target, versions, installed-file digests, and the model checksum independently. Runtime/model status remains separate from website access and background text-model checks.

Model download is an explicit operation. Calling `transcribe` checks the saved resources. The model download streams a pinned resource into the selected profile and verifies its exact size and SHA-256 before replacing the saved model. A failed or cancelled download retains the previous model file. The model-preparation command requires an absolute profile path; the application can bind `downloadModel(signal)` to an approved setup control.

The default resource is the multilingual `small-q5_1` model, about 181 MiB on disk. Recognition keeps the original language. The model pin identifies the exact quantized bytes used by each result.

## Storage and trust boundary

| Profile path                                             | Content                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `speech/models/`                                         | Explicitly provisioned speech model                                         |
| `speech/media/<sha256>`                                  | Original imported or downloaded media bytes                                 |
| `speech/jobs/<job-hash>/recognition-<index>-<uuid>.json` | Bounded raw recognizer JSON retained for native timing and output diagnosis |
| `speech/jobs/<job-hash>/chunk-<index>.json`              | Completed recognition segments and original time bounds                     |
| `speech/jobs/<job-hash>/.attempt-<uuid>/`                | Current decoded audio and recognizer output; retired after the attempt      |

The main process owns executable paths, profile paths, budgets, and adapter host lists. These inputs stay on trusted main-process interfaces. Media acquisition accepts HTTPS CDN hosts supplied by the source adapter, checks each redirect, and drops request headers when the origin changes. Signed media URLs and task headers stay inside the request boundary. The media store names files by content checksum. Public results contain classified issues and recognized content. Raw recognizer JSON stays within the local profile; native fixture exports select its transcript and language fields. Raw process diagnostics stay inside the process boundary. Existing source records and completed reading results retain their original storage owners.

## Verification scope

[Speech rule tests](../tests/rules/speech.test.ts) cover timestamp validation, exact recognized text, long-audio chunking, digital silence, partial checkpoints, retry, cancellation, dependency state, byte/duration/time budgets, process exit, download integrity, redirect policy, and profile serialization. Their recognizer and decoder responses are controlled fixtures. Native process-boundary tests execute short local Node children.

Live acceptance records the actual operating system, runtime hashes, public sample usage source, decoded duration, recognized output, and observed failures in isolated task evidence. macOS execution, Windows execution, real website media retrieval, recognition quality, and final application wiring each carry their own acceptance result.

```sh
npm run verify:speech-runtime -- --profile /absolute/path/to/isolated-profile --output /absolute/path/to/evidence
```

This command explicitly provisions the pinned model and downloads a checksum-verified public Chinese test wave documented by the sherpa project. It records actual text and elapsed time, checks the sample's time-of-day content, exercises digital silence, a 601-second silent input, and 61 seconds of repeated public speech across 30-second recognition chunks, stops a native recognizer process, and resumes committed chunks. Missing-model and process-failure checks use controlled conditions. [Speech runtime CI](../.github/workflows/speech-runtime.yml) runs the command on Windows x64 for speech-related PRs and saves JSON evidence. Its separate process measurement records elapsed time and working-set samples at 25 ms intervals. Broader speech quality and real website access retain their own acceptance scope.
