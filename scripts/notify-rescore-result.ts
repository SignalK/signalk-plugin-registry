import * as fs from 'fs'
import * as path from 'path'
import type { Badge, TestStatus } from '../test-harness/score'

// Builds the result comment for an on-demand re-score. Runs in the dispatched
// nightly's trailing report-rescore job, AFTER the test job uploaded this run's
// slot envelope and merge-results committed the survivor to results.json.
//
// It reports THIS run's actual outcome — not just whatever score the published
// page shows. Because best-score-wins keeps the older, higher slot when a
// rerun regresses, reading results.json alone would post a stale score and
// close the issue as if the rerun passed. So we read this run's envelope
// (the test job's slot-update.json, downloaded as a result-* artifact) for the
// authoritative outcome, and compare it against the published score to say
// whether the rerun improved, tied, regressed, or produced no slot.
//
// Text only → $GITHUB_OUTPUT; rescore.yml posts the comment and closes the
// issue. This holds no token and never touches plugin code.

// The published page's base URL. Read from package.json's homepage so this is
// correct in any deployment (the canonical site, a fork's Pages) without
// hardcoding one repo's URL. detailUrl() appends plugins/<safe>.json to it.
function publishedBase(): string {
  const pkgPath = path.resolve(__dirname, '..', 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { homepage?: string }
  const home = (pkg.homepage || 'https://signalk.org/signalk-plugin-registry/').trim()
  return home.replace(/\/+$/, '')
}

const PUBLISHED_BASE = publishedBase()
const STABLE_SLOT = 'server@stable'

// The fields of a slot this reporter consumes. Scores/badges/status reuse the
// harness vocabulary so the reporter can't drift from the scoring contract.
interface SlotResult {
  composite?: number
  badges?: Badge[]
  test_status?: TestStatus
  tested?: string
  outdated?: boolean
}

interface Envelope {
  plugin: string
  pluginVersion: string
  slotKey: string
  slotResult: SlotResult
}

function detailUrl(name: string): string {
  // Mirrors build-api.ts's per-plugin filename: drop a leading @, replace / .
  const safe = name.replace(/^@/, '').replace(/\//g, '__')
  return `${PUBLISHED_BASE}/plugins/${safe}.json`
}

// This run's stable-slot envelope, recovered from the downloaded artifacts.
// actions/download-artifact lays out either <dir>/<artifact>/slot-update.json
// (multiple artifacts) or <dir>/slot-update.json (single) — walk both, same as
// the merge job. There is at most one stable slot per single-plugin run.
function findThisRunStableSlot(artifactsDir: string, plugin: string): SlotResult | null {
  if (!fs.existsSync(artifactsDir)) return null
  const found: SlotResult[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name === 'slot-update.json') {
        const env: Envelope = JSON.parse(fs.readFileSync(p, 'utf-8'))
        if (env.plugin === plugin && env.slotKey === STABLE_SLOT) {
          found.push(env.slotResult)
        }
      }
    }
  }
  walk(artifactsDir)
  return found[0] ?? null
}

// The published stable score for the plugin's current (non-outdated) version.
function publishedStableComposite(plugin: string): number | null {
  const resultsPath = path.resolve(__dirname, '..', 'results.json')
  const results: Record<string, Record<string, Record<string, SlotResult>>> = JSON.parse(
    fs.readFileSync(resultsPath, 'utf-8')
  )
  const versions = results[plugin]
  if (!versions) return null
  for (const slots of Object.values(versions)) {
    if (slots.outdated) continue
    const slot = slots[STABLE_SLOT]
    if (slot && typeof slot.composite === 'number') return slot.composite
  }
  return null
}

function trend(thisRun: number, published: number | null): string {
  if (published === null || published < 0) return ''
  if (thisRun > published) return ` (up from ${published})`
  if (thisRun < published) return ` (down from ${published}; the page keeps the higher previous score)`
  return ' (unchanged)'
}

// A comment plus whether it represents a real score. `scored: false` means no
// slot came back from this run, which is ambiguous — the plugin may have failed
// to install, or the envelope walker may have found nothing (the documented
// N=0 path). The caller must not close the issue on that.
interface Report {
  comment: string
  scored: boolean
}

function buildComment(plugin: string, artifactsDir: string): Report {
  const thisRun = findThisRunStableSlot(artifactsDir, plugin)

  if (!thisRun || typeof thisRun.composite !== 'number') {
    // No slot from this run. Don't assert why: "couldn't be installed" reads as
    // the author's fault, but a missing envelope is just as often ours. State
    // the fact and leave the issue open for a maintainer.
    return {
      scored: false,
      comment:
        `The re-score of \`${plugin}\` produced no result for the stable server, ` +
        `so there is no score to report. That usually means the plugin could not ` +
        `be installed or loaded, but it can also mean the scan itself did not ` +
        `complete.\n\nLeaving this open for a maintainer to check: ${PUBLISHED_BASE}/`
    }
  }

  const published = publishedStableComposite(plugin)
  const badges = (thisRun.badges ?? []).join(', ') || 'none'
  return {
    scored: true,
    comment:
      `\`${plugin}\` scored **${thisRun.composite}/100**${trend(thisRun.composite, published)}.\n\n` +
      `Badges: ${badges}\n\n` +
      `Full report: ${PUBLISHED_BASE}/ (machine-readable detail: ${detailUrl(plugin)})`
  }
}

function main() {
  const plugin = process.env.PLUGIN || ''
  if (!plugin) {
    console.error('[notify-rescore] PLUGIN env var is required')
    process.exit(1)
  }
  // Where the report job downloaded this run's result-* artifacts.
  const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/rescore-results'

  const { comment, scored } = buildComment(plugin, artifactsDir)
  if (process.env.GITHUB_OUTPUT) {
    // Multiline value via the heredoc form $GITHUB_OUTPUT supports. `scored`
    // gates whether the caller closes the issue.
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `scored=${scored}\ncomment<<RESCORE_EOF\n${comment}\nRESCORE_EOF\n`
    )
  } else {
    console.log(`scored=${scored}`)
    console.log(comment)
  }
}

main()
