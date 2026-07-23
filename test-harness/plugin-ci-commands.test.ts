import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseDeclaredCiCommands } from "./plugin-ci-commands";

function withWorkflows(
  files: Record<string, string>,
): ReturnType<typeof parseDeclaredCiCommands> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-ci-cmd-"));
  try {
    const wf = path.join(dir, ".github", "workflows");
    fs.mkdirSync(wf, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(wf, name), content);
    }
    return parseDeclaredCiCommands(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The concrete Freeboard-SK case from issue #48.
const FREEBOARD_CI = `name: SignalK Plugin CI

on:
  push:
    branches: [main, master]

jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: 'npm run build:all'
      test-command: 'npm run test:ci'
      format-check-command: 'npm run format:check'
`;

test("reads declared build and test commands (Freeboard-SK case)", () => {
  assert.deepEqual(withWorkflows({ "ci.yml": FREEBOARD_CI }), {
    build: "npm run build:all",
    test: "npm run test:ci",
  });
});

test("handles double-quoted and bare scalar values", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: "npm run build"
      test-command: npm run test:ci
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {
    build: "npm run build",
    test: "npm run test:ci",
  });
});

test("matches the reusable path case-insensitively and ignores the @ref", () => {
  const wf = `jobs:
  ci:
    uses: signalk/SignalK-Server/.github/workflows/plugin-ci.yml@v2
    with:
      test-command: 'npm run t'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), { test: "npm run t" });
});

test("returns empty when only one command is declared", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: 'npm run build:all'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {
    build: "npm run build:all",
  });
});

test("ignores a workflow that doesn't call the reusable plugin-ci", () => {
  const wf = `jobs:
  test:
    uses: actions/some-other-workflow.yml@v1
    with:
      build-command: 'npm run nope'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {});
});

test("does not pick up a with: block from an unrelated later job", () => {
  const wf = `jobs:
  lint:
    uses: actions/other.yml@v1
    with:
      build-command: 'should-not-be-read'
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      test-command: 'npm run test:ci'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), { test: "npm run test:ci" });
});

test("finds the caller job across multiple workflow files", () => {
  const other = `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
  const ci = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: 'npm run build:all'
      test-command: 'npm run test:ci'
`;
  assert.deepEqual(withWorkflows({ "release.yml": other, "ci.yml": ci }), {
    build: "npm run build:all",
    test: "npm run test:ci",
  });
});

test("no .github/workflows directory yields empty", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-ci-cmd-none-"));
  try {
    assert.deepEqual(parseDeclaredCiCommands(dir), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a command with shell metacharacters", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: 'npm run build && curl evil.example'
      test-command: 'npm run test:ci'
`;
  // The build-command is dropped (metachars); the clean test-command survives.
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), { test: "npm run test:ci" });
});

test("rejects commands that aren't an npm-script invocation", () => {
  // No metacharacters, but neither is a plain `npm run <script>` call: a bare
  // program, and `npm install` (whose lifecycle scripts would sidestep the
  // --ignore-scripts install boundary).
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: 'npm install'
      test-command: 'curl evil.example'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {});
});

test("accepts the run-script alias", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      test-command: 'npm run-script test:ci'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {
    test: "npm run-script test:ci",
  });
});

test("rejects a YAML flow-sequence value (parses to a literal string)", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      build-command: [npm, run, build]
      test-command: 'npm run test:ci'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), { test: "npm run test:ci" });
});

test("reads commands when with: precedes uses: (YAML order isn't semantic)", () => {
  const wf = `jobs:
  test:
    with:
      build-command: 'npm run build:all'
      test-command: 'npm run test:ci'
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {
    build: "npm run build:all",
    test: "npm run test:ci",
  });
});

test("skips commented-out command lines", () => {
  const wf = `jobs:
  test:
    uses: SignalK/signalk-server/.github/workflows/plugin-ci.yml@master
    with:
      # build-command: 'npm run old'
      build-command: 'npm run build:all'
`;
  assert.deepEqual(withWorkflows({ "ci.yml": wf }), {
    build: "npm run build:all",
  });
});
