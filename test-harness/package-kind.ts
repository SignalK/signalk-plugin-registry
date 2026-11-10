export const PLUGIN_KEYWORD = "signalk-node-server-plugin";

// The App Store lists webapps under these keywords alongside plugins.
export const WEBAPP_KEYWORDS: readonly string[] = [
  "signalk-webapp",
  "signalk-embeddable-webapp",
];

// A package the App Store lists as a webapp only: it has no server plugin to
// load, activate or configure.
export function isWebappOnly(keywords: readonly unknown[]): boolean {
  return (
    !keywords.includes(PLUGIN_KEYWORD) &&
    keywords.some((k) => typeof k === "string" && WEBAPP_KEYWORDS.includes(k))
  );
}
