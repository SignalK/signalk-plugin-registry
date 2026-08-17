import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  MAX_BUNDLE_DEPTH,
  MAX_BUNDLE_FILES,
  checkLegacyDeps,
  findLegacyBaconjs,
  findLegacyReact,
  findSharedReactMajors,
} from "./legacy-deps";

function bacon(range: string) {
  return findLegacyBaconjs([{ pkg: "baconjs", range }]);
}

test("baconjs ranges that cannot reach 3.x are flagged", () => {
  for (const range of ["^0.7.88", "^1.0.1", "~2.0.9", "1.0.1", "<3"]) {
    assert.deepEqual(
      bacon(range),
      { pkg: "baconjs", found: range, required: ">=3" },
      `range: ${range}`,
    );
  }
});

test("baconjs ranges that can resolve to 3.x are not flagged", () => {
  for (const range of ["^3.0.0", "^3.0.23", ">=1", "*", ""]) {
    assert.equal(bacon(range), null, `range: ${JSON.stringify(range)}`);
  }
});

test("baconjs dist-tags and non-registry specs are skipped", () => {
  for (const range of [
    "latest",
    "github:baconjs/bacon.js",
    "git+https://github.com/baconjs/bacon.js.git",
    "file:../bacon",
  ]) {
    assert.equal(bacon(range), null, `range: ${range}`);
  }
});

test("other packages are ignored", () => {
  assert.equal(
    findLegacyBaconjs([{ pkg: "react", range: "^16.13.1" }]),
    null,
  );
});

// Snippets lifted from real published bundles.
const WEBPACK_R16 = 'l("react","16.14.0",(()=>E.e(540).then((()=>()=>E(6540)))))';
// Curried register form emitted by newer webpack (bt-sensors, shelly2, calibration).
const WEBPACK_R16_CURRIED = ')("react","16.14.0"),e[t]=u.length?Promise.all(u)';
const WEBPACK_R19 = 'l("react","19.2.6",(()=>E.e(540)';
const VITE_R19 =
  "n={react:{name:`react`,version:`19.2.8`,scope:[`default`],loaded:!1}}";
const VITE_R16_DQ = 'n={react:{name:"react",version:"16.14.0",scope:["default"]}}';
// import:false remote — consumes the host's React, registers no version.
const CONSUME_ONLY = 'loadSingleton("default", "react", false)';
// requiredVersion arrays and other 16.x strings must not count as a registration.
const REQUIRED_ONLY = '"react",!1,[1,16,14,0]';

test("finds registered React majors in webpack and vite bundles", () => {
  assert.deepEqual(findSharedReactMajors(WEBPACK_R16), [16]);
  assert.deepEqual(findSharedReactMajors(WEBPACK_R16_CURRIED), [16]);
  assert.deepEqual(findSharedReactMajors(WEBPACK_R19), [19]);
  assert.deepEqual(findSharedReactMajors(VITE_R19), [19]);
  assert.deepEqual(findSharedReactMajors(VITE_R16_DQ), [16]);
});

test("consume-only remotes register no React version", () => {
  assert.deepEqual(findSharedReactMajors(CONSUME_ONLY), []);
  assert.deepEqual(findSharedReactMajors(REQUIRED_ONLY), []);
});

test("React below 19 is flagged, 19 is not", () => {
  assert.deepEqual(findLegacyReact([WEBPACK_R16]), {
    pkg: "react",
    found: "16",
    required: ">=19",
  });
  assert.equal(findLegacyReact([WEBPACK_R19, VITE_R19]), null);
  assert.equal(findLegacyReact([CONSUME_ONLY]), null);
  assert.equal(findLegacyReact([]), null);
});

test("a legacy chunk anywhere in the bundle set is enough", () => {
  assert.equal(findLegacyReact([WEBPACK_R19, VITE_R16_DQ])?.pkg, "react");
});

// --- checkLegacyDeps against on-disk fixtures ---

