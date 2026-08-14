import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// These tests exercise the compiled subprocess entry the runner forks, so
// the crash handlers are tested exactly as they run in production: a plugin
// that kills the process must still leave a result file with its real error.
const SCRIPT = path.join(__dirname, "detect-sandboxed.js");

function runDetection(indexJs: string): {
  status: number | null;
  result: Record<string, unknown> | undefined;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-detect-crash-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "crash-fixture", version: "1.0.0", main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), indexJs);
    const outputFile = path.join(dir, "result.json");
    const proc = spawnSync(process.execPath, [SCRIPT, dir, outputFile], {
      timeout: 15_000,
      encoding: "utf-8",
    });
    const result = fs.existsSync(outputFile)
      ? JSON.parse(fs.readFileSync(outputFile, "utf-8"))
      : undefined;
    return { status: proc.status, result };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// start() holds detection on the event loop for 100ms so the 10ms crash
// timer deterministically fires mid-detection — the bt-sensors shape, where
// a dangling import() rejected while the harness was still probing.
const UNHANDLED_REJECTION_PLUGIN = `
module.exports = function (app) {
  return {
    id: "crash-fixture",
    name: "crash fixture",
    schema: {},
    start: () => {
      setTimeout(() => { Promise.reject(new Error("fixture async boom")) }, 10)
      return new Promise((resolve) => setTimeout(resolve, 100))
    },
    stop: () => {}
  }
}
`;

const UNCAUGHT_EXCEPTION_PLUGIN = `
module.exports = function (app) {
  return {
    id: "crash-fixture",
    name: "crash fixture",
    schema: {},
    start: () => {
      setTimeout(() => { throw new Error("fixture sync boom") }, 10)
      return new Promise((resolve) => setTimeout(resolve, 100))
    },
    stop: () => {}
  }
}
`;

const HEALTHY_PLUGIN = `
module.exports = function (app) {
  return {
    id: "crash-fixture",
    name: "crash fixture",
    schema: {},
    start: () => {},
    stop: () => {}
  }
}
`;

test("unhandled rejection mid-detection still writes a result with the real error", () => {
  const { status, result } = runDetection(UNHANDLED_REJECTION_PLUGIN);
  assert.equal(status, 1);
  assert.ok(result, "crash result file was written");
  assert.equal(result.loads, false);
  assert.equal(result.activates, false);
  assert.match(String(result.loadError), /^unhandled rejection: /);
  assert.match(String(result.loadError), /fixture async boom/);
});

test("uncaught exception from a plugin timer still writes a result with the real error", () => {
  const { status, result } = runDetection(UNCAUGHT_EXCEPTION_PLUGIN);
  assert.equal(status, 1);
  assert.ok(result, "crash result file was written");
  assert.equal(result.loads, false);
  assert.match(String(result.loadError), /^uncaught exception: /);
  assert.match(String(result.loadError), /fixture sync boom/);
});

test("a healthy plugin is unaffected by the crash handlers", () => {
  const { status, result } = runDetection(HEALTHY_PLUGIN);
  assert.equal(status, 0);
  assert.ok(result, "result file was written");
  assert.equal(result.loads, true);
  assert.equal(result.activates, true);
  assert.equal(result.loadError, undefined);
});
