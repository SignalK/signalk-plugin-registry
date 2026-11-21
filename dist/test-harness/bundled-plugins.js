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
exports.APPSTORE_KEYWORDS = void 0;
exports.runtimeDeps = runtimeDeps;
exports.isAppStorePackage = isAppStorePackage;
exports.findBundledPlugins = findBundledPlugins;
exports.readInstalledManifests = readInstalledManifests;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// The keywords the server's App Store lists packages by. A runtime dependency
// carrying one of them is another App Store package: npm installs it into the
// user's ~/.signalk tree behind the App Store's back, at whatever range this
// plugin chose, where the server loads it as a plugin of its own.
exports.APPSTORE_KEYWORDS = [
    "signalk-node-server-plugin",
    "signalk-embeddable-webapp",
    "signalk-webapp",
];
// The entries npm installs with the plugin: dependencies, optional
// dependencies, and peers that are not marked optional (npm 7+ installs
// those). devDependencies never reach a user install. pkg is the key the
// dependency is installed under.
function runtimeDeps(pkg) {
    const deps = [];
    const fields = [
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
    ];
    for (const field of fields) {
        for (const [name, range] of Object.entries(pkg[field] ?? {})) {
            if (typeof range !== "string")
                continue;
            if (field === "peerDependencies" &&
                pkg.peerDependenciesMeta?.[name]?.optional === true) {
                continue;
            }
            deps.push({ pkg: name, declared: range, field });
        }
    }
    return deps;
}
function isAppStorePackage(keywords) {
    return (Array.isArray(keywords) &&
        keywords.some((k) => typeof k === "string" && exports.APPSTORE_KEYWORDS.includes(k)));
}
// installed: dependency key -> the manifest npm installed under it. A key
// missing from the map was not installed and is never flagged. A bundled
// plugin is reported by the name of the package that was installed.
function findBundledPlugins(self, declared, installed) {
    const bundled = new Map();
    for (const dep of declared) {
        const manifest = installed[dep.pkg];
        if (!manifest || typeof manifest.name !== "string")
            continue;
        if (manifest.name === self || bundled.has(manifest.name))
            continue;
        if (isAppStorePackage(manifest.keywords)) {
            bundled.set(manifest.name, { ...dep, pkg: manifest.name });
        }
    }
    return [...bundled.values()];
}
// npm nests a dependency under the plugin when the hoisted copy conflicts,
// otherwise hoists it, so look from the plugin directory up to the install
// root.
function readInstalledManifests(pluginDir, installRoot, keys) {
    const manifests = {};
    for (const key of new Set(keys)) {
        for (let dir = pluginDir;; dir = path.dirname(dir)) {
            const file = path.join(dir, "node_modules", key, "package.json");
            if (fs.existsSync(file)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));
                    manifests[key] = { name: pkg?.name, keywords: pkg?.keywords };
                }
                catch {
                    // unreadable manifest: indeterminate, not flagged
                }
                break;
            }
            if (dir === installRoot || path.dirname(dir) === dir)
                break;
        }
    }
    return manifests;
}
