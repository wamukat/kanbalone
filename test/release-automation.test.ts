import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const commonModule = "../scripts/release-common.mjs";
const prepareModule = "../scripts/prepare-release.mjs";
const publishModule = "../scripts/release-publish.mjs";
const { parseVersion, compareStableVersions, verifyRelease } = await import(commonModule);
const { prepareRelease } = await import(prepareModule);
const { publishRelease } = await import(publishModule);
const sha = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;
const repository = "example/kanbalone";
const digest = `ghcr.io/${repository}@sha256:${"c".repeat(64)}`;
const note = (version: string) => `# v${version}\n\n## 日本語\n\n利用者向けの変更内容を確認しました。既存のデータを保持したまま更新できます。\n\n## English\n\nReviewed user-facing changes. Existing data is retained when upgrading.\n`;
function fixture(t: any, version = "1.0.0") {
  const root = mkdtempSync(path.join(os.tmpdir(), "kanbalone-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["docs/en", "docs/ja", "docs/releases", "release-artifact"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "kanbalone", version }));
  writeFileSync(path.join(root, "docs/openapi.yaml"), `openapi: 3.1.0\ninfo:\n  title: Kanbalone\n  version: ${version}\npaths: {}\n`);
  for (const file of ["README.md", "README.ja.md", "docs/en/user-guide.md", "docs/ja/user-guide.md"]) writeFileSync(path.join(root, file), `ghcr.io/wamukat/kanbalone:v${version}\nrefs/tags/v${version}.tar.gz\nkanbalone-${version}/skills/kanbalone-api\n`);
  writeFileSync(path.join(root, `docs/releases/v${version}.md`), note(version));
  const image = Buffer.from("tested image fixture");
  writeFileSync(path.join(root, "release-artifact/image.tar"), image);
  const manifest = { schemaVersion: 1, version, sha, imageId, imageSha256: createHash("sha256").update(image).digest("hex"), imageFile: "image.tar", image: "kanbalone:release-check", platform: "linux/amd64" };
  writeFileSync(path.join(root, "release-artifact/manifest.json"), JSON.stringify(manifest));
  return { root, version, manifest };
}
function mockRun(version: string, options: any = {}) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const image = (ref: string) => ({ Id: options.conflictingImage && ref.includes(":v") ? `sha256:${"d".repeat(64)}` : imageId, Config: { Labels: { "org.opencontainers.image.revision": sha, "org.opencontainers.image.version": ref.endsWith(":latest") ? options.latest ?? version : version } }, RepoDigests: [digest] });
  const run = (file: string, args: string[]) => {
    calls.push({ file, args });
    if (options.fail?.(file, args)) throw new Error("injected publication failure");
    if (file === "git") {
      if (args[0] === "rev-parse") return sha;
      if (args[0] === "status") return options.dirty ? " M package.json" : "";
      if (args[0] === "ls-remote") return options.tagSha ? `${options.tagSha}\trefs/tags/v${version}^{}` : "";
      return "";
    }
    if (file === "gh" && args[0] === "api") {
      if (args[1]?.includes("/releases/tags/")) {
        if (options.release) return JSON.stringify(options.release);
        throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
      }
      if (args[1]?.endsWith("/releases/latest")) {
        if (options.githubLatest) return JSON.stringify({ tag_name: `v${options.githubLatest}` });
        throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
      }
      if (args[1]?.includes("/releases/assets/")) return JSON.stringify(options.previousManifest);
      if (args.includes(`repos/${repository}/git/tags`)) return JSON.stringify({ sha: "e".repeat(40) });
      return "{}";
    }
    if (file === "docker") {
      const cmd = args[0] === "--config" ? args.slice(2) : args;
      if (cmd[0] === "manifest") {
        if (cmd[2].endsWith(":latest") ? options.latest : options.existingImages) return "{}";
        throw Object.assign(new Error("missing"), { stderr: options.registryError ?? "manifest unknown" });
      }
      if (cmd[0] === "image" && cmd[1] === "inspect") return JSON.stringify([image(cmd[2])]);
      return "";
    }
    return "";
  };
  const mutations = () => calls.filter(({ file, args }) => file === "docker" ? args[0] === "push" : file === "gh" && (args.includes("POST") || (args[0] === "release" && ["create", "edit", "upload"].includes(args[1]))));
  return { calls, run, mutations };
}

test("release inputs reject shell/path syntax, invalid semver, and unstable latest ordering", () => {
  for (const value of ["v1.0.0", "1.0", "01.0.0", "1.0.0-rc.01", "1.0.0+build", "1.0.0;touch /tmp/x", "../1.0.0"]) assert.throws(() => parseVersion(value));
  assert.equal(parseVersion("1.0.0-rc.1").prerelease, "rc.1");
  assert.equal(compareStableVersions("1.10.0", "1.9.99"), 1);
  assert.equal(compareStableVersions("1.0.0", "2.0.0"), -1);
  assert.throws(() => compareStableVersions("1.0.0", "2.0.0-rc.1"));
});

test("prepare updates only current install examples and requires reviewed bilingual notes", t => {
  const { root } = fixture(t, "0.11.0");
  writeFileSync(path.join(root, "docs/ja/migration-guide.md"), "Keep v0.11.0 historical reference");
  const result = prepareRelease("1.0.0-rc.1", root);
  assert.equal(result.previous, "0.11.0");
  assert.equal(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version, "1.0.0-rc.1");
  assert.match(readFileSync(path.join(root, "README.md"), "utf8"), /kanbalone-1\.0\.0-rc\.1\/skills/);
  assert.equal(readFileSync(path.join(root, "docs/ja/migration-guide.md"), "utf8"), "Keep v0.11.0 historical reference");
  const { run } = mockRun("1.0.0-rc.1");
  assert.throws(() => verifyRelease({ version: "1.0.0-rc.1", sha, root, run }), /draft/);
  writeFileSync(path.join(root, "docs/releases/v1.0.0-rc.1.md"), note("1.0.0-rc.1"));
  assert.equal(verifyRelease({ version: "1.0.0-rc.1", sha, root, run }).prerelease, true);
  assert.throws(() => prepareRelease("1.0.0-rc.1", root), /already exist/);
});

test("dry-run verifies the artifact and destinations without remote writes", t => {
  const f = fixture(t); const mock = mockRun(f.version);
  const result = publishRelease({ ...f, sha, repository, run: mock.run });
  assert.equal(result.dryRun, true);
  assert.equal(mock.mutations().length, 0);
});

test("prepare and verify use real Git ancestry, checkout identity, versions and tracked state", t => {
  const { root } = fixture(t, "0.11.0");
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "Release test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Release test", GIT_COMMITTER_EMAIL: "test@example.invalid" },
  }).trim();
  git("init", "--initial-branch=main");
  git("add", "."); git("commit", "-m", "Fixture baseline");
  prepareRelease("1.0.0", root);
  writeFileSync(path.join(root, "docs/releases/v1.0.0.md"), note("1.0.0"));
  git("add", "."); git("commit", "-m", "Prepare reviewed release");
  const releaseSha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", releaseSha);
  assert.equal(verifyRelease({ version: "1.0.0", sha: releaseSha, root }).sha, releaseSha);
  assert.throws(() => verifyRelease({ version: "1.0.0", sha, root }), /Checkout does not match/);
  assert.throws(() => verifyRelease({ version: "1.0.1", sha: releaseSha, root }), /versions must match/);
  writeFileSync(path.join(root, "README.md"), "Uncommitted edit");
  assert.throws(() => verifyRelease({ version: "1.0.0", sha: releaseSha, root }), /modified tracked files/);
  git("restore", "README.md");
  // A valid checkout and version alone are insufficient: the commit must be on main.
  git("switch", "-c", "unmerged");
  git("commit", "--allow-empty", "-m", "Unmerged candidate");
  const unmergedSha = git("rev-parse", "HEAD");
  assert.throws(() => verifyRelease({ version: "1.0.0", sha: unmergedSha, root }), /merge-base/);
  git("switch", "main");
  writeFileSync(path.join(root, "docs/openapi.yaml"), "openapi: 3.1.0\ninfo:\n  version: 0.11.0\n");
  git("add", "."); git("commit", "-m", "Mismatched API version");
  const mismatchSha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", mismatchSha);
  assert.throws(() => verifyRelease({ version: "1.0.0", sha: mismatchSha, root }), /versions must match/);
});

