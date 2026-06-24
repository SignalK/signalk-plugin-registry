import * as fs from 'fs'
import * as path from 'path'
import { fetchPackument, PLUGIN_KEYWORD } from './discover-plugins'
import { isValidNpmName } from './npm-name'

// The trust boundary for the on-demand re-score path. Reads the requested npm
// package name from the issue body (Issue Form) or a `/rescore <name>` comment
// — both attacker-controlled — and decides whether it is safe and worth
// dispatching a scan for. It emits machine-readable results to $GITHUB_OUTPUT;
// rescore.yml acts on them. This script holds no token and runs no plugin code.
//
// Two gates, in order:
//   1. Syntactic — the name must match the npm grammar. This neutralises the
//      unescaped-shell-interpolation surface in test-harness/runner.ts at the
//      source: no shell metacharacter survives.
//   2. Semantic — the package must exist on npm AND be a real Signal K plugin
//      (carries the signalk-node-server-plugin keyword, or is in the curated
//      registry.json). This stops the trigger being abused as an arbitrary
//      `npm install <anything>` / free-compute primitive.

interface ParseResult {
  valid: boolean
  name: string
  version: string
  category: string
  reason: string
}

// The Issue Form renders the `npm-name` input under a `### npm package name`
// heading. GitHub writes the answer as the paragraph following that heading.
function extractFromIssueBody(body: string): string {
  const lines = body.split(/\r?\n/)
  const headingIdx = lines.findIndex((l) => /^#{1,6}\s+npm package name\s*$/i.test(l.trim()))
  if (headingIdx === -1) return ''
  // First non-empty line after the heading is the answer.
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const v = lines[i].trim()
    if (v) return v
  }
  return ''
}

function extractFromComment(body: string): string {
  // `/rescore some-plugin` — take the first whitespace-delimited token after
  // the command. Backtick-fencing the name is tolerated.
  const m = body.trim().match(/^\/rescore\s+`?([^\s`]+)`?/i)
  return m ? m[1] : ''
}

function loadRegistryNames(): Set<string> {
  const registryPath = path.resolve(__dirname, '..', 'registry.json')
  const registry: { plugins: Array<{ npm: string }> } = JSON.parse(
    fs.readFileSync(registryPath, 'utf-8')
  )
  return new Set(registry.plugins.map((p) => p.npm))
}

async function evaluate(rawName: string): Promise<ParseResult> {
  const fail = (reason: string): ParseResult => ({
    valid: false,
    name: '',
    version: '',
    category: '',
    reason
  })

  if (!rawName) {
    return fail('no npm package name was provided.')
  }
  if (!isValidNpmName(rawName)) {
    return fail(`\`${rawName}\` is not a valid npm package name.`)
  }

  const doc = await fetchPackument(rawName)
  if (!doc) {
    return fail(`\`${rawName}\` was not found on the npm registry.`)
  }

  const latest = doc['dist-tags']?.latest
  if (!latest) {
    return fail(`\`${rawName}\` has no published version on npm.`)
  }

  const versionDoc = doc.versions?.[latest]
  const keywords = versionDoc?.keywords ?? []
  const isPlugin = keywords.includes(PLUGIN_KEYWORD) || loadRegistryNames().has(rawName)
  if (!isPlugin) {
    return fail(
      `\`${rawName}\` does not carry the \`${PLUGIN_KEYWORD}\` keyword, so the registry does not treat it as a Signal K plugin. ` +
        `Add the keyword to package.json and republish, then try again.`
    )
  }

  return {
    valid: true,
    name: rawName,
    version: latest,
    category: '',
    reason: ''
  }
}

function emit(result: ParseResult) {
  // newlines in `reason` would corrupt $GITHUB_OUTPUT's key=value lines; the
  // reason is a single human sentence, but collapse defensively.
  const reason = result.reason.replace(/\r?\n/g, ' ').trim()
  const lines = [
    `valid=${result.valid}`,
    `name=${result.name}`,
    `version=${result.version}`,
    `reason=${reason}`
  ]
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n')
  } else {
    console.log(lines.join('\n'))
  }
}

async function main() {
  const eventName = process.env.EVENT_NAME || ''
  const rawName =
    eventName === 'issue_comment'
      ? extractFromComment(process.env.COMMENT_BODY || '')
      : extractFromIssueBody(process.env.ISSUE_BODY || '')

  emit(await evaluate(rawName))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
