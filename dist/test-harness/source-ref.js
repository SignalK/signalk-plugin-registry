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
exports.sourceRefCandidates = sourceRefCandidates;
const semver = __importStar(require("semver"));
const COMMIT_SHA = /^[0-9a-f]{40}$/;
// The refs to try, in order, when cloning a plugin's source to test the
// version being scored: the commit npm recorded at publish time, then the
// release tags plugins conventionally push, and only then the default branch,
// whose HEAD may be any number of commits past (or behind) the release. Both
// inputs are npm metadata, so they are validated here before reaching git.
function sourceRefCandidates(pluginName, version, gitHead) {
    const candidates = [];
    if (gitHead && COMMIT_SHA.test(gitHead)) {
        candidates.push({ kind: "git-head", ref: gitHead });
    }
    if (semver.valid(version) === version) {
        for (const tag of [`v${version}`, version, `${pluginName}@${version}`]) {
            candidates.push({ kind: "tag", ref: `refs/tags/${tag}` });
        }
    }
    candidates.push({ kind: "default-branch", ref: "HEAD" });
    return candidates;
}
