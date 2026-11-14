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
const source_ref_1 = require("./source-ref");
const SHA = "7ed3f478c5cb86d1ea7825b840e1742b5ce40f58";
(0, node_test_1.test)("tries the published commit, then release tags, then the default branch", () => {
    assert.deepEqual((0, source_ref_1.sourceRefCandidates)("signalk-container", "1.35.2", SHA), [
        { kind: "git-head", ref: SHA },
        { kind: "tag", ref: "refs/tags/v1.35.2" },
        { kind: "tag", ref: "refs/tags/1.35.2" },
        { kind: "tag", ref: "refs/tags/signalk-container@1.35.2" },
        { kind: "default-branch", ref: "HEAD" },
    ]);
});
(0, node_test_1.test)("skips the commit when npm recorded no gitHead", () => {
    const kinds = (0, source_ref_1.sourceRefCandidates)("p", "1.0.0", undefined).map((c) => c.kind);
    assert.deepEqual(kinds, ["tag", "tag", "tag", "default-branch"]);
});
(0, node_test_1.test)("rejects a gitHead that is not a full commit SHA", () => {
    for (const bad of ["7ed3f47", "HEAD", "main", `${SHA}; rm -rf /`, ""]) {
        const kinds = (0, source_ref_1.sourceRefCandidates)("p", "1.0.0", bad).map((c) => c.kind);
        assert.ok(!kinds.includes("git-head"), bad);
    }
});
(0, node_test_1.test)("names scoped packages' monorepo tags", () => {
    const refs = (0, source_ref_1.sourceRefCandidates)("@signalk/x", "2.0.0-beta.1", undefined).map((c) => c.ref);
    assert.ok(refs.includes("refs/tags/@signalk/x@2.0.0-beta.1"));
});
(0, node_test_1.test)("falls back to the default branch alone for a non-semver version", () => {
    assert.deepEqual((0, source_ref_1.sourceRefCandidates)("p", "latest", undefined), [
        { kind: "default-branch", ref: "HEAD" },
    ]);
});
