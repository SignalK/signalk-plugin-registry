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
const path = __importStar(require("path"));
const discover_plugins_1 = require("./discover-plugins");
const npm_name_1 = require("./npm-name");
// The Issue Form renders the `npm-name` input under a `### npm package name`
// heading. GitHub writes the answer as the paragraph following that heading.
function extractFromIssueBody(body) {
    const lines = body.split(/\r?\n/);
    const headingIdx = lines.findIndex((l) => /^#{1,6}\s+npm package name\s*$/i.test(l.trim()));
    if (headingIdx === -1)
        return '';
    // First non-empty line after the heading is the answer.
    for (let i = headingIdx + 1; i < lines.length; i++) {
        const v = lines[i].trim();
        if (v)
            return v;
    }
    return '';
}
function extractFromComment(body) {
    // `/rescore some-plugin` — take the first whitespace-delimited token after
    // the command. Backtick-fencing the name is tolerated.
    const m = body.trim().match(/^\/rescore\s+`?([^\s`]+)`?/i);
    return m ? m[1] : '';
}
function loadRegistryNames() {
    const registryPath = path.resolve(__dirname, '..', 'registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    return new Set(registry.plugins.map((p) => p.npm));
}
async function evaluate(rawName) {
    const fail = (reason) => ({
        valid: false,
        name: '',
        version: '',
        category: '',
        reason
    });
    if (!rawName) {
        return fail('no npm package name was provided.');
    }
    if (!(0, npm_name_1.isValidNpmName)(rawName)) {
        return fail(`\`${rawName}\` is not a valid npm package name.`);
    }
    const doc = await (0, discover_plugins_1.fetchPackument)(rawName);
    if (!doc) {
        return fail(`\`${rawName}\` was not found on the npm registry.`);
    }
    const latest = doc['dist-tags']?.latest;
    if (!latest) {
        return fail(`\`${rawName}\` has no published version on npm.`);
    }
    const versionDoc = doc.versions?.[latest];
    const keywords = versionDoc?.keywords ?? [];
    const isPlugin = keywords.includes(discover_plugins_1.PLUGIN_KEYWORD) || loadRegistryNames().has(rawName);
    if (!isPlugin) {
        return fail(`\`${rawName}\` does not carry the \`${discover_plugins_1.PLUGIN_KEYWORD}\` keyword, so the registry does not treat it as a Signal K plugin. ` +
            `Add the keyword to package.json and republish, then try again.`);
    }
    return {
        valid: true,
        name: rawName,
        version: latest,
        category: '',
        reason: ''
    };
}
function emit(result) {
    // newlines in `reason` would corrupt $GITHUB_OUTPUT's key=value lines; the
    // reason is a single human sentence, but collapse defensively.
    const reason = result.reason.replace(/\r?\n/g, ' ').trim();
    const lines = [
        `valid=${result.valid}`,
        `name=${result.name}`,
        `version=${result.version}`,
        `reason=${reason}`
    ];
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
    }
    else {
        console.log(lines.join('\n'));
    }
}
async function main() {
    const eventName = process.env.EVENT_NAME || '';
    const rawName = eventName === 'issue_comment'
        ? extractFromComment(process.env.COMMENT_BODY || '')
        : extractFromIssueBody(process.env.ISSUE_BODY || '');
    emit(await evaluate(rawName));
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
