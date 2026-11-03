import { isAbsolute, resolve } from "node:path";
import { SpeechRuntime } from "../../src/main/services/speech/runtime";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--profile" || !isAbsolute(args[1])) {
  throw new Error(
    "Usage: npm run setup:speech-model -- --profile /absolute/path/to/profile",
  );
}
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
const runtime = new SpeechRuntime(resolve(".runtime"), resolve(args[1]));
await runtime.downloadModel(controller.signal);
console.log("Speech model verified in the selected profile");
