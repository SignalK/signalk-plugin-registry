import { test } from "node:test";
import * as assert from "node:assert/strict";
import { isWebappOnly } from "./package-kind";

test("a package with only a webapp keyword is a webapp", () => {
  assert.ok(isWebappOnly(["signalk-webapp"]));
  assert.ok(isWebappOnly(["signalk-embeddable-webapp", "marine"]));
});

test("a plugin with a webapp is not a webapp-only package", () => {
  assert.ok(!isWebappOnly(["signalk-node-server-plugin", "signalk-webapp"]));
});

test("a package without App Store keywords is not a webapp", () => {
  assert.ok(!isWebappOnly([]));
  assert.ok(!isWebappOnly(["signalk", 1]));
});
