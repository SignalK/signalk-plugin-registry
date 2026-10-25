import { test } from "node:test";
import * as assert from "node:assert/strict";
import { slotKeyFor } from "../scripts/slots";
import { shouldTest, PluginResults } from "../scripts/plan-runs";

const fresh = { tested: new Date().toISOString(), server_version: "2.35.1",
  has_changelog: true, has_screenshots: false, held_back_core_deps: [], legacy_deps: [] };

test("slotKeyFor: primary Node keeps the plain slot key", () => {
  assert.equal(slotKeyFor("stable", "24"), "server@stable");
  assert.equal(slotKeyFor("master", "24"), "server@master");
  assert.equal(slotKeyFor("stable", "26"), "server@stable-node26");
});

test("shouldTest: a new plugin version is a change on every Node", () => {
  const results: PluginResults = {};
  for (const node of ["24", "26"]) {
    assert.deepEqual(shouldTest("p", "1.0.0", "stable", node, "2.35.1", results, false),
      { run: true, reason: "plugin_version_change" });
  }
});

test("shouldTest: an added Node on an already scored version is backlog", () => {
  const results: PluginResults = { p: { "1.0.0": { "server@stable": fresh } } };
  assert.deepEqual(shouldTest("p", "1.0.0", "stable", "26", "2.35.1", results, false),
    { run: true, reason: "node_added" });
  assert.deepEqual(shouldTest("p", "1.0.0", "stable", "24", "2.35.1", results, false),
    { run: false });
});

test("shouldTest: a fresh Node 26 slot is not retested", () => {
  const results: PluginResults = {
    p: { "1.0.0": { "server@stable": fresh, "server@stable-node26": fresh } }
  };
  assert.deepEqual(shouldTest("p", "1.0.0", "stable", "26", "2.35.1", results, false),
    { run: false });
});
