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
const package_kind_1 = require("./package-kind");
(0, node_test_1.test)("a package with only a webapp keyword is a webapp", () => {
    assert.ok((0, package_kind_1.isWebappOnly)(["signalk-webapp"]));
    assert.ok((0, package_kind_1.isWebappOnly)(["signalk-embeddable-webapp", "marine"]));
});
(0, node_test_1.test)("a plugin with a webapp is not a webapp-only package", () => {
    assert.ok(!(0, package_kind_1.isWebappOnly)(["signalk-node-server-plugin", "signalk-webapp"]));
});
(0, node_test_1.test)("a package without App Store keywords is not a webapp", () => {
    assert.ok(!(0, package_kind_1.isWebappOnly)([]));
    assert.ok(!(0, package_kind_1.isWebappOnly)(["signalk", 1]));
});
