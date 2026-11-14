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
const slots_1 = require("../scripts/slots");
const plan_runs_1 = require("../scripts/plan-runs");
const fresh = { tested: new Date().toISOString(), server_version: "2.35.1",
    has_changelog: true, has_screenshots: false, held_back_core_deps: [], legacy_deps: [],
    bundled_plugins: [],
    plotter_extension: { registered: false, keyword: false, problems: [] } };
(0, node_test_1.test)("slotKeyFor: primary Node keeps the plain slot key", () => {
    assert.equal((0, slots_1.slotKeyFor)("stable", "24"), "server@stable");
    assert.equal((0, slots_1.slotKeyFor)("master", "24"), "server@master");
    assert.equal((0, slots_1.slotKeyFor)("stable", "26"), "server@stable-node26");
});
(0, node_test_1.test)("shouldTest: a new plugin version is a change on every Node", () => {
    const results = {};
    for (const node of ["24", "26"]) {
        assert.deepEqual((0, plan_runs_1.shouldTest)("p", "1.0.0", "stable", node, "2.35.1", results, false), { run: true, reason: "plugin_version_change" });
    }
});
(0, node_test_1.test)("shouldTest: an added Node on an already scored version is backlog", () => {
    const results = { p: { "1.0.0": { "server@stable": fresh } } };
    assert.deepEqual((0, plan_runs_1.shouldTest)("p", "1.0.0", "stable", "26", "2.35.1", results, false), { run: true, reason: "node_added" });
    assert.deepEqual((0, plan_runs_1.shouldTest)("p", "1.0.0", "stable", "24", "2.35.1", results, false), { run: false });
});
(0, node_test_1.test)("shouldTest: a fresh Node 26 slot is not retested", () => {
    const results = {
        p: { "1.0.0": { "server@stable": fresh, "server@stable-node26": fresh } }
    };
    assert.deepEqual((0, plan_runs_1.shouldTest)("p", "1.0.0", "stable", "26", "2.35.1", results, false), { run: false });
});
(0, node_test_1.test)("orderRuns: within a tier the primary Node runs before extra Nodes", () => {
    const old = { ...fresh, tested: "2026-01-01T00:00:00.000Z" };
    const results = {
        a: { "1.0.0": { "server@stable": fresh, "server@stable-node26": old } },
        b: { "1.0.0": { "server@stable": fresh } }
    };
    const run = (plugin, node, reason) => ({ plugin, pluginVersion: "1.0.0", server: "stable", node, serverVersion: "2.35.1", reason });
    const runs = [
        run("a", "26", "stale"),
        run("b", "26", "node_added"),
        run("a", "24", "stale"),
        run("c", "26", "plugin_version_change"),
        run("c", "24", "plugin_version_change")
    ];
    (0, plan_runs_1.orderRuns)(runs, results);
    assert.deepEqual(runs.map((r) => `${r.plugin}@${r.node}:${r.reason}`), [
        "c@24:plugin_version_change",
        "c@26:plugin_version_change",
        "b@26:node_added",
        "a@24:stale",
        "a@26:stale"
    ]);
});
