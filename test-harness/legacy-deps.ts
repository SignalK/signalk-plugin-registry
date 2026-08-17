import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import { isRegistryRange } from "./core-deps";

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
export const BACONJS_MIN_MAJOR = 3;
export const REACT_HOST_MAJOR = 19;

// package.json keywords that make the server inject the plugin's
// public/remoteEntry.js into the admin UI (src/interfaces/webapps.ts).
export const EMBEDDED_WEBAPP_KEYWORDS: readonly string[] = [
  "signalk-embeddable-webapp",
  "signalk-plugin-configurator",
  "signalk-node-server-addon",
];

export interface LegacyDep {
  pkg: "baconjs" | "react";
  // The declared range (baconjs) or the shared version registered by the
  // built remote (react).
  found: string;
  required: string;
}

// A baconjs range is legacy when it cannot resolve to any 3.x release. "*",
// ">=1", dist-tags and invalid ranges are not flagged.
export function findLegacyBaconjs(
  declared: Array<{ pkg: string; range: string }>,
): LegacyDep | null {
  for (const { pkg, range } of declared) {
    if (pkg !== "baconjs") continue;
    if (!isRegistryRange(range)) continue;
    if (semver.validRange(range) === null) continue;
    if (!semver.intersects(range, `>=${BACONJS_MIN_MAJOR}.0.0`)) {
      return {
        pkg: "baconjs",
        found: range,
        required: `>=${BACONJS_MIN_MAJOR}`,
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
//             can be required; this is the admin UI's exact regex.
//   vite MF:  name:`react`,version:`19.2.8`  (or the same with double quotes)
const WEBPACK_SHARED_REACT = /\("react","(\d+)\.\d+\.\d+"/g;
const VITE_SHARED_REACT = /name:[`"']react[`"'],version:[`"'](\d+)\.\d+\.\d+[`"']/g;

export function findSharedReactMajors(source: string): number[] {
  const majors = new Set<number>();
  for (const pattern of [WEBPACK_SHARED_REACT, VITE_SHARED_REACT]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      majors.add(parseInt(match[1], 10));
    }
  }
  return [...majors];
}

export function findLegacyReact(sources: Iterable<string>): LegacyDep | null {
  for (const source of sources) {
    for (const major of findSharedReactMajors(source)) {
      if (major < REACT_HOST_MAJOR) {
        return {
          pkg: "react",
          found: String(major),
          required: `>=${REACT_HOST_MAJOR}`,
        };
      }
    }
  }
  return null;
}

// The server serves an embedded webapp from <plugin>/public/ when it exists,
// otherwise from the package root (src/interfaces/webapps.ts).
function webappRoot(pluginDir: string): string {
  const pub = path.join(pluginDir, "public");
  try {
    if (fs.lstatSync(pub).isDirectory()) return pub;
  } catch {
    // no public/ — fall through
  }
  return pluginDir;
}

// Built bundles only — a vite MF remote registers shared versions in a chunk
// next to remoteEntry.js, not in remoteEntry.js itself. The tarball is
// untrusted, so the walk is bounded: symlinks are never followed, and files
// past the count cap, deeper than the depth limit, larger than the per-file
// limit, or beyond the total byte budget are skipped (indeterminate).
export const MAX_BUNDLE_FILES = 500;
export const MAX_BUNDLE_DEPTH = 8;
export const MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
export const MAX_BUNDLE_TOTAL_BYTES = 64 * 1024 * 1024;

function* readBundleFiles(root: string): Generator<string> {
  let seen = 0;
  let totalBytes = 0;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_BUNDLE_DEPTH) stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
        if (++seen > MAX_BUNDLE_FILES) return;
        const size = fs.statSync(full).size;
        if (size > MAX_BUNDLE_BYTES) continue;
        if ((totalBytes += size) > MAX_BUNDLE_TOTAL_BYTES) return;
        yield fs.readFileSync(full, "utf-8");
      }
    }
  }
}

// Reads the installed plugin's package.json and, for embedded webapps, its
// shipped bundles. Any read failure yields [] (indeterminate, no penalty).
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function checkLegacyDeps(pluginDir: string): LegacyDep[] {
  const found: LegacyDep[] = [];
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(pluginDir, "package.json"), "utf-8"),
    );
    const pkg = isRecord(parsed) ? parsed : {};

    const declared: Array<{ pkg: string; range: string }> = [];
    for (const field of ["dependencies", "peerDependencies"]) {
      const deps = pkg[field];
      if (!isRecord(deps)) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (typeof range === "string") declared.push({ pkg: name, range });
      }
    }
    const bacon = findLegacyBaconjs(declared);
    if (bacon) found.push(bacon);

    const keywords = pkg.keywords;
    const embedded =
      Array.isArray(keywords) &&
      keywords.some((k) => EMBEDDED_WEBAPP_KEYWORDS.includes(k));
    if (embedded) {
      const react = findLegacyReact(readBundleFiles(webappRoot(pluginDir)));
      if (react) found.push(react);
    }
  } catch {
    // unreadable package.json or bundle — indeterminate
  }
  return found;
}
