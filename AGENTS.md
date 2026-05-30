# signalk-plugin-registry

Automated test harness and quality scorer for the Signal K plugin ecosystem. Runs nightly on GitHub Actions and on manual `workflow_dispatch`, publishes results to GitHub Pages at https://dirkwa.github.io/signalk-plugin-registry/.

The README covers _what_ this is and how the scoring works. This file is for contributors and AI agents and covers _how it fits together_ and the invariants you can't infer from reading any single file.

## Layout

- **`scripts/discover-plugins.ts`** — npm registry sweep. Returns the union of `keywords: signalk-node-server-plugin` + the curated additions in `registry.json` (plugins that don't carry the keyword but should still be tested).
- **`scripts/resolve-server.ts`** — resolves the current `npm view signalk-server@latest` version and the current `SignalK/signalk-server` `master` SHA. Both become `$GITHUB_OUTPUT` values for `plan-runs.ts`.
- **`scripts/plan-runs.ts`** — emits the GitHub Actions matrix. The `shouldTest` function is the only place that decides whether a `(plugin, version, server-slot)` triple needs a fresh probe. Re-test reasons: `plugin_version_change`, `server_version_change`, `schema_change` (new scoring fields were added), `stale` (>7d), `manual` (`workflow_dispatch` with `mode=single_plugin`/`all_plugins`).
- **`scripts/update-results.ts`** — runs in the test job; takes the runner's JSON output, scores it, and emits the **envelope** (`{ plugin, pluginVersion, slotKey, slotResult }`) that the merge job consumes.
- **`scripts/build-api.ts`** — the GitHub Pages publisher. Reads `results.json`, fetches upstream informational metrics (stars / open issues / contributors / npm weekly downloads / plugin-CI status), writes `dist/api/{index,plugins/<name>}.json`, and generates the human-facing HTML.
- **`test-harness/runner.ts`** — the workhorse. Single export `runPluginTest(name, version)` that installs, loads, activates, scores, and packs the slot envelope. Every plugin-code-touching step is wrapped in `sandboxCmd(...)` (firejail) — see the security section below.
- **`test-harness/score.ts`** — `computeScore(results) → { composite, badges, testStatus }`. The single source of truth for the 0–100 score, the badge set, and the test-status enum.
- **`test-harness/detect-providers.ts`** + **`test-harness/detect-sandboxed.ts`** — `require()` the plugin and call `start()` with `schema-defaults`-extracted config, inside a separate firejail subprocess so a `start()`-time crash doesn't take the harness down.
- **`test-harness/app-shim.ts`** — the fake `app` object Signal K plugins are constructed with. Captures registrations (resource providers, weather, autopilot, history, radar) for the `has-providers` badge. **Unstubbed accesses log to `unstubbedAccesses` rather than throw** — that's how we discover new app-API surface plugins are using.
- **`test-harness/schema-defaults.ts`** — extracts a default config from a plugin's JSON schema. Matches what the Signal K admin UI generates when you click "Submit" without typing anything. Plugins that need real credentials still fail at `start()` but the failure is on the plugin's terms, not because we passed garbage config.
- **`results.json`** — the persistent store. Schema: `{ [pluginName]: { [pluginVersion]: { "server@stable": SlotResult, "server@master"?: SlotResult, outdated?: boolean, superseded_by?: string } } }`. Committed by the `merge-results` job. Each `SlotResult` is validated against the merge-job's `validSlot` predicate before commit (see "Artifact validation" in the README).
- **`registry.json`** — curated list of plugins to test that don't carry the `signalk-node-server-plugin` keyword (e.g. `@signalk/tracks-plugin`). Edit this to add a plugin discovery missed.
- **`.github/workflows/nightly.yml`** — the only workflow file. Four jobs: `plan` → `test` (matrix, no secrets) → `merge-results` (commits `results.json`) → `publish` (deploys to `gh-pages`).
- **`.github/actions/setup-server/`** + **`.github/actions/run-plugin-tests/`** — composite actions used inside the matrix. Pulled out so the test job's steps stay readable.

## Code Quality Principles

### Scope and Complexity

YAGNI, SOLID, DRY, KISS. Only make changes that are directly requested or clearly necessary. A bug fix does not need surrounding cleanup; a simple feature does not need extra configurability.

Do not add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries: plugin output (which is untrusted), the npm registry, the GitHub API.

### Type Safety

- All new code in TypeScript. No new `.js` source files.
- `tsconfig` is `strict`. Avoid `any`.
- The test harness's `app-shim.ts` is the one place where typed Signal K interfaces meet untyped plugin code — `unknown` and narrow.

### Tests

There is currently no test runner wired up for the harness itself. If you add one, prefer `node:test`. The integration story is "trigger the workflow against a single plugin" — see "Manual testing" below.

## Security Invariants

These are the rules the harness exists to enforce. **They are load-bearing — the workflow's untrusted-code threat model depends on them.** Do not weaken any of them without explicitly calling it out in the PR description.

### Job permissions

The README has the table. The invariant: **the `test` job runs with `permissions: {}` and `persist-credentials: false`.** A plugin can do whatever it wants inside its sandbox; it can't touch the repo, the `GITHUB_TOKEN`, or any secret. If you find yourself wanting to give the test job any permission to "simplify something", stop. The simplification belongs in the merge or publish job, which never run plugin code.

### Firejail wrapping

Every place that executes plugin code goes through `sandboxCmd()` in `test-harness/runner.ts`. As of writing the sandbox is:

```bash
firejail --quiet --net=none --read-only=/home --read-only=/etc --read-only=/var
```

- `--net=none` — no outbound network. Prevents exfiltration, second-stage download, and SSRF / participation in third-party attacks.
- `--read-only=/home --read-only=/etc --read-only=/var` — plugin code can't tamper with the workspace, git history, or `results.json`. `/tmp` (where plugin workdirs live) is writable.

If you add a new code path that executes plugin code (e.g. a new detection probe), it **must** go through `sandboxCmd()`. The harness can detect firejail's absence (`hasFirejail()`) and degrades gracefully on a dev box without it — that's how local testing works — but in CI firejail is always installed.

### `SIGNALK_REGISTRY_TEST` env var

Set to `"1"` in every `npm test` invocation (both the tarball pass in `checkOwnTests` and the source-fallback in `checkSourceTests`). Plugin authors who need to self-skip a test that can't survive `--net=none` use this. See the README for the published contract. **Do not rename or remove this variable** — it's a public interface that plugin authors rely on.

### Supply chain protection

All plugin dependency installs use `--ignore-scripts` to block `postinstall` / `preinstall` lifecycle scripts. Signal K server itself is installed normally because it's trusted first-party code.

### `npm.requires` companion installs

`runner.ts` reads `signalk.requires` from a plugin's `package.json` (search for the `signalk.requires` block in `runner.ts`) and `npm install`s each companion **before** the plugin's own tests run. This mirrors the behaviour upstream signalk-server adopted in [SignalK/signalk-server#2698](https://github.com/SignalK/signalk-server/pull/2698). When you change this code path, keep it aligned with what upstream does — a divergence makes the registry score either harsher or more lenient than the canonical CI.

### Artifact validation in the merge job

The `validSlot` predicate in `.github/workflows/nightly.yml`'s merge step is the last line of defence. If a compromised test job somehow produced a malformed envelope, `validSlot` rejects it before commit. **Do not relax `validSlot` to make a failing test "easier to handle"** — add a new badge to `VALID_BADGES`, add a new boolean field to the validator, but don't drop checks.

### Best-score-wins

When a slot is retested, the new result only replaces the old one **if its composite is equal or higher**. This is a deliberate asymmetry — a transient CI failure (GitHub 500, npm blip, firejail flake) must not be able to downgrade a plugin that was previously passing. The asymmetry lives in `scripts/update-results.ts`. Do not remove it.

## Runtime Invariants

### Slot keys are `server@<slot>`

`server@stable` and `server@master` are the only two recognised slot keys (currently). The merge job rejects anything else with `Skipped non-server slot ...`. If you add a new server slot (e.g. `server@beta`), update both `validSlot`'s allow-list-by-prefix and `build-api.ts`'s composite picker.

### `actions/download-artifact@v8` has two tree shapes

When the merge step matches **multiple** artifacts via `pattern: result-*`, each lands in `<path>/<artifact-name>/`. When it matches **only one**, the artifact extracts directly into `<path>` — no subdirectory. The merge script must walk both shapes; do not assume a single fixed depth. See `.github/workflows/nightly.yml`'s merge step for the walker.

### Plugins discovered today, scored tonight

`discover-plugins.ts` always queries the live npm registry. `plan-runs.ts` reads `results.json` from the *checked-out* repo. There is no caching layer in between. That means: a plugin that publishes a new version at 02:00 UTC will be picked up by that very nightly run. Conversely: if you locally edit `results.json` to delete a slot, the next nightly will re-probe it — that's the intended way to force a re-score.

### `outdated` and `superseded_by` are advisory

`markOutdated` in `plan-runs.ts` walks every version of a plugin and stamps `outdated: true` on every entry that isn't the latest. The API in `build-api.ts` uses this to render the "latest" badge on the published page. It does **not** delete old slots — historical data is retained so the page can show a per-version history. If a plugin author publishes a broken version then unpublishes it, the slot stays around forever with `outdated: true` — that's intentional.

### The `tested` ISO timestamp is the cache key

`shouldTest` uses `Date.now() - new Date(slot.tested).getTime() > 7d` to decide if a slot is stale. If you ever need to rewrite a slot's content out-of-band (data migration), preserve the original `tested` value unless the data really did come from a fresh probe — otherwise you'll prevent legitimate retests.

## Workflow Conventions

This repo is maintained by Dirk Wahrheit. Workflow is deliberate.

### Branch and commit rules

- Branch names use **hyphens**, not slashes (`fix-something`, not `fix/something`).
- Angular conventional commits: `<type>(<scope>): <subject>`. Types: `feat | fix | docs | style | refactor | test | chore | perf`. Subject ≤ 50 chars, imperative mood, no period.
- One logical change per commit, one logical change per PR.
- No `Co-Authored-By` lines. No "Generated with Claude Code" attribution.

### PR rules

- Never commit directly to `master`. Every change goes through a PR.
- PR titles describe **what** changes; PR bodies explain **why** and summarise the approach.
- No checkboxes in PR descriptions.
- PR descriptions must reflect reality — only list what was actually verified, not speculative tests.

### Pre-PR checklist

There is no `npm run format` / `npm run ci-lint` here yet (and no test runner). The minimum bar before push is:

1. `npx tsc` — the build must succeed.
2. If you touched the workflow, dry-run the relevant `node -e` snippet locally against representative fixtures (see "Reproducing failures locally" below). YAML changes that only break at runtime are the most common breakage class in this repo.
3. `cr review --plain | tee /tmp/cr-review-<branch>.txt` for non-trivial PRs. Skip for `chore(release):` and `chore(deps):` PRs.

Only push after the above pass. Never push without explicit approval.

## Reproducing Failures Locally

Three flows worth knowing about — consult `package.json`'s `scripts` block and `.github/workflows/nightly.yml` for the exact invocations:

- **Single-plugin probe** (`test-harness/runner.ts`) — install / load / activate / score one plugin end-to-end. Use this when reproducing a registry score locally.
- **Provider detection only** (`test-harness/detect-providers.ts`) — bypasses the install/score flow and just exercises the `require()` + `start()` path with the schema-defaults config. Use this when iterating on the `app-shim.ts` stub surface.
- **Triggering a CI probe by hand** — the `Nightly Plugin Registry Scan` workflow accepts `mode` (`changed_only` / `all_plugins` / `single_plugin`) and an optional `include_master`. The single-plugin dispatch is the fastest way to validate a fresh publish.

### The firejail-vs-host gotcha

The most common "passes locally, fails on CI" report comes from one source: `hasFirejail()` returns false on dev boxes without firejail installed, so `sandboxCmd()` returns the raw command unwrapped. Plugins that fail under `firejail --net=none` will pass locally on every machine that doesn't have it. Install firejail and re-clone into `/tmp` before concluding a CI failure is a CI bug.

The canonical worked example is the [signalk-container 1.12.1 investigation](https://github.com/dirkwa/signalk-container/pull/126): the env var `container=firejail` flipped the plugin's `isContainerized()` probe and tripped four scripted-exec tests whose stubs assumed a non-containerized host. The dirkwa SignalK plugin registry CI surfaces this kind of divergence; nothing else in the ecosystem does.

## Common Pitfalls

- **`results.json` is large.** It's 25k+ lines. Don't `cat` it; use `python3 -c "import json; d = json.load(open('results.json')); ..."` or `jq` to slice.
- **The merge job is the silent failure path.** When a `single_plugin` dispatch run shows green jobs but `results.json` is unchanged, look at the `merge-results` job's "Updated N plugin slots" line. If `N=0`, the envelope walker didn't find the file — see the "two tree shapes" invariant above.
- **`hasFirejail()` returns false silently.** On dev boxes without firejail, `sandboxCmd()` returns the raw command unwrapped. Reproductions of "passes locally but fails on CI" depend on having firejail installed locally.
- **Plugin-CI cache.** `build-api.ts` keeps a small on-disk cache (`data/plugin-ci-cache.json`) of GitHub Actions plugin-CI status. When iterating on the CI-penalty calculation, delete the cache file before re-running locally.
- **`SIGNALK_REGISTRY_TEST=1` is a public contract.** Plugin authors set this env var in their tests to opt out of CI-incompatible assertions. Renaming or removing it silently breaks every plugin that uses it.
