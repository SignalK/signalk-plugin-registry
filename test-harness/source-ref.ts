import * as semver from "semver";

export type SourceRefKind = "git-head" | "tag" | "default-branch";

export interface SourceRefCandidate {
  kind: SourceRefKind;
  // What `git fetch origin <ref>` is given: a commit SHA, a tag ref, or HEAD.
  ref: string;
}

export interface SourceRef {
  kind: SourceRefKind;
  // The commit actually checked out and tested.
  commit: string;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;

// The refs to try, in order, when cloning a plugin's source to test the
// version being scored: the commit npm recorded at publish time, then the
// release tags plugins conventionally push, and only then the default branch,
// whose HEAD may be any number of commits past (or behind) the release. Both
// inputs are npm metadata, so they are validated here before reaching git.
export function sourceRefCandidates(
  pluginName: string,
  version: string,
  gitHead: string | undefined,
): SourceRefCandidate[] {
  const candidates: SourceRefCandidate[] = [];
  if (gitHead && COMMIT_SHA.test(gitHead)) {
    candidates.push({ kind: "git-head", ref: gitHead });
  }
  if (semver.valid(version) === version) {
    for (const tag of [`v${version}`, version, `${pluginName}@${version}`]) {
      candidates.push({ kind: "tag", ref: `refs/tags/${tag}` });
    }
  }
  candidates.push({ kind: "default-branch", ref: "HEAD" });
  return candidates;
}
