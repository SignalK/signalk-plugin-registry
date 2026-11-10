import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  checkPlotterManifests,
  hasPlotterExtensionKeyword,
  isPlotterExtensionProvider,
  plotterExtensionReport,
} from "./plotter-extension";

function manifest(): Record<string, unknown> {
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

test("a manifest following the provider guide has no problems", () => {
  assert.deepEqual(checkPlotterManifests({ poi: manifest() }), []);
});

test("recognises a plotterExtensions resource provider", () => {
  assert.equal(isPlotterExtensionProvider({ type: "plotterExtensions", methods: {} }), true);
  assert.equal(isPlotterExtensionProvider({ type: "notes", methods: {} }), false);
  assert.equal(isPlotterExtensionProvider(undefined), false);
});

test("finds the plotter extensions keyword", () => {
  assert.equal(
    hasPlotterExtensionKeyword(["signalk-node-server-plugin", "signalk-category-plotter-extensions"]),
    true,
  );
  assert.equal(hasPlotterExtensionKeyword(["signalk-category-chart-plotters"]), false);
  assert.equal(hasPlotterExtensionKeyword(undefined), false);
});

test("an empty listing is a problem", () => {
  assert.deepEqual(checkPlotterManifests({}), ["listResources() returned no manifest"]);
  assert.deepEqual(checkPlotterManifests(null), ["listResources() returned no manifest"]);
});

test("a manifest the host drops is a problem", () => {
  const m = manifest();
  delete m.name;
  m.apiVersion = 1;
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: manifest has no name",
    'poi: manifest apiVersion must be "1"',
  ]);
});

test("a manifest without contributions is a problem", () => {
  assert.deepEqual(checkPlotterManifests({ poi: { name: "x", apiVersion: "1" } }), [
    "poi: manifest contributes nothing",
  ]);
});

test("capabilities must be lists of ids", () => {
  const m = manifest();
  m.requires = "resources";
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: requires must be a list of capability ids",
  ]);
});

test("a widget needs a known size and a declared config panel", () => {
  const m = manifest();
  m.widgets = [
    { id: "w", type: "iframe", url: "/plotterext/poi/w.html", size: "3x1", configPanel: "nope" },
  ];
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: widget w size must be 1x1, 2x1, 1x2 or 2x2",
    "poi: widget w names panel nope, which the manifest does not declare",
  ]);
});

test("buttons and actions must open a declared panel", () => {
  const m = manifest();
  m.buttons = [{ id: "b", action: { type: "openWindow", panel: "gone" } }];
  m.actions = [
    { id: "a", targets: ["vessel"], action: { type: "togglePanel" } },
    { id: "p", targets: ["vessel"], action: { type: "publish", topic: "x" } },
  ];
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: button b names panel gone, which the manifest does not declare",
    "poi: action a names panel ?, which the manifest does not declare",
  ]);
});

test("asset urls must be server-relative and outside /plugins/", () => {
  const m = manifest();
  m.panels = [
    { id: "search", type: "iframe", url: "/plugins/poi/panel.html" },
    { id: "settings", type: "iframe", url: "https://example.com/config.html" },
  ];
  m.background = [{ id: "bg", type: "iframe" }];
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: panel search url /plugins/poi/panel.html is under /plugins/, which only admins can load",
    "poi: panel settings url https://example.com/config.html is not server-relative",
    "poi: background bg has no url",
  ]);
});

test("a custom element panel is loaded from its moduleUrl", () => {
  const m = manifest();
  m.panels = [
    { id: "search", type: "customElement", moduleUrl: "/plotterext/poi/el.js", tagName: "poi-search" },
    { id: "settings", type: "customElement", tagName: "poi-settings" },
  ];
  assert.deepEqual(checkPlotterManifests({ poi: m }), ["poi: panel settings has no url"]);
});

test("an image overlay needs a declared runtime", () => {
  const m = manifest();
  m.background = [{ id: "draw", type: "iframe", url: "/plotterext/poi/bg.html" }];
  m.overlays = [
    { id: "ok", type: "image", runtime: "draw" },
    { id: "lost", type: "image", runtime: "other" },
    { id: "data", type: "data", style: "/plotterext/poi/style.json" },
  ];
  assert.deepEqual(checkPlotterManifests({ poi: m }), [
    "poi: overlay lost names runtime other, which the manifest does not declare",
  ]);
});

test("problems are capped in number and length", () => {
  const listed: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) listed["x".repeat(500) + i] = 42;
  const problems = checkPlotterManifests(listed);
  assert.equal(problems.length, 10);
  assert.ok(problems.every((p) => p.length <= 200));
});

test("report is empty for a plugin that registers no plotter extension", () => {
  assert.deepEqual(plotterExtensionReport(undefined, ["signalk-category-plotter-extensions"]), {
    registered: false,
    keyword: false,
    problems: [],
  });
});

test("report re-validates the probe's answer and adds the keyword", () => {
  const report = plotterExtensionReport(
    { problems: ["poi: manifest has no name", 7, "y".repeat(400)] },
    ["signalk-category-plotter-extensions"],
  );
  assert.equal(report.registered, true);
  assert.equal(report.keyword, true);
  assert.deepEqual(report.problems.map((p) => p.length), [25, 200]);
});
