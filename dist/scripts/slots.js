"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRA_NODES = exports.PRIMARY_NODE = void 0;
exports.slotKeyFor = slotKeyFor;
// Scores come from the primary Node version. Every other version is probed
// against the stable server only, under its own slot key, so it shows up
// next to the score without changing it.
exports.PRIMARY_NODE = '24';
exports.EXTRA_NODES = ['26'];
function slotKeyFor(server, node) {
    return node === exports.PRIMARY_NODE ? `server@${server}` : `server@${server}-node${node}`;
}
