import * as fs from 'fs'
import { fetchPackument, packumentToPluginInfo } from './discover-plugins'
import { isValidNpmName } from './npm-name'

// Resolves one plugin straight from the per-package npm endpoint and writes a
// one-element plugins.json for plan-runs.ts. This is what the single_plugin
// path uses instead of discover-plugins.ts: the /-/v1/search index that
// discovery relies on lags publishes by up to an hour, so a freshly-published
// plugin is absent from the discovered set and single_plugin silently produces
// zero runs. The per-package endpoint has no such lag, so injecting the one
// requested plugin guarantees it gets probed even seconds after publish.

async function main() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const idx = args.indexOf(flag)
    return idx !== -1 ? args[idx + 1] : ''
  }

  const name = get('--name')
  const out = get('--out')

  if (!name || !out) {
    console.error('Usage: ts-node resolve-single-plugin.ts --name <npm-name> --out <file>')
    process.exit(1)
  }

  // Defence in depth: rescore.yml already validated the name, but this script
  // is also reachable from a maintainer workflow_dispatch where the name is
  // typed by hand. Never feed an unvalidated name into a network fetch / the
  // matrix.
  if (!isValidNpmName(name)) {
    console.error(`[resolve-single] Invalid npm package name: ${name}`)
    process.exit(1)
  }

  const doc = await fetchPackument(name)
  if (!doc) {
    console.error(`[resolve-single] Package ${name} not found on npm`)
    process.exit(1)
  }

  const info = packumentToPluginInfo(name, doc)
  if (!info) {
    console.error(`[resolve-single] Package ${name} has no published version`)
    process.exit(1)
  }

  fs.writeFileSync(out, JSON.stringify([info], null, 2) + '\n')
  console.error(`[resolve-single] Wrote ${name}@${info.version} to ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
