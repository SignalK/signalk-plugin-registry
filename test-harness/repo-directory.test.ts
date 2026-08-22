import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  sanitizeRepoDirectory,
  resolveWithinClone,
  isWorkspaceLinked,
} from "./repo-directory";

// The values real registry plugins publish today.
const REAL_WORLD = [
  "signalk-plugin", // signalk-aiscast
  "packages/resources-provider-plugin", // @signalk/resources-provider
  "cerbo/telltale-signalk-plugin", // signalk-telltale-plugin
  "consumer-plugin", // signalk-victron-ble-consumer
];

test("accepts the directory values real plugins publish", () => {
  for (const value of REAL_WORLD) {
    assert.equal(sanitizeRepoDirectory(value), value);
  }
});

test("normalises a leading ./ and a trailing slash", () => {
  assert.equal(sanitizeRepoDirectory("./sub"), "sub");
  assert.equal(sanitizeRepoDirectory("sub/"), "sub");
  assert.equal(sanitizeRepoDirectory("  sub  "), "sub");
});

// Proves the traversal check splits on segments instead of scanning for the
// substring "..", which would wrongly reject this legitimate directory name.
test("accepts a directory name that merely contains dots", () => {
  assert.equal(sanitizeRepoDirectory("foo..bar"), "foo..bar");
});

test("rejects path traversal and absolute paths", () => {
  for (const value of ["..", "../x", "a/../../b", "/etc", "a//b", ".", "./"]) {
    assert.equal(sanitizeRepoDirectory(value), null, value);
  }
});

test("rejects shell metacharacters and other unsafe input", () => {
  const unsafe = [
    "a`whoami`",
    "a;rm -rf /",
    "a b",
    "a|b",
    "a$b",
    "a\\b",
    "~/x",
    "a\u0000b",
    "pkg\nrm",
    "C:\\x",
    "ünïcode",
    "a*b",
    "x".repeat(300),
    "",
    "   ",
  ];
  for (const value of unsafe) {
    assert.equal(sanitizeRepoDirectory(value), null, JSON.stringify(value));
  }
});

// npm metadata is arbitrary JSON: the field need not be a string at all.
test("rejects non-string values", () => {
  for (const value of [undefined, null, 42, {}, ["a"], true]) {
    assert.equal(sanitizeRepoDirectory(value), null, String(value));
  }
});

function withClone(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sk-repo-dir-"));
  try {
    run(fs.realpathSync(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("resolves a subdirectory that exists inside the clone", () => {
  withClone((dir) => {
    fs.mkdirSync(path.join(dir, "packages", "plug"), { recursive: true });
    assert.equal(
      resolveWithinClone(dir, "packages/plug"),
      path.join(dir, "packages", "plug"),
    );
  });
});

test("returns null when the subdirectory is absent from the clone", () => {
  withClone((dir) => {
    assert.equal(resolveWithinClone(dir, "not-here"), null);
  });
});

// Defence in depth: even a symlink inside the clone must not escape it.
test("returns null for a symlink pointing outside the clone", () => {
  withClone((dir) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sk-outside-"));
    try {
      fs.symlinkSync(outside, path.join(dir, "escape"));
      assert.equal(resolveWithinClone(dir, "escape"), null);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

// Mirrors what `npm install` leaves behind for a workspace: the dependencies
// hoist to the root and the package is linked back in by name. Note the
// workspace package has no node_modules of its own — that is precisely why
// the link, and not a node_modules check, is the discriminator.
test("detects a subdirectory that is a real npm workspace", () => {
  withClone((dir) => {
    const pkgDir = path.join(dir, "packages", "plug");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "plug", version: "1.0.0" }),
    );
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    fs.symlinkSync(pkgDir, path.join(dir, "node_modules", "plug"));
    assert.equal(isWorkspaceLinked(dir, pkgDir), true);
  });
});

test("does not treat an unlinked subdirectory as a workspace", () => {
  withClone((dir) => {
    const pkgDir = path.join(dir, "sub");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "sub", version: "1.0.0" }),
    );
    // The root install ran but never linked this package back in.
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    assert.equal(isWorkspaceLinked(dir, pkgDir), false);
  });
});

// A same-named package pulled from the registry is not this subdirectory.
test("does not mistake a real dependency of the same name for a workspace link", () => {
  withClone((dir) => {
    const pkgDir = path.join(dir, "sub");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "sub", version: "1.0.0" }),
    );
    const installed = path.join(dir, "node_modules", "sub");
    fs.mkdirSync(installed, { recursive: true });
    assert.equal(isWorkspaceLinked(dir, pkgDir), false);
  });
});
