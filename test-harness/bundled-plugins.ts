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

// "npm:other-name@^1" installs other-name under an alias.
function aliasTarget(name: string, range: string): string {
  if (!range.startsWith("npm:")) return name;
  const spec = range.slice(4);
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}

// The entries npm installs with the plugin: dependencies, optional
// dependencies, and peers that are not marked optional (npm 7+ installs
// those). devDependencies never reach a user install.
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
      deps.push({ pkg: aliasTarget(name, range), declared: range, field });
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

// keywordsByName: dependency name -> the keywords of its latest release, or
// null when it is not on npm. A name missing from the map had a failed
// lookup and is never flagged.
export function findBundledPlugins(
  self: string,
  declared: DeclaredDep[],
  keywordsByName: Record<string, unknown[] | null>,
): BundledPlugin[] {
  const bundled = new Map<string, BundledPlugin>();
  for (const dep of declared) {
    if (dep.pkg === self || bundled.has(dep.pkg)) continue;
    if (isAppStorePackage(keywordsByName[dep.pkg])) {
      bundled.set(dep.pkg, dep);
    }
  }
  return [...bundled.values()];
}

const keywordsCache = new Map<string, unknown[] | null>();

export async function fetchKeywords(
  pkgs: string[],
): Promise<Record<string, unknown[] | null>> {
  const result: Record<string, unknown[] | null> = {};
  for (const pkg of new Set(pkgs)) {
    if (keywordsCache.has(pkg)) {
      result[pkg] = keywordsCache.get(pkg) ?? null;
      continue;
    }
    const keywords = await fetchLatestKeywords(pkg);
    if (keywords !== undefined) {
      keywordsCache.set(pkg, keywords);
      result[pkg] = keywords;
    }
  }
  return result;
}

// undefined: the registry could not be read (indeterminate). null: the
// package is not published on npm, so it cannot be an App Store package.
async function fetchLatestKeywords(
  pkg: string,
): Promise<unknown[] | null | undefined> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) return null;
      if (res.ok) {
        const data = (await res.json()) as { keywords?: unknown };
        return Array.isArray(data.keywords) ? data.keywords : [];
      }
    } catch {
      // network error or timeout — transient; fall through to retry.
    }
  }
  console.error(
    `[runner] keyword lookup for ${pkg} failed after retries; not penalizing`,
  );
  return undefined;
}
