"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_A_PLOTTER_EXTENSION = exports.PLOTTER_EXTENSION_KEYWORD = exports.PLOTTER_EXTENSION_RESOURCE_TYPE = void 0;
exports.isPlotterExtensionProvider = isPlotterExtensionProvider;
exports.hasPlotterExtensionKeyword = hasPlotterExtensionKeyword;
exports.checkPlotterManifests = checkPlotterManifests;
exports.plotterExtensionReport = plotterExtensionReport;
// Plotter extensions register their manifest as a read-only resource of this
// type; hosts (Freeboard-SK and others) read /resources/plotterExtensions.
// https://github.com/SignalK/freeboard-sk/blob/master/docs/api/plotter_extension_provider_plugins.md
exports.PLOTTER_EXTENSION_RESOURCE_TYPE = "plotterExtensions";
// The App Store category the server (>= 2.36.0) lists plotter extensions
// under, and the npm keyword hosts search to offer installable extensions.
exports.PLOTTER_EXTENSION_KEYWORD = "signalk-category-plotter-extensions";
const HOST_API_VERSION = "1";
const CONTRIBUTION_KINDS = [
    "widgets",
    "panels",
    "buttons",
    "actions",
    "background",
    "overlays",
];
const WIDGET_SIZE = /^[12]x[12]$/;
const PANEL_ACTIONS = new Set([
    "openPanel",
    "togglePanel",
    "openWindow",
    "toggleWindow",
]);
// Problems are built from plugin-controlled ids and land in the published
// record, so both their number and their length are capped.
const MAX_PROBLEMS = 10;
const MAX_PROBLEM_LENGTH = 200;
function isObj(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function entries(manifest, kind) {
    const list = manifest[kind];
    return Array.isArray(list) ? list.filter(isObj) : [];
}
function label(v) {
    return typeof v === "string" ? v : "?";
}
function isPlotterExtensionProvider(provider) {
    return isObj(provider) && provider.type === exports.PLOTTER_EXTENSION_RESOURCE_TYPE;
}
function hasPlotterExtensionKeyword(keywords) {
    return Array.isArray(keywords) && keywords.includes(exports.PLOTTER_EXTENSION_KEYWORD);
}
// The asset must load in the host's iframe for every user: a server-relative
// path, and not under /plugins/, which the server serves to admins only.
function urlProblem(url) {
    if (typeof url !== "string" || url.length === 0)
        return "has no url";
    if (!url.startsWith("/") || url.startsWith("//")) {
        return `url ${url} is not server-relative`;
    }
    if (url === "/plugins" || url.startsWith("/plugins/")) {
        return `url ${url} is under /plugins/, which only admins can load`;
    }
    return undefined;
}
function checkManifest(id, manifest) {
    if (!isObj(manifest))
        return [`${id}: manifest is not an object`];
    const problems = [];
    const at = (what, problem) => problems.push(`${id}: ${what} ${problem}`);
    // The host drops a manifest without a string name or with another
    // apiVersion, so the extension never appears.
    if (typeof manifest.name !== "string")
        at("manifest", "has no name");
    if (manifest.apiVersion !== HOST_API_VERSION) {
        at("manifest", `apiVersion must be "${HOST_API_VERSION}"`);
    }
    for (const field of ["requires", "optional"]) {
        const caps = manifest[field];
        if (caps !== undefined &&
            !(Array.isArray(caps) && caps.every((c) => typeof c === "string"))) {
            at(field, "must be a list of capability ids");
        }
    }
    if (!CONTRIBUTION_KINDS.some((kind) => entries(manifest, kind).length > 0)) {
        at("manifest", "contributes nothing");
    }
    const panels = new Set(entries(manifest, "panels").map((p) => p.id).filter((v) => typeof v === "string"));
    const runtimes = new Set(entries(manifest, "background")
        .map((b) => b.id)
        .filter((v) => typeof v === "string"));
    const needPanel = (what, panel) => {
        if (typeof panel !== "string" || !panels.has(panel)) {
            at(what, `names panel ${label(panel)}, which the manifest does not declare`);
        }
    };
    const needUrl = (what, url) => {
        const problem = urlProblem(url);
        if (problem)
            at(what, problem);
    };
    for (const w of entries(manifest, "widgets")) {
        const what = `widget ${label(w.id)}`;
        needUrl(what, w.url);
        if (typeof w.size !== "string" || !WIDGET_SIZE.test(w.size)) {
            at(what, "size must be 1x1, 2x1, 1x2 or 2x2");
        }
        if (w.configPanel !== undefined)
            needPanel(what, w.configPanel);
    }
    for (const p of entries(manifest, "panels")) {
        const what = `panel ${label(p.id)}`;
        if (p.type === "customElement") {
            needUrl(what, p.moduleUrl);
        }
        else {
            needUrl(what, p.url);
        }
    }
    for (const b of entries(manifest, "background")) {
        needUrl(`background ${label(b.id)}`, b.url);
    }
    for (const kind of ["buttons", "actions"]) {
        for (const c of entries(manifest, kind)) {
            const action = c.action;
            if (isObj(action) && PANEL_ACTIONS.has(action.type)) {
                needPanel(`${kind.slice(0, -1)} ${label(c.id)}`, action.panel);
            }
        }
    }
    for (const o of entries(manifest, "overlays")) {
        const what = `overlay ${label(o.id)}`;
        if (o.type === "image" && (typeof o.runtime !== "string" || !runtimes.has(o.runtime))) {
            at(what, `names runtime ${label(o.runtime)}, which the manifest does not declare`);
        }
        if (o.configPanel !== undefined)
            needPanel(what, o.configPanel);
    }
    return problems;
}
// `listed` is what the plugin's listResources() returned while running:
// manifests keyed by resource id. Anything a host would drop, or that would
// leave a contribution without its panel, runtime or loadable asset, is a
// problem.
function checkPlotterManifests(listed) {
    if (!isObj(listed) || Object.keys(listed).length === 0) {
        return ["listResources() returned no manifest"];
    }
    const problems = Object.entries(listed).flatMap(([id, manifest]) => checkManifest(id, manifest));
    return problems
        .slice(0, MAX_PROBLEMS)
        .map((p) => p.slice(0, MAX_PROBLEM_LENGTH));
}
exports.NOT_A_PLOTTER_EXTENSION = {
    registered: false,
    keyword: false,
    problems: [],
};
// `detected` is the detection probe's `plotterExtension` field, read back
// from a file the sandboxed plugin process wrote, so it is re-validated
// rather than trusted.
function plotterExtensionReport(detected, keywords) {
    if (!isObj(detected))
        return exports.NOT_A_PLOTTER_EXTENSION;
    const problems = Array.isArray(detected.problems)
        ? detected.problems
            .filter((p) => typeof p === "string")
            .slice(0, MAX_PROBLEMS)
            .map((p) => p.slice(0, MAX_PROBLEM_LENGTH))
        : [];
    return {
        registered: true,
        keyword: hasPlotterExtensionKeyword(keywords),
        problems,
    };
}
