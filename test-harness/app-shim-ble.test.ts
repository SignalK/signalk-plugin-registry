import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectProviders, DetectionResult } from "./detect-providers";

async function detectFixture(indexJs: string): Promise<DetectionResult> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-ble-shim-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "ble-fixture", version: "1.0.0", main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), indexJs);
    return await detectProviders(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PROVIDER_PLUGIN = `
module.exports = function (app) {
  return {
    id: "ble-fixture",
    name: "ble fixture",
    schema: {},
    start: () => {
      app.registerBLEProvider({ name: "fixture provider", methods: {} })
    },
    stop: () => {}
  }
}
`;

const API_REGISTER_PLUGIN = `
module.exports = function (app) {
  return {
    id: "ble-fixture",
    name: "ble fixture",
    schema: {},
    start: () => {
      app.bleApi.register("ble-fixture", { name: "fixture provider", methods: {} })
    },
    stop: () => {}
  }
}
`;

// The consumer shape from bt-sensors-plugin-sk PR #137: feature-detect the
// API, subscribe to advertisements in start(), unsubscribe in stop().
const CONSUMER_PLUGIN = `
module.exports = function (app) {
  let unsubscribe
  return {
    id: "ble-fixture",
    name: "ble fixture",
    schema: {},
    start: () => {
      const available = app.bleApi && typeof app.bleApi.onAdvertisement === "function"
      if (!available) throw new Error("BLE API not detected")
      if (app.bleApi.localBluetoothManaged !== false) {
        throw new Error("localBluetoothManaged should be false in the harness")
      }
      unsubscribe = app.bleApi.onAdvertisement("ble-fixture", () => {})
    },
    stop: () => {
      if (typeof unsubscribe === "function") unsubscribe()
    }
  }
}
`;

// Calls a rejecting GATT stub without await or .catch. The dangling
// rejection must not surface as an unhandled rejection — in production
// that would kill the detection subprocess (detect-sandboxed.ts treats
// those as fatal) and mislabel a loaded plugin as loads: false; in this
// in-process test it would kill the test run itself.
const FIRE_AND_FORGET_PLUGIN = `
module.exports = function (app) {
  return {
    id: "ble-fixture",
    name: "ble fixture",
    schema: {},
    start: () => {
      app.bleApi.connectGATT("aa:bb:cc:dd:ee:ff", "ble-fixture")
    },
    stop: () => {}
  }
}
`;

const GATT_CONSUMER_PLUGIN = `
module.exports = function (app) {
  return {
    id: "ble-fixture",
    name: "ble fixture",
    schema: {},
    start: async () => {
      await app.bleApi.connectGATT("aa:bb:cc:dd:ee:ff", "ble-fixture")
    },
    stop: () => {}
  }
}
`;

test("registerBLEProvider is captured as a ble provider", async () => {
  const result = await detectFixture(PROVIDER_PLUGIN);
  assert.equal(result.loads, true);
  assert.equal(result.activates, true);
  assert.ok(result.providers.includes("ble"), `providers: ${result.providers}`);
  assert.ok(!result.unstubbedAccesses.includes("registerBLEProvider"));
});

test("bleApi.register is captured as a ble provider", async () => {
  const result = await detectFixture(API_REGISTER_PLUGIN);
  assert.equal(result.activates, true);
  assert.ok(result.providers.includes("ble"), `providers: ${result.providers}`);
});

test("a BLE consumer activates against the stubbed API", async () => {
  const result = await detectFixture(CONSUMER_PLUGIN);
  assert.equal(result.loads, true);
  assert.equal(result.activates, true, result.activationError);
  assert.ok(!result.unstubbedAccesses.includes("bleApi"));
  assert.deepEqual(result.providers, []);
});

test("a fire-and-forget GATT call cannot kill detection", async () => {
  const result = await detectFixture(FIRE_AND_FORGET_PLUGIN);
  assert.equal(result.loads, true);
  assert.equal(result.activates, true, result.activationError);
});

test("GATT calls fail on the plugin's terms with upstream's no-provider error", async () => {
  const result = await detectFixture(GATT_CONSUMER_PLUGIN);
  assert.equal(result.loads, true);
  assert.equal(result.activates, false);
  assert.match(
    String(result.activationError),
    /No provider with GATT support can see aa:bb:cc:dd:ee:ff/,
  );
});