function fixture(pkg: object, files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-deps-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test("plugin with neither is clean", () => {
  const dir = fixture({
    name: "p",
    keywords: ["signalk-node-server-plugin"],
    dependencies: { lodash: "^4" },
  });
  assert.deepEqual(checkLegacyDeps(dir), []);
});

test("baconjs in dependencies is flagged, in devDependencies is not", () => {
  const dep = fixture({ name: "p", dependencies: { baconjs: "^0.7.88" } });
  assert.deepEqual(checkLegacyDeps(dep), [
    { pkg: "baconjs", found: "^0.7.88", required: ">=3" },
  ]);
  const peer = fixture({ name: "p", peerDependencies: { baconjs: "^1.0.1" } });
  assert.equal(checkLegacyDeps(peer).length, 1);
  const dev = fixture({ name: "p", devDependencies: { baconjs: "^0.7.88" } });
  assert.deepEqual(checkLegacyDeps(dev), []);
});

test("embedded webapp with a React 16 bundle under public/ is flagged", () => {
  const dir = fixture(
    { name: "p", keywords: ["signalk-plugin-configurator"] },
    { "public/remoteEntry.js": WEBPACK_R16_CURRIED },
  );
  assert.deepEqual(checkLegacyDeps(dir), [
    { pkg: "react", found: "16", required: ">=19" },
  ]);
});

test("vite remote registers React in a chunk, not remoteEntry.js", () => {
  const dir = fixture(
    { name: "p", keywords: ["signalk-embeddable-webapp"] },
    {
      "public/remoteEntry.js": "import{t}from'./assets/x.js'",
      "public/assets/x.js": VITE_R16_DQ,
    },
  );
  assert.equal(checkLegacyDeps(dir)[0]?.pkg, "react");
});

test("React 16 bundle is ignored without an embedded-webapp keyword", () => {
  const dir = fixture(
    { name: "p", keywords: ["signalk-webapp"] },
    { "public/remoteEntry.js": WEBPACK_R16 },
  );
  assert.deepEqual(checkLegacyDeps(dir), []);
});

test("bundles inside node_modules are not scanned", () => {
  const dir = fixture(
    { name: "p", keywords: ["signalk-plugin-configurator"] },
    {
      "public/remoteEntry.js": WEBPACK_R19,
      "public/node_modules/x/index.js": WEBPACK_R16,
    },
  );
  assert.deepEqual(checkLegacyDeps(dir), []);
});

test("both findings are reported together", () => {
  const dir = fixture(
    {
      name: "p",
      keywords: ["signalk-plugin-configurator"],
      dependencies: { baconjs: "^0.7.88" },
    },
    { "public/remoteEntry.js": WEBPACK_R16 },
  );
  assert.deepEqual(
    checkLegacyDeps(dir).map((d) => d.pkg),
    ["baconjs", "react"],
  );
});

test("bundle walk stops below the depth limit", () => {
  const deep = "public/" + "d/".repeat(MAX_BUNDLE_DEPTH + 1) + "chunk.js";
  const dir = fixture(
    { name: "p", keywords: ["signalk-embeddable-webapp"] },
    { [deep]: WEBPACK_R16 },
  );
  assert.deepEqual(checkLegacyDeps(dir), []);
});

test("bundle walk stops at the file cap", () => {
  // Root files are all counted before any subdirectory is descended, so a
  // chunk one level down is deterministically file MAX_BUNDLE_FILES + 1.
  const files: Record<string, string> = {};
  for (let i = 0; i < MAX_BUNDLE_FILES; i++) files[`public/pad-${i}.js`] = "";
  files["public/assets/chunk.js"] = WEBPACK_R16;
  const dir = fixture(
    { name: "p", keywords: ["signalk-embeddable-webapp"] },
    files,
  );
  assert.deepEqual(checkLegacyDeps(dir), []);
});

test("symlinked bundles and a symlinked public/ are not followed", () => {
  const outside = fixture({ name: "o" }, { "chunk.js": WEBPACK_R16 });
  const dir = fixture({ name: "p", keywords: ["signalk-embeddable-webapp"] });
  fs.symlinkSync(outside, path.join(dir, "public"));
  assert.deepEqual(checkLegacyDeps(dir), []);

  const dir2 = fixture(
    { name: "p", keywords: ["signalk-embeddable-webapp"] },
    { "public/remoteEntry.js": WEBPACK_R19 },
  );
  fs.symlinkSync(
    path.join(outside, "chunk.js"),
    path.join(dir2, "public", "chunk.js"),
  );
  assert.deepEqual(checkLegacyDeps(dir2), []);
});

test("missing package.json is indeterminate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-deps-"));
  assert.deepEqual(checkLegacyDeps(dir), []);
});
