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
const plotter_extension_1 = require("./plotter-extension");
function manifest() {
    return {
        name: "POI Search",
        apiVersion: "1",
        requires: ["panels.iframe", "resources"],
        buttons: [
            {
                id: "open",
                title: "POI Search",
                slot: "mapToolbar",
                action: { type: "togglePanel", panel: "search" },
            },
        ],
        panels: [
            { id: "search", title: "Search", type: "iframe", url: "/plotterext/poi/panel.html" },
            { id: "settings", title: "Settings", type: "iframe", url: "/plotterext/poi/config.html" },
        ],
        widgets: [
            {
                id: "results",
                title: "Results",
                type: "iframe",
                url: "/plotterext/poi/widget.html",
                size: "2x1",
                configPanel: "settings",
            },
        ],
    };
}
(0, node_test_1.test)("a manifest following the provider guide has no problems", () => {
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: manifest() }), []);
});
(0, node_test_1.test)("recognises a plotterExtensions resource provider", () => {
    assert.equal((0, plotter_extension_1.isPlotterExtensionProvider)({ type: "plotterExtensions", methods: {} }), true);
    assert.equal((0, plotter_extension_1.isPlotterExtensionProvider)({ type: "notes", methods: {} }), false);
    assert.equal((0, plotter_extension_1.isPlotterExtensionProvider)(undefined), false);
});
(0, node_test_1.test)("finds the plotter extensions keyword", () => {
    assert.equal((0, plotter_extension_1.hasPlotterExtensionKeyword)(["signalk-node-server-plugin", "signalk-category-plotter-extensions"]), true);
    assert.equal((0, plotter_extension_1.hasPlotterExtensionKeyword)(["signalk-category-chart-plotters"]), false);
    assert.equal((0, plotter_extension_1.hasPlotterExtensionKeyword)(undefined), false);
});
(0, node_test_1.test)("an empty listing is a problem", () => {
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({}), ["listResources() returned no manifest"]);
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)(null), ["listResources() returned no manifest"]);
});
(0, node_test_1.test)("a manifest the host drops is a problem", () => {
    const m = manifest();
    delete m.name;
    m.apiVersion = 1;
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: manifest has no name",
        'poi: manifest apiVersion must be "1"',
    ]);
});
(0, node_test_1.test)("a manifest without contributions is a problem", () => {
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: { name: "x", apiVersion: "1" } }), [
        "poi: manifest contributes nothing",
    ]);
});
(0, node_test_1.test)("capabilities must be lists of ids", () => {
    const m = manifest();
    m.requires = "resources";
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: requires must be a list of capability ids",
    ]);
});
(0, node_test_1.test)("a widget needs a known size and a declared config panel", () => {
    const m = manifest();
    m.widgets = [
        { id: "w", type: "iframe", url: "/plotterext/poi/w.html", size: "3x1", configPanel: "nope" },
    ];
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: widget w size must be 1x1, 2x1, 1x2 or 2x2",
        "poi: widget w names panel nope, which the manifest does not declare",
    ]);
});
(0, node_test_1.test)("buttons and actions must open a declared panel", () => {
    const m = manifest();
    m.buttons = [{ id: "b", action: { type: "openWindow", panel: "gone" } }];
    m.actions = [
        { id: "a", targets: ["vessel"], action: { type: "togglePanel" } },
        { id: "p", targets: ["vessel"], action: { type: "publish", topic: "x" } },
    ];
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: button b names panel gone, which the manifest does not declare",
        "poi: action a names panel ?, which the manifest does not declare",
    ]);
});
(0, node_test_1.test)("asset urls must be server-relative and outside /plugins/", () => {
    const m = manifest();
    m.panels = [
        { id: "search", type: "iframe", url: "/plugins/poi/panel.html" },
        { id: "settings", type: "iframe", url: "https://example.com/config.html" },
    ];
    m.background = [{ id: "bg", type: "iframe" }];
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: panel search url /plugins/poi/panel.html is under /plugins/, which only admins can load",
        "poi: panel settings url https://example.com/config.html is not server-relative",
        "poi: background bg has no url",
    ]);
});
(0, node_test_1.test)("a custom element panel is loaded from its moduleUrl", () => {
    const m = manifest();
    m.panels = [
        { id: "search", type: "customElement", moduleUrl: "/plotterext/poi/el.js", tagName: "poi-search" },
        { id: "settings", type: "customElement", tagName: "poi-settings" },
    ];
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), ["poi: panel settings has no url"]);
});
(0, node_test_1.test)("an image overlay needs a declared runtime", () => {
    const m = manifest();
    m.background = [{ id: "draw", type: "iframe", url: "/plotterext/poi/bg.html" }];
    m.overlays = [
        { id: "ok", type: "image", runtime: "draw" },
        { id: "lost", type: "image", runtime: "other" },
        { id: "data", type: "data", style: "/plotterext/poi/style.json" },
    ];
    assert.deepEqual((0, plotter_extension_1.checkPlotterManifests)({ poi: m }), [
        "poi: overlay lost names runtime other, which the manifest does not declare",
    ]);
});
(0, node_test_1.test)("problems are capped in number and length", () => {
    const listed = {};
    for (let i = 0; i < 20; i++)
        listed["x".repeat(500) + i] = 42;
    const problems = (0, plotter_extension_1.checkPlotterManifests)(listed);
    assert.equal(problems.length, 10);
    assert.ok(problems.every((p) => p.length <= 200));
});
(0, node_test_1.test)("report is empty for a plugin that registers no plotter extension", () => {
    assert.deepEqual((0, plotter_extension_1.plotterExtensionReport)(undefined, ["signalk-category-plotter-extensions"]), {
        registered: false,
        keyword: false,
        problems: [],
    });
});
(0, node_test_1.test)("report re-validates the probe's answer and adds the keyword", () => {
    const report = (0, plotter_extension_1.plotterExtensionReport)({ problems: ["poi: manifest has no name", 7, "y".repeat(400)] }, ["signalk-category-plotter-extensions"]);
    assert.equal(report.registered, true);
    assert.equal(report.keyword, true);
    assert.deepEqual(report.problems.map((p) => p.length), [25, 200]);
});
