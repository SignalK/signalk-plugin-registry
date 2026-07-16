import { test } from "node:test";
import * as assert from "node:assert/strict";
import { computeScore, TestResults } from "./score";

// A run that earns every point: 20 install + 15 load + 15 activate +
// 5 schema + 25 tests + 20 audit, with no changelog/screenshots penalty.
function fullMarks(): TestResults {
  return {
    installs: true,
    loads: true,
    activates: true,
    detectedProviders: [],
    hasSchema: true,
    hasOwnTests: true,
    ownTestsPass: true,
    auditCritical: 0,
    auditHigh: 0,
    auditModerate: 0,
    hasInstallScripts: false,
    hasChangelog: true,
    hasScreenshots: true,
    heldBackCoreDeps: [],
  };
}

test("no held-back deps leaves score and badges unchanged", () => {
  const { composite, badges } = computeScore(fullMarks());
  assert.equal(composite, 100);
  assert.ok(!badges.includes("holds-back-core-deps"));
});

test("held-back core dep costs 80 and adds the badge", () => {
  const results = fullMarks();
  results.heldBackCoreDeps = [
    { pkg: "@signalk/server-api", declared: "~2.9.0", latest: "2.30.0" },
  ];
  const { composite, badges } = computeScore(results);
  assert.equal(composite, 20);
  assert.ok(badges.includes("holds-back-core-deps"));
});

test("penalty is flat, not per package", () => {
  const results = fullMarks();
  results.heldBackCoreDeps = [
    { pkg: "@signalk/server-api", declared: "~2.9.0", latest: "2.30.0" },
    { pkg: "@canboat/canboatjs", declared: "3.1.0", latest: "3.20.0" },
  ];
  assert.equal(computeScore(results).composite, 20);
});

test("composite clamps at 0 for low-scoring held-back plugins", () => {
  const results = fullMarks();
  results.loads = false;
  results.activates = false;
  results.hasSchema = false;
  results.hasOwnTests = false;
  results.ownTestsPass = false;
  results.auditCritical = 1;
  results.hasChangelog = false;
  results.hasScreenshots = false;
  results.heldBackCoreDeps = [
    { pkg: "@signalk/server-api", declared: "2.9.0", latest: "2.30.0" },
  ];
  assert.equal(computeScore(results).composite, 0);
});
