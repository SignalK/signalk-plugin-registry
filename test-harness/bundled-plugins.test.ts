import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  findBundledPlugins,
  isAppStorePackage,
  readInstalledManifests,
  runtimeDeps,
} from "./bundled-plugins";

const PLUGIN = ["signalk-node-server-plugin", "signalk-webapp"];

function plugin(name: string) {
  return { name, keywords: PLUGIN };
}

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
      "@signalk/tracks-plugin": plugin("@signalk/tracks-plugin"),
      semver: { name: "semver", keywords: ["semver"] },
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

test("an alias or git spec is judged by the package it installed", () => {
  const declared = runtimeDeps({
    dependencies: {
      tracks: "npm:@signalk/tracks-plugin@^2",
      "signalk-to-nmea2000": "npm:semver@^7",
    },
  });
  assert.deepEqual(
    findBundledPlugins("x", declared, {
      tracks: plugin("@signalk/tracks-plugin"),
      "signalk-to-nmea2000": { name: "semver", keywords: [] },
    }),
    [
      {
        pkg: "@signalk/tracks-plugin",
        declared: "npm:@signalk/tracks-plugin@^2",
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
      "signalk-polar-management": plugin("signalk-polar-management"),
    }).length,
    1,
  );
});

test("libraries and dependencies that were not installed are not flagged", () => {
  const declared = runtimeDeps({
    dependencies: { "@signalk/server-api": "^2.0.0", missing: "^1.0.0" },
  });
  assert.deepEqual(
    findBundledPlugins("x", declared, {
      "@signalk/server-api": {
        name: "@signalk/server-api",
        keywords: ["signalk"],
      },
    }),
    [],
  );
});

test("a plugin depending on itself is not reported as bundling another", () => {
  const declared = runtimeDeps({ dependencies: { self: "^1.0.6" } });
  assert.deepEqual(
    findBundledPlugins("self", declared, { self: plugin("self") }),
    [],
  );
});

test("a package listed in two fields is reported once", () => {
  const declared = runtimeDeps({
    dependencies: { p: "^1.0.0" },
    peerDependencies: { p: "^1.0.0" },
  });
  assert.equal(findBundledPlugins("x", declared, { p: plugin("p") }).length, 1);
});

test("readInstalledManifests finds nested and hoisted dependencies", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-"));
  try {
    const write = (dir: string, pkg: object) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
    };
    const pluginDir = path.join(root, "node_modules", "me");
    write(pluginDir, { name: "me" });
    write(path.join(pluginDir, "node_modules", "nested"), {
      name: "nested",
      keywords: PLUGIN,
    });
    write(path.join(root, "node_modules", "@s", "hoisted"), {
      name: "@s/hoisted",
      keywords: ["x"],
    });
    assert.deepEqual(
      readInstalledManifests(pluginDir, root, ["nested", "@s/hoisted", "gone"]),
      {
        nested: { name: "nested", keywords: PLUGIN },
        "@s/hoisted": { name: "@s/hoisted", keywords: ["x"] },
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
