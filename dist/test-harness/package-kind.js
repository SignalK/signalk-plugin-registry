"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBAPP_KEYWORDS = exports.PLUGIN_KEYWORD = void 0;
exports.isWebappOnly = isWebappOnly;
exports.PLUGIN_KEYWORD = "signalk-node-server-plugin";
// The App Store lists webapps under these keywords alongside plugins.
exports.WEBAPP_KEYWORDS = [
    "signalk-webapp",
    "signalk-embeddable-webapp",
];
// A package the App Store lists as a webapp only: it has no server plugin to
// load, activate or configure.
function isWebappOnly(keywords) {
    return (!keywords.includes(exports.PLUGIN_KEYWORD) &&
        keywords.some((k) => typeof k === "string" && exports.WEBAPP_KEYWORDS.includes(k)));
}
