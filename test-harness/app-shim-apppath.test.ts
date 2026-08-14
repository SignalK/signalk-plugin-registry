import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectProviders, DetectionResult } from "./detect-providers";

async function detectFixture(
  indexJs: string,
  serverPath: string | undefined,
): Promise<DetectionResult> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-apppath-"));
  const prior = process.env.SIGNALK_SERVER_PATH;
  try {
    if (serverPath === undefined) delete process.env.SIGNALK_SERVER_PATH;
    else process.env.SIGNALK_SERVER_PATH = serverPath;
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "apppath-fixture", version: "1.0.0", main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), indexJs);
    return await detectProviders(dir);
  } finally {
    if (prior === undefined) delete process.env.SIGNALK_SERVER_PATH;
    else process.env.SIGNALK_SERVER_PATH = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The bt-sensors pattern: server internals resolved by string-concatenating
// against app.config.appPath, relying on its trailing separator.
const INTERNALS_CONSUMER_PLUGIN = `
const fs = require("fs")
module.exports = function (app) {
  return {
    id: "apppath-fixture",
    name: "apppath fixture",
    schema: {},
    start: () => {
      const marker = app.config.appPath + "dist" + "/marker.js"
      if (require(marker).ok !== true) throw new Error("bad marker at " + marker)
    },
    stop: () => {}
  }
}
`;

const FALLBACK_PLUGIN = `
const fs = require("fs")
module.exports = function (app) {
  return {
    id: "apppath-fixture",
    name: "apppath fixture",
    schema: {},
    start: () => {
      if (!fs.existsSync(app.config.appPath)) {
        throw new Error("appPath does not exist: " + app.config.appPath)
      }
      if (!app.config.appPath.endsWith(require("path").sep)) {
        throw new Error("appPath lost its trailing separator: " + app.config.appPath)
      }
    },
    stop: () => {}
  }
}
`;

test("SIGNALK_SERVER_PATH becomes appPath with a trailing separator", async () => {
  const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-fake-server-"));
  try {
    fs.mkdirSync(path.join(serverDir, "dist"));
    fs.writeFileSync(
      path.join(serverDir, "dist", "marker.js"),
      "module.exports = { ok: true }",
    );
    const result = await detectFixture(INTERNALS_CONSUMER_PLUGIN, serverDir);
    assert.equal(result.loads, true);
    assert.equal(result.activates, true, result.activationError);
  } finally {
    fs.rmSync(serverDir, { recursive: true, force: true });
  }
});

test("without SIGNALK_SERVER_PATH the appPath tmpdir fallback still exists", async () => {
  const result = await detectFixture(FALLBACK_PLUGIN, undefined);
  assert.equal(result.activates, true, result.activationError);
});

test("a non-existent SIGNALK_SERVER_PATH falls back to the tmpdir", async () => {
  const result = await detectFixture(
    FALLBACK_PLUGIN,
    "/nonexistent/sk-server-path",
  );
  assert.equal(result.activates, true, result.activationError);
});
