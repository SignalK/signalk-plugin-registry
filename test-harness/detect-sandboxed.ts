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
  // The crash value is plugin-controlled and stringifying it can itself
  // throw (hostile toString/getters); a crash handler must never throw.
  let msg: string;
  try {
    msg = err instanceof Error ? String(err.message) : String(err);
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
    const result = crashResult(kind, err);
    console.error(`[detect-sandboxed] ${result.loadError}`);
    try {
      fs.writeFileSync(outputFile, JSON.stringify(result));
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
