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
const workflowSha = "b".repeat(40);
const repository = "example/kanbalone";
const repositoryId = 22, workflowId = 23, runId = 24, candidateArtifactId = 25;
const registryId = `sha256:${"c".repeat(64)}`;
const digest = `ghcr.io/${repository}@${registryId}`;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const note = (version: string) => `# v${version}\n\n## 日本語\n\n利用者向けの変更内容を確認しました。既存のデータを保持したまま更新できます。\n\n## English\n\nReviewed user-facing changes. Existing data is retained when upgrading.\n`;
function fixture(t: any, version = "1.0.0") {
  const root = mkdtempSync(path.join(os.tmpdir(), "kanbalone-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["docs/en", "docs/ja", "docs/releases", "release-artifact"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "kanbalone", version }));
  writeFileSync(path.join(root, "docs/openapi.yaml"), `openapi: 3.1.0\ninfo:\n  title: Kanbalone\n  version: ${version}\npaths: {}\n`);
  for (const file of ["README.md", "README.ja.md", "docs/en/user-guide.md", "docs/ja/user-guide.md"]) writeFileSync(path.join(root, file), `ghcr.io/wamukat/kanbalone:v${version}\nrefs/tags/v${version}.tar.gz\nkanbalone-${version}/skills/kanbalone-api\n`);
  writeFileSync(path.join(root, `docs/releases/v${version}.md`), note(version));
  const labels = { "org.opencontainers.image.revision": sha, "org.opencontainers.image.version": version };
  const layer = "tested layer";
  const layers = [`sha256:${hash(layer)}`];
  const config = JSON.stringify({ os: "linux", architecture: "amd64", config: { Labels: labels }, rootfs: { diff_ids: layers } });
  const configId = `sha256:${hash(config)}`;
  const imageManifest = JSON.stringify({ schemaVersion: 2, config: { digest: configId }, layers: [{ digest: layers[0] }] });
  const imageId = `sha256:${hash(imageManifest)}`;
  const contents = path.join(root, "saved-image");
  mkdirSync(path.join(contents, "blobs", "sha256"), { recursive: true });
  for (const bytes of [config, layer, imageManifest]) {
    writeFileSync(path.join(contents, "blobs", "sha256", hash(bytes)), bytes);
  }
  writeFileSync(path.join(contents, "manifest.json"), JSON.stringify([{
    Config: `blobs/sha256/${configId.slice(7)}`, Layers: [`blobs/sha256/${layers[0].slice(7)}`],
  }]));
  const artifactPath = path.join(root, "release-artifact");
  const tar = path.join(artifactPath, "image.tar");
  execFileSync("tar", ["-cf", tar, "-C", contents, "manifest.json", "blobs"]);
  const manifest = {
    schemaVersion: 1, version, sha, imageId, imageSha256: hash(readFileSync(tar)),
    imageFile: "image.tar", image: "kanbalone:release-check", platform: "linux/amd64",
    smoke: { persistenceVerified: true },
  };
  writeFileSync(path.join(artifactPath, "manifest.json"), JSON.stringify(manifest));
  return { root, version, manifest, artifactPath, configId, layers };
}

function mockRun(f: ReturnType<typeof fixture>, options: any = {}) {
  const { version, configId, layers } = f;
  const calls: Array<{ file: string; args: string[] }> = [];
  const image = (ref: string) => ({
    Id: options.conflictingImage && ref.includes(":v") ? `sha256:${"d".repeat(64)}` : configId,
    Os: "linux",
    Architecture: "amd64",
    RootFS: { Layers: options.conflictingLayers && ref.startsWith("ghcr.io/") ? [] : layers },
    Config: { Labels: { "org.opencontainers.image.revision": sha, "org.opencontainers.image.version": ref.endsWith(":latest") ? options.latest ?? version : version } },
    RepoDigests: [digest, ...(options.otherDigest ? [`ghcr.io/${repository}@${options.otherDigest}`] : [])],
  });
  const scratch = mkdtempSync(path.join(f.root, "promotion-"));
  const artifactDirectory = path.join(scratch, "release-artifact");
  const archive = path.join(scratch, "candidate.zip");
  // Exclude access times so reads do not change a mock candidate’s ZIP digest.
  execFileSync("zip", ["-q", "-X", archive, ...(options.files ?? ["image.tar", "manifest.json"])], { cwd: f.artifactPath });
  const artifactDigest = `sha256:${hash(readFileSync(archive))}`;
  const provenance = { runId, runAttempt: 2, workflowSha, artifactId: options.artifactId ?? candidateArtifactId, artifactDigest };
  const artifactEndpoint = `repos/${repository}/actions/artifacts/${provenance.artifactId}`;
  const runEndpoint = `repos/${repository}/actions/runs/${runId}/attempts/2`;
  const workflowPath = ".github/workflows/release.yml";
  const tagObject = "e".repeat(40);
  const tagMessage = `Release v${version}\n\nCandidate artifact ID: ${provenance.artifactId}\nArtifact ZIP digest: ${artifactDigest}\nImage archive SHA-256: ${f.manifest.imageSha256}`;
  const run = (file: string, args: string[]) => {
    calls.push({ file, args });
    if (options.fail?.(file, args)) throw new Error("injected publication failure");
    if (file === "git") {
      if (args[0] === "rev-parse") return sha;
      if (args[0] === "status") return options.dirty ? " M package.json" : "";
      if (args[0] === "ls-remote") {
        if (!options.tagSha) return "";
        if (options.lightweightTag) return `${options.tagSha}\trefs/tags/v${version}`;
        return `${tagObject}\trefs/tags/v${version}\n${options.tagSha}\trefs/tags/v${version}^{}`;
      }
      return "";
    }
    if (file === "gh" && args[0] === "api") {
      if (args[1] === artifactEndpoint) {
        if (options.missingCandidate) throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
        return JSON.stringify({
          id: provenance.artifactId, name: `release-image-${version}-attempt-2`, expired: false, digest: artifactDigest,
          workflow_run: { id: runId, head_branch: "main", head_sha: workflowSha, repository_id: repositoryId, head_repository_id: repositoryId, ...options.origin },
          ...options.artifact,
        });
      }
      if (args[1] === `repos/${repository}/actions/workflows/release.yml`) return JSON.stringify({ path: workflowPath, id: workflowId });
      if (args[1] === runEndpoint) return JSON.stringify({
        id: runId, workflow_id: workflowId, path: workflowPath, run_attempt: 2,
        repository: { id: repositoryId }, head_repository: { id: repositoryId },
        head_sha: workflowSha, head_branch: "main", event: "workflow_dispatch", status: "completed", conclusion: "success",
        ...options.source,
      });
      if (args[1]?.includes("/releases/tags/")) {
        if (options.release && !options.release.draft) return JSON.stringify(options.release);
        throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
      }
      if (args[1]?.endsWith("/releases?per_page=100")) {
        assert.deepEqual(args.slice(2), ["--paginate", "--jq", `.[] | select(.tag_name == "v${version}")`]);
        return options.release?.draft ? JSON.stringify({ tag_name: `v${version}`, ...options.release }) : "";
      }
      if (args[1]?.endsWith("/releases/latest")) {
        if (options.githubLatest) return JSON.stringify({ tag_name: `v${options.githubLatest}` });
        throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
      }
      if (args[1]?.includes("/releases/assets/")) return JSON.stringify(options.previousManifest);
      if (args[1] === `repos/${repository}/git/tags/${tagObject}`) return JSON.stringify({
        tag: `v${version}`, object: { type: "commit", sha }, message: options.tagMessage ?? tagMessage,
      });
      if (args.includes(`repos/${repository}/git/tags`)) return JSON.stringify({ sha: tagObject });
      return "{}";
    }
    if (file === "docker") {
      const cmd = args[0] === "--config" ? args.slice(2) : args;
      if (cmd[0] === "manifest") {
        const existing = Array.isArray(options.existingImages) ? options.existingImages.includes(cmd[2]) : options.existingImages;
        if (cmd[2].endsWith(":latest") ? options.latest : existing) return "{}";
        throw Object.assign(new Error("missing"), { stderr: options.registryError ?? "manifest unknown" });
      }
      if (cmd[0] === "pull") return `Digest: ${cmd[1].endsWith(":v" + version) ? options.otherDigest ?? registryId : registryId}`;
      if (cmd[0] === "image" && cmd[1] === "inspect") return JSON.stringify([image(cmd[2])]);
      return "";
    }
    if (file === "unzip") return execFileSync(file, args, { encoding: "utf8" }).trim();
    return "";
  };
  const writeOutput = (file: string, args: string[], output: string) => {
    calls.push({ file, args });
    if (file === "gh") {
      assert.deepEqual(args, ["api", `${artifactEndpoint}/zip`]);
      if (options.downloadFailed) throw new Error("injected archive download failure");
      writeFileSync(output, options.badZip ? "tampered" : readFileSync(archive));
    } else {
      assert.equal(file, "unzip");
      writeFileSync(output, execFileSync(file, args));
    }
  };
  const mutations = () => calls.filter(({ file, args }) => file === "docker" ? args[0] === "push" : file === "gh" && (args.includes("POST") || (args[0] === "release" && ["create", "edit", "upload"].includes(args[1]))));
  const promote = (overrides = {}) => publishRelease({
    ...f, sha, repository, repositoryId, candidateArtifactId: provenance.artifactId,
    run, writeOutput, artifactDirectory, publish: true, ...overrides,
  });
  return { calls, run, mutations, promote, provenance, artifactDirectory };
}

test("release inputs reject shell/path syntax, invalid semver, and unstable latest ordering", () => {
  for (const value of ["v1.0.0", "1.0", "01.0.0", "1.0.0-rc.01", "1.0.0+build", "1.0.0;touch /tmp/x", "../1.0.0"]) assert.throws(() => parseVersion(value));
  assert.equal(parseVersion("1.0.0-rc.1").prerelease, "rc.1");
  assert.equal(compareStableVersions("1.10.0", "1.9.99"), 1);
  assert.equal(compareStableVersions("1.0.0", "2.0.0"), -1);
  assert.throws(() => compareStableVersions("1.0.0", "2.0.0-rc.1"));
});

test("prepare updates only current install examples and requires reviewed bilingual notes", t => {
  const f = fixture(t, "0.11.0");
  const { root } = f;
  writeFileSync(path.join(root, "docs/ja/migration-guide.md"), "Keep v0.11.0 historical reference");
  const result = prepareRelease("1.0.0-rc.1", root);
  assert.equal(result.previous, "0.11.0");
  assert.equal(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version, "1.0.0-rc.1");
  assert.match(readFileSync(path.join(root, "README.md"), "utf8"), /kanbalone-1\.0\.0-rc\.1\/skills/);
  assert.equal(readFileSync(path.join(root, "docs/ja/migration-guide.md"), "utf8"), "Keep v0.11.0 historical reference");
  const { run } = mockRun(f);
  assert.throws(() => verifyRelease({ version: "1.0.0-rc.1", sha, root, run }), /draft/);
  writeFileSync(path.join(root, "docs/releases/v1.0.0-rc.1.md"), note("1.0.0-rc.1"));
  assert.equal(verifyRelease({ version: "1.0.0-rc.1", sha, root, run }).prerelease, true);
  assert.throws(() => prepareRelease("1.0.0-rc.1", root), /already exist/);
});

test("a local publication check verifies the artifact and destinations without remote writes", async t => {
  const f = fixture(t); const mock = mockRun(f);
  const result = await publishRelease({ ...f, sha, repository, run: mock.run });
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

test("checksum corruption, conflicting tag or image, and registry failures block all publication", async t => {
  const f = fixture(t);
  for (const options of [{ tagSha: "f".repeat(40) }, { existingImages: true, conflictingImage: true }, { existingImages: true, conflictingLayers: true }, { registryError: "unauthorized" }, { dirty: true }]) {
    const mock = mockRun(f, options);
    await assert.rejects(mock.promote());
    assert.equal(mock.mutations().length, 0);
  }
  writeFileSync(path.join(f.root, "release-artifact/image.tar"), "tampered");
  const mock = mockRun(f);
  await assert.rejects(mock.promote(), /checksum/);
  assert.equal(mock.mutations().length, 0);
  assert.ok(!mock.calls.some(c => c.file === "docker"));
});

test("RC publication uses the selected archive bytes without building, rerunning checks or updating latest", async t => {
  const f = fixture(t, "1.0.0-rc.1"); const mock = mockRun(f);
  const result = await mock.promote();
  assert.equal(result.advanceLatest, false);
  assert.equal(result.registryDigest, digest);
  assert.deepEqual(result.source, mock.provenance);
  const original = (file: string) => readFileSync(path.join(f.artifactPath, file));
  const selected = (file: string) => readFileSync(path.join(mock.artifactDirectory, file));
  assert.deepEqual(selected("image.tar"), original("image.tar"));
  assert.deepEqual(selected("manifest.json"), original("manifest.json"));
  assert.deepEqual(JSON.parse(selected("published-manifest.json").toString()), result);
  assert.ok(mock.calls.some(c => c.file === "docker" && c.args[0] === "load" && c.args[2] === path.join(mock.artifactDirectory, "image.tar")));
  assert.ok(mock.calls.every(c => !["node", "pnpm", "npx"].includes(c.file)));
  assert.ok(mock.calls.filter(c => c.file === "docker").every(c => !["build", "buildx", "run", "save"].includes(c.args[0])));
  assert.ok(mock.calls.some(c => c.file === "docker" && c.args[0] === "--config" && c.args.includes("pull")));
  assert.ok(!mock.calls.some(c => c.args.some(a => a.endsWith(":latest") || a.endsWith("/releases/latest") || a === "--latest")));
  const tagging = mock.calls.filter(c => c.file === "docker" && c.args[0] === "tag");
  assert.equal(tagging.length, 2);
  assert.ok(tagging.every(c => c.args[1] === f.configId));
});

test("existing verified release resumes without replacing immutable tags or newer latest", async t => {
  const f = fixture(t);
  const previous = mockRun(f);
  const mock = mockRun(f, { tagSha: sha, existingImages: true, release: { draft: false, assets: [{ id: 5, name: "published-manifest.json" }] }, previousManifest: { ...f.manifest, source: previous.provenance }, latest: "2.0.0", githubLatest: "2.0.0" });
  const result = await mock.promote();
  assert.equal(result.advanceLatest, false);
  assert.equal(mock.mutations().length, 0);
});

test("anonymous pull failure leaves a draft and never publishes Release or latest", async t => {
  const f = fixture(t); const mock = mockRun(f, { fail: (file: string, args: string[]) => file === "docker" && args[0] === "--config" && args.includes("pull") });
  await assert.rejects(mock.promote(), /injected/);
  assert.ok(mock.calls.some(c => c.file === "gh" && c.args.includes("--draft")));
  assert.ok(!mock.calls.some(c => c.args.includes("--draft=false") || c.args.includes("--latest")));
});

test("published releases without a verification manifest cannot be silently adopted", async t => {
  const f = fixture(t); const mock = mockRun(f, { tagSha: sha, release: { draft: false, assets: [] } });
  await assert.rejects(mock.promote(), /lacks the verification manifest/);
  assert.equal(mock.mutations().length, 0);
});

test("publication rejects untrusted or unavailable candidate IDs before contacting Docker", async t => {
  const f = fixture(t);
  const cases: Array<[string, object, RegExp, object?]> = [
    ["missing input", {}, /requires the candidate_artifact_id/, { candidateArtifactId: "" }],
    ["invalid input", {}, /requires the candidate_artifact_id/, { candidateArtifactId: "25/zip" }],
    ["missing artifact", { missingCandidate: true }, /missing, expired or unavailable/],
    ["expired artifact", { artifact: { expired: true } }, /has expired/],
    ["different artifact ID", { artifact: { id: 99 } }, /Verified dry-run artifact/],
    ["legacy candidate name", { artifact: { name: `release-image-${f.version}` } }, /verified dry-run artifact/],
    ["other version", { artifact: { name: "release-image-2.0.0-attempt-2" } }, /verified dry-run artifact/],
    ["missing digest", { artifact: { digest: null } }, /archive digest/],
    ["artifact from a fork", { origin: { head_repository_id: 99 } }, /come from main in this repository/],
    ["artifact from a branch", { origin: { head_branch: "feature" } }, /come from main in this repository/],
    ["different workflow", { source: { workflow_id: 99 } }, /Release workflow dispatched on main/],
    ["different workflow file", { source: { path: ".github/workflows/another.yml" } }, /Release workflow dispatched on main/],
    ["different source attempt", { source: { run_attempt: 3 } }, /Release workflow dispatched on main/],
    ["different source checkout", { source: { head_sha: sha } }, /Release workflow dispatched on main/],
    ["attempt from a fork", { source: { head_repository: { id: 99 } } }, /Release workflow dispatched on main/],
    ["attempt from a PR", { source: { event: "pull_request" } }, /Release workflow dispatched on main/],
    ["in-progress attempt", { source: { status: "in_progress" } }, /completed successfully/],
    ["failed attempt", { source: { conclusion: "failure" } }, /completed successfully/],
    ["cancelled attempt", { source: { conclusion: "cancelled" } }, /completed successfully/],
    ["workflow checkout outside main", { fail: (file: string, args: string[]) => file === "git" && args.includes(workflowSha) }, /outside main history/],
    ["download fails", { downloadFailed: true }, /Could not download candidate artifact/],
    ["download checksum mismatch", { badZip: true }, /ZIP digest mismatch/],
    ["missing archive entry", { files: ["manifest.json"] }, /only image.tar and manifest.json/],
  ];
  for (const [name, options, error, inputs] of cases) {
    await t.test(name, async () => {
      const mock = mockRun(f, options);
      await assert.rejects(mock.promote(inputs), error);
      assert.ok(!mock.calls.some(c => c.file === "docker"));
      assert.equal(mock.mutations().length, 0);
    });
  }
});

test("candidate must match the reviewed version and commit and have passed persistence checks", async t => {
  const f = fixture(t);
  for (const [change, error] of [
    [{ sha: "f".repeat(40) }, /Unexpected release SHA/],
    [{ version: "2.0.0" }, /Unexpected release version/],
    [{ smoke: { persistenceVerified: false } }, /successful persistence check/],
  ] as const) {
    writeFileSync(path.join(f.artifactPath, "manifest.json"), JSON.stringify({ ...f.manifest, ...change }));
    const mock = mockRun(f);
    await assert.rejects(mock.promote(), error);
    assert.ok(!mock.calls.some(c => c.file === "docker"));
    assert.equal(mock.mutations().length, 0);
  }
});

test("partial publication pins the archive from the tag and retry pushes only the missing image tag", async t => {
  const f = fixture(t, "1.0.0-rc.1");
  const image = `ghcr.io/${repository}`;
  const versionRef = `${image}:${f.version}`;
  const first = mockRun(f, { fail: (file: string, args: string[]) => file === "docker" && args[0] === "push" && args[1] === versionRef });
  await assert.rejects(first.promote(), /injected/);
  const annotation = first.mutations().find(c => c.args.includes(`repos/${repository}/git/tags`));
  const tagMessage = annotation?.args.find(arg => arg.startsWith("message="))?.slice("message=".length);
  assert.match(tagMessage ?? "", new RegExp(`Candidate artifact ID: ${candidateArtifactId}\\nArtifact ZIP digest: ${first.provenance.artifactDigest}`));

  const partial = { tagSha: sha, tagMessage, existingImages: [`${image}:v${f.version}`], release: { draft: true, assets: [] } };
  const different = mockRun(f, { ...partial, artifactId: candidateArtifactId + 1 });
  await assert.rejects(different.promote(), /Existing tag does not record the selected candidate/);
  assert.equal(different.mutations().length, 0);

  const retry = mockRun(f, partial);
  const result = await retry.promote();
  assert.deepEqual(result.source, first.provenance);
  assert.deepEqual(retry.mutations().filter(c => c.file === "docker").map(c => c.args), [["push", versionRef]]);
  assert.ok(retry.mutations().some(c => c.args.includes("--draft=false")));
  assert.ok(!retry.mutations().some(c => c.args.includes("POST") || c.args.includes("create")));
});

test("a legacy or lightweight tag blocks publication without changing the release", async t => {
  const f = fixture(t);
  for (const options of [{ tagMessage: "Release v1.0.0" }, { lightweightTag: true }]) {
    const mock = mockRun(f, { tagSha: sha, ...options });
    await assert.rejects(mock.promote(), /Existing tag.*candidate/);
    assert.equal(mock.mutations().length, 0);
  }
});

test("stable publication rejects conflicting public digests and advances latest only after verifying both tags", async t => {
  const f = fixture(t);
  const mismatch = mockRun(f, { otherDigest: `sha256:${"f".repeat(64)}` });
  await assert.rejects(mismatch.promote(), /different registry digests/);
  assert.ok(!mismatch.mutations().some(c => c.args.includes("--draft=false") || c.args.includes("--latest")));

  const mock = mockRun(f, { latest: "0.9.0", githubLatest: "0.9.0" });
  const result = await mock.promote();
  assert.equal(result.advanceLatest, true);
  const latestPush = mock.calls.findIndex(c => c.file === "docker" && c.args[0] === "push" && c.args[1].endsWith(":latest"));
  const pulls = mock.calls.map((c, i) => c.args[0] === "--config" && c.args.includes("pull") ? i : -1).filter(i => i >= 0);
  assert.equal(pulls.length, 2);
  assert.ok(pulls.every(i => i < latestPush));
});

test("the workflow runs dry-run verification and image checks in parallel and publishes separately", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(workflow, /^  preflight:\n    if: github\.ref == 'refs\/heads\/main'/m);
  assert.match(workflow, /^  verify:\n    if: '!inputs\.publish'\n    needs: preflight$/m);
  assert.match(workflow, /^  image:\n    if: '!inputs\.publish'\n    needs: preflight$/m);
  assert.match(workflow, /^  publish:\n    if: inputs\.publish\n    needs: preflight$/m);
  const [dryRun, publish] = workflow.split(/^  publish:\n/m);
  assert.match(dryRun, /name: release-image-\$\{\{ inputs\.version \}\}-attempt-\$\{\{ github\.run_attempt \}\}/);
  assert.match(dryRun, /steps\.candidate\.outputs\.artifact-id/);
  assert.doesNotMatch(dryRun, /overwrite: true|(?:contents|packages): write|docker\/login-action/);
  assert.doesNotMatch(publish, /build-push-action|package-release-image|verify-upgrade-restore|workflows\/verify\.yml/);
  assert.match(publish, /ref: \$\{\{ github\.workflow_sha \}\}/);
});
