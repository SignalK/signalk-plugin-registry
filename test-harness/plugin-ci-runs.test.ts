import { test } from "node:test";
import * as assert from "node:assert/strict";
import { findPluginCiRun } from "../scripts/build-api";

// findPluginCiRun against a fake page fetcher. GitHub lists a commit's runs
// newest first, 100 to a page. The fetcher records which pages it was asked
// for, so each case also checks how far the loop read.

type Run = {
  id: number;
  html_url: string;
  referenced_workflows?: { path: string }[];
};

function otherRun(id: number): Run {
  return { id, html_url: `https://github.com/owner/repo/actions/runs/${id}` };
}

function pluginCiRun(id: number): Run {
  return {
    ...otherRun(id),
    referenced_workflows: [
      { path: "SignalK/signalk-server/.github/workflows/plugin-ci.yml@master" },
    ],
  };
}

// `count` runs that don't call plugin-ci, numbered from `first`.
function otherRuns(first: number, count = 100): Run[] {
  return Array.from({ length: count }, (_, i) => otherRun(first + i));
}

function recordingFetcher(pageAt: (page: number) => Run[] | undefined) {
  const requested: number[] = [];
  const fetchPage = async (page: number) => {
    requested.push(page);
    return pageAt(page);
  };
  return { requested, fetchPage };
}

test("findPluginCiRun: a plugin-ci run on page 1 is found there", async () => {
  const page1 = [otherRun(1), pluginCiRun(2), ...otherRuns(3, 98)];
  const { requested, fetchPage } = recordingFetcher((page) =>
    page === 1 ? page1 : otherRuns(page * 100),
  );
  const found = await findPluginCiRun(fetchPage);
  assert.equal(found?.run?.id, 2);
  assert.equal(found?.firstRun?.id, 1);
  assert.deepEqual(requested, [1]);
});

test("findPluginCiRun: a plugin-ci run pushed to page 2 is found", async () => {
  const page2 = [pluginCiRun(101), ...otherRuns(102, 99)];
  const { requested, fetchPage } = recordingFetcher((page) =>
    page === 2 ? page2 : otherRuns(page * 100 - 99),
  );
  const found = await findPluginCiRun(fetchPage);
  assert.equal(found?.run?.id, 101);
  assert.equal(found?.firstRun?.id, 1);
  assert.deepEqual(requested, [1, 2]);
});

test("findPluginCiRun: no plugin-ci run stops at the short last page", async () => {
  const pages = [otherRuns(1), otherRuns(101, 5)];
  const { requested, fetchPage } = recordingFetcher((page) => pages[page - 1]);
  const found = await findPluginCiRun(fetchPage);
  assert.ok(found);
  assert.equal(found.run, undefined);
  assert.equal(found.firstRun?.id, 1);
  assert.deepEqual(requested, [1, 2]);
});

test("findPluginCiRun: a commit with no runs reads one page", async () => {
  const { requested, fetchPage } = recordingFetcher(() => []);
  const found = await findPluginCiRun(fetchPage);
  assert.ok(found);
  assert.equal(found.run, undefined);
  assert.equal(found.firstRun, undefined);
  assert.deepEqual(requested, [1]);
});

test("findPluginCiRun: full pages stop after page 10", async () => {
  const { requested, fetchPage } = recordingFetcher((page) =>
    otherRuns(page * 100 - 99),
  );
  const found = await findPluginCiRun(fetchPage);
  assert.ok(found);
  assert.equal(found.run, undefined);
  assert.equal(found.firstRun?.id, 1);
  assert.deepEqual(requested, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("findPluginCiRun: a page that fails to load is indeterminate", async () => {
  const { requested, fetchPage } = recordingFetcher((page) =>
    page === 2 ? undefined : otherRuns(page * 100 - 99),
  );
  assert.equal(await findPluginCiRun(fetchPage), undefined);
  assert.deepEqual(requested, [1, 2]);
});
