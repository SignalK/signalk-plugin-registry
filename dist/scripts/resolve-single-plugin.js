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
const fs = __importStar(require("fs"));
const discover_plugins_1 = require("./discover-plugins");
const npm_name_1 = require("./npm-name");
// Resolves one plugin straight from the per-package npm endpoint and writes a
// one-element plugins.json for plan-runs.ts. This is what the single_plugin
// path uses instead of discover-plugins.ts: the /-/v1/search index that
// discovery relies on lags publishes by up to an hour, so a freshly-published
// plugin is absent from the discovered set and single_plugin silently produces
// zero runs. The per-package endpoint has no such lag, so injecting the one
// requested plugin guarantees it gets probed even seconds after publish.
async function main() {
    const args = process.argv.slice(2);
    const get = (flag) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : '';
    };
    const name = get('--name');
    const out = get('--out');
    if (!name || !out) {
        console.error('Usage: ts-node resolve-single-plugin.ts --name <npm-name> --out <file>');
        process.exit(1);
    }
    // Defence in depth: rescore.yml already validated the name, but this script
    // is also reachable from a maintainer workflow_dispatch where the name is
    // typed by hand. Never feed an unvalidated name into a network fetch / the
    // matrix.
    if (!(0, npm_name_1.isValidNpmName)(name)) {
        console.error(`[resolve-single] Invalid npm package name: ${name}`);
        process.exit(1);
    }
    const doc = await (0, discover_plugins_1.fetchPackument)(name);
    if (!doc) {
        console.error(`[resolve-single] Package ${name} not found on npm`);
        process.exit(1);
    }
    const info = (0, discover_plugins_1.packumentToPluginInfo)(name, doc);
    if (!info) {
        console.error(`[resolve-single] Package ${name} has no published version`);
        process.exit(1);
    }
    fs.writeFileSync(out, JSON.stringify([info], null, 2) + '\n');
    console.error(`[resolve-single] Wrote ${name}@${info.version} to ${out}`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
