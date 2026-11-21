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
const build_api_1 = require("../scripts/build-api");
function otherRun(id) {
    return { id, html_url: `https://github.com/owner/repo/actions/runs/${id}` };
}
function pluginCiRun(id) {
    return {
        ...otherRun(id),
        referenced_workflows: [
            { path: "SignalK/signalk-server/.github/workflows/plugin-ci.yml@master" },
        ],
    };
}
// `count` runs that don't call plugin-ci, numbered from `first`.
function otherRuns(first, count = 100) {
    return Array.from({ length: count }, (_, i) => otherRun(first + i));
}
function recordingFetcher(pageAt) {
    const requested = [];
    const fetchPage = async (page) => {
        requested.push(page);
        return pageAt(page);
    };
    return { requested, fetchPage };
}
(0, node_test_1.test)("findPluginCiRun: a plugin-ci run on page 1 is found there", async () => {
    const page1 = [otherRun(1), pluginCiRun(2), ...otherRuns(3, 98)];
    const { requested, fetchPage } = recordingFetcher((page) => page === 1 ? page1 : otherRuns(page * 100));
    const found = await (0, build_api_1.findPluginCiRun)(fetchPage);
    assert.equal(found?.run?.id, 2);
    assert.equal(found?.firstRun?.id, 1);
    assert.deepEqual(requested, [1]);
});
(0, node_test_1.test)("findPluginCiRun: a plugin-ci run pushed to page 2 is found", async () => {
    const page2 = [pluginCiRun(101), ...otherRuns(102, 99)];
    const { requested, fetchPage } = recordingFetcher((page) => page === 2 ? page2 : otherRuns(page * 100 - 99));
    const found = await (0, build_api_1.findPluginCiRun)(fetchPage);
    assert.equal(found?.run?.id, 101);
    assert.equal(found?.firstRun?.id, 1);
    assert.deepEqual(requested, [1, 2]);
});
(0, node_test_1.test)("findPluginCiRun: no plugin-ci run stops at the short last page", async () => {
    const pages = [otherRuns(1), otherRuns(101, 5)];
    const { requested, fetchPage } = recordingFetcher((page) => pages[page - 1]);
    const found = await (0, build_api_1.findPluginCiRun)(fetchPage);
    assert.ok(found);
    assert.equal(found.run, undefined);
    assert.equal(found.firstRun?.id, 1);
    assert.deepEqual(requested, [1, 2]);
});
(0, node_test_1.test)("findPluginCiRun: a commit with no runs reads one page", async () => {
    const { requested, fetchPage } = recordingFetcher(() => []);
    const found = await (0, build_api_1.findPluginCiRun)(fetchPage);
    assert.ok(found);
    assert.equal(found.run, undefined);
    assert.equal(found.firstRun, undefined);
    assert.deepEqual(requested, [1]);
});
(0, node_test_1.test)("findPluginCiRun: full pages stop after page 10", async () => {
    const { requested, fetchPage } = recordingFetcher((page) => otherRuns(page * 100 - 99));
    const found = await (0, build_api_1.findPluginCiRun)(fetchPage);
    assert.ok(found);
    assert.equal(found.run, undefined);
    assert.equal(found.firstRun?.id, 1);
    assert.deepEqual(requested, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
(0, node_test_1.test)("findPluginCiRun: a page that fails to load is indeterminate", async () => {
    const { requested, fetchPage } = recordingFetcher((page) => page === 2 ? undefined : otherRuns(page * 100 - 99));
    assert.equal(await (0, build_api_1.findPluginCiRun)(fetchPage), undefined);
    assert.deepEqual(requested, [1, 2]);
});
