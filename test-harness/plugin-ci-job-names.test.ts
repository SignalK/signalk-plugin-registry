import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseJobName } from "../scripts/build-api";

// The real parser build-api.ts runs over the jobs API, imported rather than
// reimplemented — a copy here would pass while the matrix did something else.
//
// GitHub emits a reusable workflow's jobs as "<callerJobKey> / <name>", so
// inputs below carry that prefix the way production does. The "<os> / Node <n>"
// form is only ever seen with it in front — without it the key stripper would
// take the OS for a caller key — so that form is tested exactly as emitted.

const DESKTOP = [
  ["Linux", "linux-x64"],
  ["Linux arm64", "linux-arm64"],
  ["macOS", "macos"],
  ["Windows", "windows"],
] as const;

test("parseJobName: desktop jobs in both name forms", () => {
  for (const [os, platform] of DESKTOP) {
    assert.deepEqual(parseJobName(`test / ${os} / Node 22`), { platform, node: 22 }, os);
    assert.deepEqual(
      parseJobName(`test / Install & Test: ${os} (Node 24)`),
      { platform, node: 24 },
      os,
    );
    assert.deepEqual(
      parseJobName(`Install & Test: ${os} (Node 24)`),
      { platform, node: 24 },
      os,
    );
  }
});

test("parseJobName: any single-word caller key is stripped", () => {
  assert.deepEqual(parseJobName("ci / Linux / Node 22"), {
    platform: "linux-x64",
    node: 22,
  });
  assert.deepEqual(parseJobName("plugin-ci / Install & Test: Windows (Node 22)"), {
    platform: "windows",
    node: 22,
  });
});

test("parseJobName: armv7 in both name forms", () => {
  assert.deepEqual(parseJobName("test / armv7 (Cerbo GX) / Node 20"), {
    platform: "armv7-cerbo",
    node: 20,
  });
  assert.deepEqual(parseJobName("test / Install & Test: armv7 (Cerbo GX, Node 20)"), {
    platform: "armv7-cerbo",
    node: 20,
  });
});

test("parseJobName: integration jobs carry the server version in both forms", () => {
  assert.deepEqual(parseJobName("test / Integration / signalk-server latest / Node 22"), {
    platform: "integration",
    node: 22,
    server_version: "latest",
  });
  assert.deepEqual(parseJobName("test / Integration / signalk-server 2.23.0 / Node 24"), {
    platform: "integration",
    node: 24,
    server_version: "2.23.0",
  });
  assert.deepEqual(parseJobName("test / Integration Test: SK latest (Node 22)"), {
    platform: "integration",
    node: 22,
    server_version: "latest",
  });
  assert.deepEqual(parseJobName("Integration Test: SK 2.23.0 (Node 24)"), {
    platform: "integration",
    node: 24,
    server_version: "2.23.0",
  });
});

// The build, matrix and status jobs are not platform results and must be
// skipped rather than mis-filed under a platform.
test("parseJobName: non-platform jobs are ignored", () => {
  for (const name of [
    "test / Build (Node 24)",
    "test / Compute integration test matrix",
    "test / Validate inputs",
    "test / CI Status",
  ]) {
    assert.equal(parseJobName(name), undefined, name);
  }
});

// An advisory lane must never be recorded as a real platform result. The
// patterns are anchored, so any suffix keeps it out — in either form.
test("parseJobName: experimental lanes are ignored in both forms", () => {
  for (const name of [
    "test / Linux / Node 26 (experimental)",
    "test / Install & Test: Linux (Node 26, experimental)",
    "test / Install & Test: Linux (Node 26) (experimental)",
  ]) {
    assert.equal(parseJobName(name), undefined, name);
  }
});

// A skipped matrix job is emitted with its expressions unexpanded, so its
// name carries no real version. It must be ignored, never recorded as a
// platform result — in either form.
test("parseJobName: skipped matrix jobs with unexpanded expressions are ignored", () => {
  for (const name of [
    "test / Integration / signalk-server ${{ matrix.signalk-server-version }} / Node ${{ matrix.node-version }}",
    "test / Integration Test: SK ${{ matrix.signalk-server-version }} (Node ${{ matrix.node-version }})",
    "test / Linux / Node ${{ matrix.node }}",
    "test / Install & Test: Linux (Node ${{ matrix.node }})",
  ]) {
    assert.equal(parseJobName(name), undefined, name);
  }
});