test("checksum corruption, conflicting tag or image, and registry failures block all publication", t => {
  const f = fixture(t);
  for (const options of [{ tagSha: "f".repeat(40) }, { existingImages: true, conflictingImage: true }, { registryError: "unauthorized" }, { dirty: true }]) {
    const mock = mockRun(f.version, options);
    assert.throws(() => publishRelease({ ...f, sha, repository, run: mock.run, publish: true }));
    assert.equal(mock.mutations().length, 0);
  }
  writeFileSync(path.join(f.root, "release-artifact/image.tar"), "tampered");
  const mock = mockRun(f.version);
  assert.throws(() => publishRelease({ ...f, sha, repository, run: mock.run, publish: true }), /checksum/);
  assert.equal(mock.mutations().length, 0);
});

test("RC publication pushes the tested image but never reads or changes latest", t => {
  const f = fixture(t, "1.0.0-rc.1"); const mock = mockRun(f.version);
  const result = publishRelease({ ...f, sha, repository, run: mock.run, publish: true });
  assert.equal(result.advanceLatest, false);
  assert.equal(result.registryDigest, digest);
  assert.ok(mock.calls.some(c => c.file === "docker" && c.args[0] === "--config" && c.args.includes("pull")));
  assert.ok(!mock.calls.some(c => c.args.some(a => a.endsWith(":latest") || a.endsWith("/releases/latest") || a === "--latest")));
  assert.ok(mock.calls.filter(c => c.file === "docker" && c.args[0] === "tag").every(c => c.args[1] === imageId));
});

test("existing verified release resumes without replacing immutable tags or newer latest", t => {
  const f = fixture(t); const mock = mockRun(f.version, { tagSha: sha, existingImages: true, release: { draft: false, assets: [{ id: 5, name: "published-manifest.json" }] }, previousManifest: f.manifest, latest: "2.0.0", githubLatest: "2.0.0" });
  const result = publishRelease({ ...f, sha, repository, run: mock.run, publish: true });
  assert.equal(result.advanceLatest, false);
  assert.equal(mock.mutations().length, 0);
});

test("anonymous pull failure leaves a draft and never publishes Release or latest", t => {
  const f = fixture(t); const mock = mockRun(f.version, { fail: (file: string, args: string[]) => file === "docker" && args[0] === "--config" && args.includes("pull") });
  assert.throws(() => publishRelease({ ...f, sha, repository, run: mock.run, publish: true }), /injected/);
  assert.ok(mock.calls.some(c => c.file === "gh" && c.args.includes("--draft")));
  assert.ok(!mock.calls.some(c => c.args.includes("--draft=false") || c.args.includes("--latest")));
});

test("published releases without a verification manifest cannot be silently adopted", t => {
  const f = fixture(t); const mock = mockRun(f.version, { tagSha: sha, release: { draft: false, assets: [] } });
  assert.throws(() => publishRelease({ ...f, sha, repository, run: mock.run, publish: true }), /lacks the verification manifest/);
  assert.equal(mock.mutations().length, 0);
});
