import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { command, compareStableVersions, parseVersion, validateSha, verifyRelease } from "./release-common.mjs";

function optional(run, executable, args, missing) {
  try { return run(executable, args); }
  catch (error) {
    const details = `${error.stderr ?? ""}\n${error.message ?? error}`;
    if (missing.test(details)) return null;
    throw error;
  }
}
const ghMissing = /\bHTTP 404\b/;
const imageMissing = /manifest unknown|no such manifest|name unknown/i;
function inspect(run, reference, dockerArgs = []) {
  return JSON.parse(run("docker", [...dockerArgs, "image", "inspect", reference]))[0];
}
function assertImage(image, expected) {
  if (image?.Id !== expected.imageId || image?.Config?.Labels?.["org.opencontainers.image.revision"] !== expected.sha || image?.Config?.Labels?.["org.opencontainers.image.version"] !== expected.version) {
    throw new Error("Image ID, revision or version differs from the verified artifact");
  }
}
export function validateArtifact(directory, version, sha) {
  parseVersion(version); validateSha(sha);
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.sha !== sha || manifest.imageFile !== "image.tar" || manifest.platform !== "linux/amd64" || !/^sha256:[a-f0-9]{64}$/.test(manifest.imageId) || !/^[a-f0-9]{64}$/.test(manifest.imageSha256)) {
    throw new Error("Invalid or mismatched release manifest");
  }
  const imageFile = path.join(directory, "image.tar");
  const hash = createHash("sha256");
  const descriptor = openSync(imageFile, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytes;
    while ((bytes = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally { closeSync(descriptor); }
  const actual = hash.digest("hex");
  if (actual !== manifest.imageSha256) throw new Error("Release image archive checksum mismatch");
  return { manifest, imageFile };
}

/** All external operations are argument arrays. Tests supply a command runner;
 * the normal CLI is read-only remotely unless RELEASE_PUBLISH=true is explicit.
 */
export function publishRelease({ version, sha, repository, artifactDirectory = "release-artifact", root = process.cwd(), run = command, publish = false }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("GITHUB_REPOSITORY must be owner/repository");
  const release = verifyRelease({ version, sha, root, run });
  const directory = path.resolve(root, artifactDirectory);
  const { manifest, imageFile } = validateArtifact(directory, version, sha);
  const imageName = `ghcr.io/${repository.toLowerCase()}`;
  const tag = `v${version}`;
  const refs = [`${imageName}:${tag}`, `${imageName}:${version}`];
  const remoteTag = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { cwd: root });
  if (remoteTag) {
    const lines = remoteTag.split("\n").map(line => line.split(/\s+/));
    const target = lines.find(([, ref]) => ref.endsWith("^{}"))?.[0] ?? lines[0][0];
    if (target !== sha) throw new Error("Published tag points at a different commit; tags must never be moved");
  }
  const existingReleaseText = optional(run, "gh", ["api", `repos/${repository}/releases/tags/${tag}`], ghMissing);
  const existingRelease = existingReleaseText ? JSON.parse(existingReleaseText) : null;
  if (existingRelease && !remoteTag) throw new Error("Release exists without the expected tag");
  const previousManifestAsset = existingRelease?.assets?.find(asset => asset.name === "published-manifest.json");
  if (existingRelease && !existingRelease.draft && !previousManifestAsset) {
    throw new Error("Published release lacks the verification manifest; do not replace historical artifacts");
  }
  if (previousManifestAsset) {
    const previous = JSON.parse(run("gh", ["api", `repos/${repository}/releases/assets/${previousManifestAsset.id}`, "-H", "Accept: application/octet-stream"]));
    for (const key of ["version", "sha", "imageId", "imageSha256"]) {
      if (previous[key] !== manifest[key]) throw new Error("Existing release manifest differs from this artifact");
    }
  }
  run("docker", ["load", "--input", imageFile]);
  assertImage(inspect(run, manifest.imageId), manifest);
  // Inspect every existing immutable destination before creating a tag, release,
  // or pushing anything. Registry errors other than absence fail closed.
  const existingImages = new Map();
  for (const ref of refs) {
    const remote = optional(run, "docker", ["manifest", "inspect", ref], imageMissing);
    if (remote !== null) {
      run("docker", ["pull", ref]);
      assertImage(inspect(run, ref), manifest);
      existingImages.set(ref, true);
    }
  }
  let advanceLatest = !release.prerelease;
  if (advanceLatest) {
    const latestText = optional(run, "docker", ["manifest", "inspect", `${imageName}:latest`], imageMissing);
    if (latestText !== null) {
      run("docker", ["pull", `${imageName}:latest`]);
      const currentImage = inspect(run, `${imageName}:latest`);
      const currentVersion = currentImage?.Config?.Labels?.["org.opencontainers.image.version"];
      const comparison = compareStableVersions(version, currentVersion);
      if (comparison === 0) assertImage(currentImage, manifest);
      advanceLatest = comparison >= 0;
    }
    const githubLatestText = optional(run, "gh", ["api", `repos/${repository}/releases/latest`], ghMissing);
    if (githubLatestText !== null) {
      const currentVersion = JSON.parse(githubLatestText).tag_name?.replace(/^v/, "");
      advanceLatest = advanceLatest && compareStableVersions(version, currentVersion) >= 0;
    }
  }
  const plan = { version, sha, imageId: manifest.imageId, imageSha256: manifest.imageSha256, tags: refs, prerelease: release.prerelease, advanceLatest };
  if (!publish) return { ...plan, dryRun: true };

  if (!remoteTag) {
    const object = JSON.parse(run("gh", ["api", "--method", "POST", `repos/${repository}/git/tags`, "-f", `tag=${tag}`, "-f", `message=Release ${tag}`, "-f", `object=${sha}`, "-f", "type=commit"]));
    run("gh", ["api", "--method", "POST", `repos/${repository}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${object.sha}`]);
  }
  const noteFile = path.join(directory, "release-notes.md");
  writeFileSync(noteFile, release.notes);
  if (!existingRelease) {
    run("gh", ["release", "create", tag, "--repo", repository, "--verify-tag", "--draft", "--title", tag, "--notes-file", noteFile, "--latest=false", ...(release.prerelease ? ["--prerelease"] : [])]);
  }
  for (const ref of refs) {
    if (!existingImages.has(ref)) {
      run("docker", ["tag", manifest.imageId, ref]);
      run("docker", ["push", ref]);
    }
  }
  // Check the published artifact using an empty Docker config, not the publisher's credentials.
  const anonymousConfig = mkdtempSync(path.join(os.tmpdir(), "kanbalone-release-pull-"));
  let digest;
  try {
    writeFileSync(path.join(anonymousConfig, "config.json"), "{}\n");
    for (const ref of refs) {
      run("docker", ["--config", anonymousConfig, "pull", ref]);
      const remote = inspect(run, ref, ["--config", anonymousConfig]);
      assertImage(remote, manifest);
      const repositoryDigest = remote.RepoDigests?.find(value => value.startsWith(`${imageName}@sha256:`));
      if (!repositoryDigest) throw new Error("Registry digest missing after anonymous pull");
      if (digest && digest !== repositoryDigest) throw new Error("Published version tags refer to different registry digests");
      digest = repositoryDigest;
    }
  } finally { rmSync(anonymousConfig, { recursive: true, force: true }); }
  const result = { ...manifest, repository, registryDigest: digest, tags: refs, releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`, advanceLatest };
  const manifestFile = path.join(directory, "published-manifest.json");
  writeFileSync(manifestFile, `${JSON.stringify(result, null, 2)}\n`);
  if (!existingRelease || existingRelease.draft) {
    run("gh", ["release", "upload", tag, manifestFile, "--repo", repository, "--clobber"]);
    run("gh", ["release", "edit", tag, "--repo", repository, "--draft=false", "--latest=false", "--notes-file", noteFile]);
  }
  if (advanceLatest) {
    run("docker", ["tag", manifest.imageId, `${imageName}:latest`]);
    run("docker", ["push", `${imageName}:latest`]);
    run("gh", ["release", "edit", tag, "--repo", repository, "--latest"]);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(publishRelease({
    version: process.env.RELEASE_VERSION,
    sha: process.env.RELEASE_SHA,
    repository: process.env.GITHUB_REPOSITORY,
    artifactDirectory: process.env.RELEASE_ARTIFACT_DIR ?? "release-artifact",
    publish: process.env.RELEASE_PUBLISH === "true",
  }), null, 2));
}
