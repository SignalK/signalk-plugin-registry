import * as fs from "fs";
import * as path from "path";
import { detectProviders, DetectionResult } from "./detect-providers";

const pluginPath = process.argv[2];
const outputFile = process.argv[3];

if (!pluginPath || !outputFile) {
  console.error(
    "Usage: node detect-sandboxed.js <plugin-path> <output-file>",
  );
  process.exit(1);
}

// A plugin can kill this process outside the detection promise chain — a
// dangling import() in a constructor's .then(), a timer callback that
// throws after start() returned. Without these handlers the process dies
// before writing its result file, and the runner can only report the
// generic "sandboxed detection failed". Writing a crash result here puts
// the plugin's real error into the published record instead.
function crashResult(kind: string, err: unknown): DetectionResult {
  // The crash value is plugin-controlled: stringifying it can throw
  // (hostile toString/getters) and its length is unbounded, but it flows
  // into the published record — so guard the conversion and cap the size.
  let msg: string;
  try {
    msg = (err instanceof Error ? String(err.message) : String(err)).slice(0, 500);
  } catch {
    msg = "unprintable crash value";
  }
  return {
    pluginId: path.basename(pluginPath),
    pluginName: path.basename(pluginPath),
    providers: [],
    putHandlers: [],
    httpRoutes: [],
    unstubbedAccesses: [],
    loads: false,
    loadError: `${kind}: ${msg}`,
    activates: false,
    activatesWithoutConfig: false,
    statusMessages: [],
    errorMessages: [],
    hasSchema: false,
  };
}

function dieWith(kind: string): (err: unknown) => void {
  return (err: unknown) => {
    // The result file is the payload — write it before anything that could
    // conceivably throw. A throw inside an uncaughtException listener
    // aborts the process with nothing written.
    const result = crashResult(kind, err);
    try {
      fs.writeFileSync(outputFile, JSON.stringify(result));
    } catch {}
    try {
      console.error(`[detect-sandboxed] ${result.loadError}`);
    } catch {}
    process.exit(1);
  };
}

process.on("uncaughtException", dieWith("uncaught exception"));
process.on("unhandledRejection", dieWith("unhandled rejection"));

detectProviders(pluginPath)
  .then((result) => {
    fs.writeFileSync(outputFile, JSON.stringify(result));
    process.exit(0);
  })
  .catch(dieWith("detection failed"));
