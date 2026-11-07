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
exports.MAX_BUNDLE_TOTAL_BYTES = exports.MAX_BUNDLE_BYTES = exports.MAX_BUNDLE_FILES = exports.EMBEDDED_WEBAPP_KEYWORDS = exports.REACT_HOST_MAJOR = exports.BACONJS_MIN_MAJOR = void 0;
exports.findLegacyBaconjs = findLegacyBaconjs;
exports.findSharedReactMajors = findSharedReactMajors;
exports.findLegacyReact = findLegacyReact;
exports.checkLegacyDeps = checkLegacyDeps;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const core_deps_1 = require("./core-deps");
// Runtime libraries the server provides at a fixed major and bridges for older
// plugin builds only through temporary compatibility shims:
//
// - baconjs: the server moved to 3.x in 2.24.0 and hooks module resolution so
//   a plugin's own 0.7/1.x copy is never loaded (signalk-server#2487). A plugin
//   still declaring baconjs <3 ships a dead dependency and breaks the moment
//   the shim goes away.
// - react: the admin UI is React 19 and bridges Module Federation remotes
//   built against React 16 through an isolated ReactDOM.render subtree
//   (signalk-server#2342, #2452, reminder #2451).
//
// Both are pure metadata/file inspections — no plugin code runs.
exports.BACONJS_MIN_MAJOR = 3;
exports.REACT_HOST_MAJOR = 19;
// package.json keywords that make the server inject the plugin's
// public/remoteEntry.js into the admin UI (src/interfaces/webapps.ts).
exports.EMBEDDED_WEBAPP_KEYWORDS = [
    "signalk-embeddable-webapp",
    "signalk-plugin-configurator",
    "signalk-node-server-addon",
];
// A baconjs range is legacy when it cannot resolve to any 3.x release. "*",
// ">=1", dist-tags and invalid ranges are not flagged. The lower bound is
// 3.0.0-0 so a 3.x prerelease pin counts as 3.x.
const BACONJS_OK_RANGE = `>=${exports.BACONJS_MIN_MAJOR}.0.0-0`;
function findLegacyBaconjs(declared) {
    for (const { pkg, range } of declared) {
        if (pkg !== "baconjs")
            continue;
        if (!(0, core_deps_1.isRegistryRange)(range))
            continue;
        if (semver.validRange(range) === null)
            continue;
        if (!semver.intersects(range, BACONJS_OK_RANGE)) {
            return {
                pkg: "baconjs",
                found: range,
                required: `>=${exports.BACONJS_MIN_MAJOR}`,
            };
        }
    }
    return null;
}
// Shared-React registrations emitted by the two Module Federation build
// tools Signal K plugins use. Consume-only remotes (import: false, host React)
// register no version and are not legacy — they run on the host's React, the
// same distinction the admin UI's containerUsesLegacyReact() draws.
//   webpack:  l("react","16.14.0",factory)  or the curried form newer webpack
//             emits, ((n,v)=>{...})("react","16.14.0")  — so no trailing comma
//             can be required. This is the admin UI's regex plus optional
//             whitespace, so an unminified (development) build matches too.
//   vite MF:  name:`react`,version:`19.2.8`  (or the same with double quotes)
const WEBPACK_SHARED_REACT = /\(\s*"react"\s*,\s*"(\d+)\.\d+\.\d+"/g;
const VITE_SHARED_REACT = /name\s*:\s*[`"']react[`"']\s*,\s*version\s*:\s*[`"'](\d+)\.\d+\.\d+[`"']/g;
function findSharedReactMajors(source) {
    const majors = new Set();
    for (const pattern of [WEBPACK_SHARED_REACT, VITE_SHARED_REACT]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) {
            majors.add(parseInt(match[1], 10));
        }
    }
    return [...majors];
}
function findLegacyReact(sources) {
    for (const source of sources) {
        for (const major of findSharedReactMajors(source)) {
            if (major < exports.REACT_HOST_MAJOR) {
                return {
                    pkg: "react",
                    found: String(major),
                    required: `>=${exports.REACT_HOST_MAJOR}`,
                };
            }
        }
    }
    return null;
}
// The server serves an embedded webapp from <plugin>/public/ when it exists,
// otherwise from the package root (src/interfaces/webapps.ts), and injects
// <root>/remoteEntry.js into the admin UI (src/serverroutes.ts).
const REMOTE_ENTRY = "remoteEntry.js";
function webappRoot(pluginDir) {
    const pub = path.join(pluginDir, "public");
    try {
        if (fs.lstatSync(pub).isDirectory())
            return pub;
    }
    catch {
        // no public/ — fall through
    }
    return pluginDir;
}
// Only what the admin UI can actually execute is inspected: remoteEntry.js
// and the relative .js paths reachable from it. webpack registers shared
// versions in remoteEntry.js itself; a vite MF remote registers them in a
// chunk (the localSharedImportMap virtual module) that remoteEntry.js reaches
// through one or more imports, depending on the @module-federation/vite
// version. Files under public/ that nothing references — stale builds,
// unrelated entries — are not consulted, exactly as the browser never loads
// them. The tarball is untrusted, so the traversal is bounded: regular files
// only (symlinks are never followed), inside the webapp root, at most
// MAX_BUNDLE_FILES files, MAX_BUNDLE_BYTES per file and MAX_BUNDLE_TOTAL_BYTES
// overall; anything past a limit is skipped (indeterminate).
exports.MAX_BUNDLE_FILES = 500;
exports.MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
exports.MAX_BUNDLE_TOTAL_BYTES = 64 * 1024 * 1024;
const RELATIVE_JS_REF = /["'`](\.{1,2}\/[^"'`\s]+\.m?js)["'`]/g;
function* readRemoteBundles(root) {
    let totalBytes = 0;
    const readBounded = (file) => {
        let stat;
        try {
            stat = fs.lstatSync(file);
        }
        catch {
            return null;
        }
        if (!stat.isFile() || stat.size > exports.MAX_BUNDLE_BYTES)
            return null;
        if ((totalBytes += stat.size) > exports.MAX_BUNDLE_TOTAL_BYTES)
            return null;
        return fs.readFileSync(file, "utf-8");
    };
    const queue = [path.join(root, REMOTE_ENTRY)];
    const visited = new Set();
    while (queue.length > 0) {
        const file = queue.shift();
        if (visited.has(file))
            continue;
        if (visited.size >= exports.MAX_BUNDLE_FILES)
            return;
        visited.add(file);
        const source = readBounded(file);
        if (source === null)
            continue;
        yield source;
        // References resolve relative to the importing file, like the browser.
        for (const match of source.matchAll(RELATIVE_JS_REF)) {
            const full = path.resolve(path.dirname(file), match[1]);
            if (full.startsWith(root + path.sep))
                queue.push(full);
        }
    }
}
// Reads the installed plugin's package.json and, for embedded webapps, its
// remote entry. Any read failure yields [] (indeterminate, no penalty).
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function checkLegacyDeps(pluginDir) {
    const found = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf-8"));
        const pkg = isRecord(parsed) ? parsed : {};
        const declared = [];
        for (const field of ["dependencies", "peerDependencies"]) {
            const deps = pkg[field];
            if (!isRecord(deps))
                continue;
            for (const [name, range] of Object.entries(deps)) {
                if (typeof range === "string")
                    declared.push({ pkg: name, range });
            }
        }
        const bacon = findLegacyBaconjs(declared);
        if (bacon)
            found.push(bacon);
        const keywords = pkg.keywords;
        const embedded = Array.isArray(keywords) &&
            keywords.some((k) => typeof k === "string" && exports.EMBEDDED_WEBAPP_KEYWORDS.includes(k));
        if (embedded) {
            const react = findLegacyReact(readRemoteBundles(webappRoot(pluginDir)));
            if (react)
                found.push(react);
        }
    }
    catch {
        // unreadable package.json or bundle — indeterminate
    }
    return found;
}
