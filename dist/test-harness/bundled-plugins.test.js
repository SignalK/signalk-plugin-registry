"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const bundled_plugins_1 = require("./bundled-plugins");
const PLUGIN = ["signalk-node-server-plugin", "signalk-webapp"];
function plugin(name) {
    return { name, keywords: PLUGIN };
}
(0, node_test_1.test)("runtimeDeps reads dependencies, optional deps and required peers", () => {
    const deps = (0, bundled_plugins_1.runtimeDeps)({
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
(0, node_test_1.test)("runtimeDeps skips optional peers and devDependencies", () => {
    const deps = (0, bundled_plugins_1.runtimeDeps)({
        peerDependencies: { c: ">=1.0.0" },
        peerDependenciesMeta: { c: { optional: true } },
        ...{ devDependencies: { d: "^1.0.0" } },
    });
    assert.deepEqual(deps, []);
});
(0, node_test_1.test)("isAppStorePackage matches each App Store keyword", () => {
    assert.ok((0, bundled_plugins_1.isAppStorePackage)(["signalk-node-server-plugin"]));
    assert.ok((0, bundled_plugins_1.isAppStorePackage)(["signalk-webapp"]));
    assert.ok((0, bundled_plugins_1.isAppStorePackage)(["signalk-embeddable-webapp"]));
    assert.ok(!(0, bundled_plugins_1.isAppStorePackage)(["signalk", "marine"]));
    assert.ok(!(0, bundled_plugins_1.isAppStorePackage)(null));
    assert.ok(!(0, bundled_plugins_1.isAppStorePackage)([42]));
});
(0, node_test_1.test)("a dependency on an App Store plugin is flagged", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({
        dependencies: { "@signalk/tracks-plugin": "^2.0.2", semver: "^7.0.0" },
    });
    assert.deepEqual((0, bundled_plugins_1.findBundledPlugins)("caveman-chartplotter", declared, {
        "@signalk/tracks-plugin": plugin("@signalk/tracks-plugin"),
        semver: { name: "semver", keywords: ["semver"] },
    }), [
        {
            pkg: "@signalk/tracks-plugin",
            declared: "^2.0.2",
            field: "dependencies",
        },
    ]);
});
(0, node_test_1.test)("an alias or git spec is judged by the package it installed", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({
        dependencies: {
            tracks: "npm:@signalk/tracks-plugin@^2",
            "signalk-to-nmea2000": "npm:semver@^7",
        },
    });
    assert.deepEqual((0, bundled_plugins_1.findBundledPlugins)("x", declared, {
        tracks: plugin("@signalk/tracks-plugin"),
        "signalk-to-nmea2000": { name: "semver", keywords: [] },
    }), [
        {
            pkg: "@signalk/tracks-plugin",
            declared: "npm:@signalk/tracks-plugin@^2",
            field: "dependencies",
        },
    ]);
});
(0, node_test_1.test)("a required peer on an App Store plugin is flagged", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({
        peerDependencies: { "signalk-polar-management": ">=1.0.0" },
    });
    assert.equal((0, bundled_plugins_1.findBundledPlugins)("x", declared, {
        "signalk-polar-management": plugin("signalk-polar-management"),
    }).length, 1);
});
(0, node_test_1.test)("libraries and dependencies that were not installed are not flagged", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({
        dependencies: { "@signalk/server-api": "^2.0.0", missing: "^1.0.0" },
    });
    assert.deepEqual((0, bundled_plugins_1.findBundledPlugins)("x", declared, {
        "@signalk/server-api": {
            name: "@signalk/server-api",
            keywords: ["signalk"],
        },
    }), []);
});
(0, node_test_1.test)("a plugin depending on itself is not reported as bundling another", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({ dependencies: { self: "^1.0.6" } });
    assert.deepEqual((0, bundled_plugins_1.findBundledPlugins)("self", declared, { self: plugin("self") }), []);
});
(0, node_test_1.test)("a package listed in two fields is reported once", () => {
    const declared = (0, bundled_plugins_1.runtimeDeps)({
        dependencies: { p: "^1.0.0" },
        peerDependencies: { p: "^1.0.0" },
    });
    assert.equal((0, bundled_plugins_1.findBundledPlugins)("x", declared, { p: plugin("p") }).length, 1);
});
(0, node_test_1.test)("readInstalledManifests finds nested and hoisted dependencies", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-"));
    try {
        const write = (dir, pkg) => {
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
        assert.deepEqual((0, bundled_plugins_1.readInstalledManifests)(pluginDir, root, ["nested", "@s/hoisted", "gone"]), {
            nested: { name: "nested", keywords: PLUGIN },
            "@s/hoisted": { name: "@s/hoisted", keywords: ["x"] },
        });
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
