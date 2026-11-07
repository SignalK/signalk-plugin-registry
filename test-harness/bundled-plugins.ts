import * as fs from "fs";
import * as path from "path";

// The keywords the server's App Store lists packages by. A runtime dependency
// carrying one of them is another App Store package: npm installs it into the
// user's ~/.signalk tree behind the App Store's back, at whatever range this
// plugin chose, where the server loads it as a plugin of its own.
export const APPSTORE_KEYWORDS: readonly string[] = [
  "signalk-node-server-plugin",
  "signalk-embeddable-webapp",
  "signalk-webapp",
];

export type DependencyField =
  | "dependencies"
  | "optionalDependencies"
  | "peerDependencies";

export interface DeclaredDep {
  pkg: string;
  declared: string;
  field: DependencyField;
}

export type BundledPlugin = DeclaredDep;

interface PackageJson {
  dependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  peerDependenciesMeta?: Record<string, { optional?: unknown } | undefined>;
}

// What npm installed under a dependency key: for git, tarball, file and
// npm: alias specs the key need not name the package.
export interface InstalledManifest {
  name: unknown;
  keywords: unknown;
}

// The entries npm installs with the plugin: dependencies, optional
// dependencies, and peers that are not marked optional (npm 7+ installs
// those). devDependencies never reach a user install. pkg is the key the
// dependency is installed under.
export function runtimeDeps(pkg: PackageJson): DeclaredDep[] {
  const deps: DeclaredDep[] = [];
  const fields: DependencyField[] = [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  for (const field of fields) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (typeof range !== "string") continue;
      if (
        field === "peerDependencies" &&
        pkg.peerDependenciesMeta?.[name]?.optional === true
      ) {
        continue;
      }
      deps.push({ pkg: name, declared: range, field });
    }
  }
  return deps;
}

export function isAppStorePackage(keywords: unknown): boolean {
  return (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && APPSTORE_KEYWORDS.includes(k))
  );
}

// installed: dependency key -> the manifest npm installed under it. A key
// missing from the map was not installed and is never flagged. A bundled
// plugin is reported by the name of the package that was installed.
export function findBundledPlugins(
  self: string,
  declared: DeclaredDep[],
  installed: Record<string, InstalledManifest>,
): BundledPlugin[] {
  const bundled = new Map<string, BundledPlugin>();
  for (const dep of declared) {
    const manifest = installed[dep.pkg];
    if (!manifest || typeof manifest.name !== "string") continue;
    if (manifest.name === self || bundled.has(manifest.name)) continue;
    if (isAppStorePackage(manifest.keywords)) {
      bundled.set(manifest.name, { ...dep, pkg: manifest.name });
    }
  }
  return [...bundled.values()];
}

// npm nests a dependency under the plugin when the hoisted copy conflicts,
// otherwise hoists it, so look from the plugin directory up to the install
// root.
export function readInstalledManifests(
  pluginDir: string,
  installRoot: string,
  keys: string[],
): Record<string, InstalledManifest> {
  const manifests: Record<string, InstalledManifest> = {};
  for (const key of new Set(keys)) {
    for (let dir = pluginDir; ; dir = path.dirname(dir)) {
      const file = path.join(dir, "node_modules", key, "package.json");
      if (fs.existsSync(file)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));
          manifests[key] = { name: pkg?.name, keywords: pkg?.keywords };
        } catch {
          // unreadable manifest: indeterminate, not flagged
        }
        break;
      }
      if (dir === installRoot || path.dirname(dir) === dir) break;
    }
  }
  return manifests;
}
