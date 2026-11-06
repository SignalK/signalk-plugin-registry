import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  findBundledPlugins,
  isAppStorePackage,
  runtimeDeps,
} from "./bundled-plugins";

const PLUGIN = ["signalk-node-server-plugin", "signalk-webapp"];

test("runtimeDeps reads dependencies, optional deps and required peers", () => {
  const deps = runtimeDeps({
    dependencies: { a: "^1.0.0" },
    optionalDependencies: { b: "^2.0.0" },
    peerDependencies: { c: ">=1.0.0" },
  });
  assert.deepEqual(deps, [
    { pkg: "a", declared: "^1.0.0", field: "dependencies" },
    { pkg: "b", declared: "^2.0.0", field: "optionalDependencies" },
    { pkg: "c", declared: ">=1.0.0", field: "peerDependencies" },
  ]);
});

test("runtimeDeps skips optional peers and devDependencies", () => {
  const deps = runtimeDeps({
    peerDependencies: { c: ">=1.0.0" },
    peerDependenciesMeta: { c: { optional: true } },
    ...{ devDependencies: { d: "^1.0.0" } },
  });
  assert.deepEqual(deps, []);
});

test("runtimeDeps follows an npm: alias to the real package", () => {
  assert.deepEqual(
    runtimeDeps({ dependencies: { tracks: "npm:@signalk/tracks-plugin@^2" } }),
    [
      {
        pkg: "@signalk/tracks-plugin",
        declared: "npm:@signalk/tracks-plugin@^2",
        field: "dependencies",
      },
    ],
  );
  assert.equal(
    runtimeDeps({ dependencies: { x: "npm:other" } })[0].pkg,
    "other",
  );
});

test("isAppStorePackage matches each App Store keyword", () => {
  assert.ok(isAppStorePackage(["signalk-node-server-plugin"]));
  assert.ok(isAppStorePackage(["signalk-webapp"]));
  assert.ok(isAppStorePackage(["signalk-embeddable-webapp"]));
  assert.ok(!isAppStorePackage(["signalk", "marine"]));
  assert.ok(!isAppStorePackage(null));
  assert.ok(!isAppStorePackage([42]));
});

test("a dependency on an App Store plugin is flagged", () => {
  const declared = runtimeDeps({
    dependencies: { "@signalk/tracks-plugin": "^2.0.2", semver: "^7.0.0" },
  });
  assert.deepEqual(
    findBundledPlugins("caveman-chartplotter", declared, {
      "@signalk/tracks-plugin": PLUGIN,
      semver: ["semver"],
    }),
    [
      {
        pkg: "@signalk/tracks-plugin",
        declared: "^2.0.2",
        field: "dependencies",
      },
    ],
  );
});

test("a required peer on an App Store plugin is flagged", () => {
  const declared = runtimeDeps({
    peerDependencies: { "signalk-polar-management": ">=1.0.0" },
  });
  assert.equal(
    findBundledPlugins("x", declared, {
      "signalk-polar-management": PLUGIN,
    }).length,
    1,
  );
});

test("libraries, unpublished packages and failed lookups are not flagged", () => {
  const declared = runtimeDeps({
    dependencies: {
      "@signalk/server-api": "^2.0.0",
      "private-thing": "file:../x",
      flaky: "^1.0.0",
    },
  });
  assert.deepEqual(
    findBundledPlugins("x", declared, {
      "@signalk/server-api": ["signalk"],
      "private-thing": null,
    }),
    [],
  );
});

test("a plugin depending on itself is not reported as bundling another", () => {
  const declared = runtimeDeps({ dependencies: { self: "^1.0.6" } });
  assert.deepEqual(findBundledPlugins("self", declared, { self: PLUGIN }), []);
});

test("a package listed in two fields is reported once", () => {
  const declared = runtimeDeps({
    dependencies: { p: "^1.0.0" },
    peerDependencies: { p: "^1.0.0" },
  });
  assert.equal(findBundledPlugins("x", declared, { p: PLUGIN }).length, 1);
});
