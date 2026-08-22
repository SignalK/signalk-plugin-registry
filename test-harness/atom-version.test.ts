import { test } from "node:test";
import * as assert from "node:assert/strict";
import { atomMentionsVersion } from "./atom-version";

// The real shape of https://github.com/openwatersio/aiscast/releases.atom.
// The tag carries a package-name prefix (`signalk-plugin-v0.1.4`) and the
// title separates name from version with a space — neither of which the
// original fixed-substring matcher recognised, so a repo that publishes
// per-version release notes still lost the changelog point.
const AISCAST_ATOM = `<entry>
  <id>tag:github.com,2008:Repository/1340948238/signalk-plugin-v0.1.4</id>
  <title>signalk-aiscast 0.1.4</title>
</entry>`;

test("matches a monorepo tag prefixed with the package name", () => {
  assert.equal(atomMentionsVersion(AISCAST_ATOM, "0.1.4"), true);
});

test("matches the other common monorepo tag conventions", () => {
  assert.equal(atomMentionsVersion("<id>x/pkg@1.2.3</id>", "1.2.3"), true);
  assert.equal(atomMentionsVersion("<id>x/pkg-v1.2.3</id>", "1.2.3"), true);
  assert.equal(atomMentionsVersion("<id>x/pkg/v1.2.3</id>", "1.2.3"), true);
  assert.equal(atomMentionsVersion("<title>sk 1.2.3</title>", "1.2.3"), true);
});

// The 565 plugins that tag plainly must keep scoring exactly as before.
test("still matches the plain tag forms", () => {
  assert.equal(atomMentionsVersion(">1.2.3<", "1.2.3"), true);
  assert.equal(atomMentionsVersion(">v1.2.3<", "1.2.3"), true);
  assert.equal(atomMentionsVersion("/v1.2.3<", "1.2.3"), true);
  assert.equal(atomMentionsVersion(":v1.2.3<", "1.2.3"), true);
});

test("does not match a longer version that merely starts the same", () => {
  assert.equal(atomMentionsVersion(">0.1.40<", "0.1.4"), false);
  assert.equal(atomMentionsVersion("<id>other-pkg-v0.1.44</id>", "0.1.4"), false);
});

test("does not match a version embedded in surrounding digits", () => {
  assert.equal(atomMentionsVersion(">10.1.4<", "0.1.4"), false);
  assert.equal(atomMentionsVersion("<id>x/11.0.1.40</id>", "1.2.3"), false);
});

// A prerelease is a different version: the release check must not accept it.
test("does not accept a prerelease in place of the release", () => {
  assert.equal(atomMentionsVersion(">1.2.3-beta.1<", "1.2.3"), false);
});

// Proves the version is regex-escaped: an unescaped `+`/`.` would misbehave.
test("matches a prerelease version when that is what was asked for", () => {
  assert.equal(atomMentionsVersion(">v1.0.0-rc.1<", "1.0.0-rc.1"), true);
  assert.equal(atomMentionsVersion(">v1.0.0+build.5<", "1.0.0+build.5"), true);
});

test("an empty version never matches", () => {
  assert.equal(atomMentionsVersion(AISCAST_ATOM, ""), false);
  assert.equal(atomMentionsVersion(AISCAST_ATOM, "   "), false);
});
