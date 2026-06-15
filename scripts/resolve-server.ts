import * as fs from 'fs'

const FETCH_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3

// A 5xx is a gateway/server hiccup that a retry can clear; 429 is rate-limiting
// that a backoff respects. Anything else (404 missing repo, 401 auth) won't fix
// itself on retry, so fail fast.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

// Both upstreams (npm, GitHub) occasionally return a transient 5xx or time out.
// Because the `plan` job is the root of the workflow's dependency tree, a single
// throw here skips the entire nightly scan (no plugins scored). Retry the
// transient failures; only a persistent outage propagates out and exits 1.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response | undefined
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
    } catch (err) {
      // Network error or timeout — always transient; fall through to backoff.
      lastErr = err as Error
    }

    if (res) {
      if (res.ok) return res
      // A non-retryable status (4xx) won't fix itself — fail immediately
      // rather than burning the remaining attempts on it.
      if (!isRetryableStatus(res.status)) {
        throw new Error(`${label} returned ${res.status}`)
      }
      lastErr = new Error(`${label} returned ${res.status}`)
    }

    if (attempt === MAX_ATTEMPTS) throw lastErr
    console.error(
      `[resolve-server] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastErr?.message}; retrying`
    )
    await new Promise((r) => setTimeout(r, attempt * 1000))
  }
  throw lastErr
}

async function resolveStable(): Promise<string> {
  const res = await fetchWithRetry(
    'https://registry.npmjs.org/signalk-server/latest',
    {},
    'npm registry'
  )
  const data = await res.json()
  return data.version
}

async function resolveMaster(): Promise<string> {
  const res = await fetchWithRetry(
    'https://api.github.com/repos/SignalK/signalk-server/commits/master',
    { headers: { Accept: 'application/vnd.github.sha' } },
    'GitHub API'
  )
  const sha = await res.text()
  return sha.trim().slice(0, 7)
}

async function main() {
  const stableVersion = await resolveStable()
  const masterSha = await resolveMaster()

  const output = [
    `stable_version=${stableVersion}`,
    `master_sha=${masterSha}`
  ].join('\n')

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, output + '\n')
  } else {
    console.log(`stable_version=${stableVersion}`)
    console.log(`master_sha=${masterSha}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
