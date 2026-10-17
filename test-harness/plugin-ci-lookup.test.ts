import { test, type TestContext } from "node:test";
import * as assert from "node:assert/strict";
import { fetchPluginCi } from "../scripts/build-api";

// fetchPluginCi against stubbed GitHub replies. A lookup that fails must come
// back undefined, which publishes no verdict and costs no points. A 404 on the
// runs listing is an answer instead: the repository is gone, so the commit has
// no runs anyone can see.

const SHA = "60759bd1a2af09e3fdda68c955dde7945b6a0fcb";

const PLUGIN_CI_RUN = {
  id: 7,
  status: "completed",
  html_url: "https://github.com/owner/repo/actions/runs/7",
  updated_at: "2026-10-14T17:43:04Z",
  head_branch: "main",
  referenced_workflows: [
    { path: "SignalK/signalk-server/.github/workflows/plugin-ci.yml@master" },
  ],
};

type Reply = { status: number; body?: unknown } | "network-error";

// Routes each request to the runs or the jobs reply; a request for anything
// else fails the test.
function stubGithub(t: TestContext, runs: Reply, jobs?: Reply): void {
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const reply = String(input).includes("/jobs") ? jobs : runs;
    if (reply === undefined) throw new Error(`unexpected request: ${String(input)}`);
    if (reply === "network-error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  });
}

test("fetchPluginCi: a failed runs lookup is indeterminate", async (t) => {
  stubGithub(t, { status: 502 });
  assert.equal(await fetchPluginCi("owner", "repo", SHA), undefined);
});

test("fetchPluginCi: a runs lookup that never answers is indeterminate", async (t) => {
  stubGithub(t, "network-error");
  assert.equal(await fetchPluginCi("owner", "repo", SHA), undefined);
});

test("fetchPluginCi: a repository that is gone has no runs", async (t) => {
  stubGithub(t, { status: 404 });
  assert.deepEqual(await fetchPluginCi("owner", "repo", SHA), {
    status: "no-run",
    head_sha: SHA,
    commit_url: `https://github.com/owner/repo/commit/${SHA}`,
  });
});

test("fetchPluginCi: a failed jobs lookup is indeterminate", async (t) => {
  stubGithub(t, { status: 200, body: { workflow_runs: [PLUGIN_CI_RUN] } }, { status: 502 });
  assert.equal(await fetchPluginCi("owner", "repo", SHA), undefined);
});

test("fetchPluginCi: answered lookups give the matrix", async (t) => {
  stubGithub(
    t,
    { status: 200, body: { workflow_runs: [PLUGIN_CI_RUN] } },
    {
      status: 200,
      body: {
        jobs: [{ name: "test / Linux / Node 22", conclusion: "success", status: "completed" }],
      },
    },
  );
  const ci = await fetchPluginCi("owner", "repo", SHA);
  assert.ok(ci?.status === "ok");
  assert.deepEqual(ci.jobs, [{ platform: "linux-x64", node: 22, conclusion: "success" }]);
});

test("fetchPluginCi: finds a plugin-ci run past the first page", async (t) => {
  const otherRun = { id: 1, html_url: "https://github.com/owner/repo/actions/runs/1" };
  const runPages = [Array(100).fill(otherRun), [PLUGIN_CI_RUN]];
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/jobs")) {
      return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    }
    const page = Number(url.searchParams.get("page"));
    requested.push(`${url.searchParams.get("per_page")}/${page}`);
    return new Response(JSON.stringify({ workflow_runs: runPages[page - 1] }), { status: 200 });
  });
  const ci = await fetchPluginCi("owner", "repo", SHA);
  assert.equal(ci?.status, "ok");
  assert.deepEqual(requested, ["100/1", "100/2"]);
});
