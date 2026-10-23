import { test } from "node:test";
import * as assert from "node:assert/strict";
import { sourceRefCandidates } from "./source-ref";

const SHA = "7ed3f478c5cb86d1ea7825b840e1742b5ce40f58";

test("tries the published commit, then release tags, then the default branch", () => {
  assert.deepEqual(sourceRefCandidates("signalk-container", "1.35.2", SHA), [
    { kind: "git-head", ref: SHA },
    { kind: "tag", ref: "refs/tags/v1.35.2" },
    { kind: "tag", ref: "refs/tags/1.35.2" },
    { kind: "tag", ref: "refs/tags/signalk-container@1.35.2" },
    { kind: "default-branch", ref: "HEAD" },
  ]);
});

test("skips the commit when npm recorded no gitHead", () => {
  const kinds = sourceRefCandidates("p", "1.0.0", undefined).map((c) => c.kind);
  assert.deepEqual(kinds, ["tag", "tag", "tag", "default-branch"]);
});

test("rejects a gitHead that is not a full commit SHA", () => {
  for (const bad of ["7ed3f47", "HEAD", "main", `${SHA}; rm -rf /`, ""]) {
    const kinds = sourceRefCandidates("p", "1.0.0", bad).map((c) => c.kind);
    assert.ok(!kinds.includes("git-head"), bad);
  }
});

test("names scoped packages' monorepo tags", () => {
  const refs = sourceRefCandidates("@signalk/x", "2.0.0-beta.1", undefined).map(
    (c) => c.ref,
  );
  assert.ok(refs.includes("refs/tags/@signalk/x@2.0.0-beta.1"));
});

test("falls back to the default branch alone for a non-semver version", () => {
  assert.deepEqual(sourceRefCandidates("p", "latest", undefined), [
    { kind: "default-branch", ref: "HEAD" },
  ]);
});
