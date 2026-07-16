import { test } from "node:test";
import * as assert from "node:assert/strict";
import { findHeldBackCoreDeps } from "./core-deps";

const LATEST = {
  "@signalk/server-api": "2.30.0",
  "@canboat/canboatjs": "3.20.0",
};

function check(range: string, pkg = "@signalk/server-api") {
  return findHeldBackCoreDeps([{ pkg, range }], LATEST);
}

test("tilde range below latest same-major is flagged", () => {
  assert.deepEqual(check("~2.9.0"), [
    { pkg: "@signalk/server-api", declared: "~2.9.0", latest: "2.30.0" },
  ]);
});

test("exact pin below latest same-major is flagged", () => {
  assert.equal(check("2.9.0").length, 1);
});

test("caret range that reaches latest is not flagged", () => {
  assert.deepEqual(check("^2.9.0"), []);
});

test("range on an older major is not flagged", () => {
  assert.deepEqual(check("^1.0.0"), []);
});

test("upper-bounded range starting below the latest major is not flagged", () => {
  assert.deepEqual(check("<2.10.0"), []);
});

test("wildcard, empty, and dist-tag ranges are skipped", () => {
  for (const range of ["*", "", "latest", "beta"]) {
    assert.deepEqual(check(range), [], `range: ${JSON.stringify(range)}`);
  }
});

test("non-registry specs are skipped", () => {
  for (const range of [
    "github:owner/repo",
    "git+https://github.com/owner/repo.git",
    "git://github.com/owner/repo.git",
    "file:../local",
    "link:../local",
    "workspace:^",
    "https://example.com/pkg.tgz",
    "owner/repo",
  ]) {
    assert.deepEqual(check(range), [], `range: ${range}`);
  }
});

test("package with no latest lookup result is skipped", () => {
  assert.deepEqual(
    findHeldBackCoreDeps([{ pkg: "@signalk/streams", range: "~6.0.0" }], LATEST),
    [],
  );
});

test("non-core packages are not the module's concern", () => {
  // findHeldBackCoreDeps trusts its caller to pre-filter to CORE_PACKAGES,
  // but an unknown package never has a latest entry, so it is skipped.
  assert.deepEqual(
    findHeldBackCoreDeps([{ pkg: "lodash", range: "~4.17.0" }], LATEST),
    [],
  );
});

test("first-seen range wins when a package is declared twice", () => {
  const result = findHeldBackCoreDeps(
    [
      { pkg: "@signalk/server-api", range: "~2.9.0" },
      { pkg: "@signalk/server-api", range: "~2.8.0" },
    ],
    LATEST,
  );
  assert.deepEqual(result, [
    { pkg: "@signalk/server-api", declared: "~2.9.0", latest: "2.30.0" },
  ]);
});

test("multiple held-back core packages each get an entry", () => {
  const result = findHeldBackCoreDeps(
    [
      { pkg: "@signalk/server-api", range: "2.9.0" },
      { pkg: "@canboat/canboatjs", range: "~3.1.0" },
    ],
    LATEST,
  );
  assert.equal(result.length, 2);
});
