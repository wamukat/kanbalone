import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertReleaseImage, loadVerifiedReleaseImage } from "./load-release-image.mjs";
import { command, compareStableVersions, verifyRelease } from "./release-common.mjs";
import { downloadCandidate } from "./release-source.mjs";

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

function findRelease(run, repository, tag) {
  const releases = `repos/${repository}/releases`;
  const published = optional(run, "gh", ["api", `${releases}/tags/${tag}`], ghMissing);
  if (published !== null) return JSON.parse(published);
  // The tag lookup can miss drafts. The authenticated list includes them.
  const filter = `.[] | select(.tag_name == ${JSON.stringify(tag)})`;
  const matching = run("gh", ["api", `${releases}?per_page=100`, "--paginate", "--jq", filter]);
  const matches = matching ? matching.split("\n") : [];
  if (matches.length > 1) throw new Error("Multiple releases match the selected version tag");
  return matches.length ? JSON.parse(matches[0]) : null;
}

/** All external operations are argument arrays. Tests supply a command runner;
 * the normal CLI is read-only remotely unless RELEASE_PUBLISH=true is explicit.
 */
export async function publishRelease({
  version, sha, repository, repositoryId, candidateArtifactId,
  artifactDirectory = "release-artifact", root = process.cwd(), run = command, writeOutput, publish = false,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) throw new Error("GITHUB_REPOSITORY must be owner/repository");
  const release = verifyRelease({ version, sha, root, run });
  const directory = path.resolve(root, artifactDirectory);
  const source = publish ? await downloadCandidate(directory, {
    repository, repositoryId, version, artifactId: candidateArtifactId, root, run, writeOutput,
  }) : null;
  const verified = await loadVerifiedReleaseImage(directory, {
    expectedSha: sha, expectedVersion: version, requirePersistence: publish, run,
  });
  const { manifest, localImageId, configId } = verified;
  const imageName = `ghcr.io/${repository.toLowerCase()}`;
  const tag = `v${version}`;
  const tagRef = `refs/tags/${tag}`;
  const tagMessage = source && `Release ${tag}\n\nCandidate artifact ID: ${source.artifactId}\nArtifact ZIP digest: ${source.artifactDigest}\nImage archive SHA-256: ${manifest.imageSha256}`;
  const refs = [`${imageName}:${tag}`, `${imageName}:${version}`];
  const remoteTags = run("git", ["ls-remote", "--tags", "origin", tagRef, `${tagRef}^{}`], { cwd: root });
  const tagLines = new Map(remoteTags.split("\n").map(line => {
    const [objectId, ref] = line.split(/\s+/);
    return [ref, objectId];
  }));
  const tagObject = tagLines.get(tagRef);
  if (tagObject) {
    const peeled = tagLines.get(`${tagRef}^{}`);
    if ((peeled ?? tagObject) !== sha) throw new Error("Published tag points at a different commit; tags must never be moved");
    if (source) {
      if (!peeled) throw new Error("Existing tag lacks the verified candidate binding; tags must never be moved");
      const annotation = JSON.parse(run("gh", ["api", `repos/${repository}/git/tags/${tagObject}`]));
      if (annotation.tag !== tag || annotation.object?.type !== "commit" || annotation.object?.sha !== sha ||
          annotation.message?.trimEnd() !== tagMessage) {
        throw new Error("Existing tag does not record the selected candidate artifact; tags must never be moved");
      }
    }
  }
  const existingRelease = findRelease(run, repository, tag);
  if (existingRelease && !tagObject) throw new Error("Release exists without the expected tag");
  const previousManifestAsset = existingRelease?.assets?.find(asset => asset.name === "published-manifest.json");
  if (existingRelease && !existingRelease.draft && !previousManifestAsset) {
    throw new Error("Published release lacks the verification manifest; do not replace historical artifacts");
  }
  if (previousManifestAsset) {
    const previous = JSON.parse(run("gh", ["api", `repos/${repository}/releases/assets/${previousManifestAsset.id}`, "-H", "Accept: application/octet-stream"]));
    for (const key of ["version", "sha", "imageId", "imageSha256"]) {
      if (previous[key] !== manifest[key]) throw new Error("Existing release manifest differs from this artifact");
    }
    if (source && !isDeepStrictEqual(previous.source, source)) {
      throw new Error("Existing release manifest records a different candidate artifact");
    }
  }
  // Inspect every existing immutable destination before creating a tag, release,
  // or pushing anything. Registry errors other than absence fail closed.
  const existingImages = new Map();
  for (const ref of refs) {
    const remote = optional(run, "docker", ["manifest", "inspect", ref], imageMissing);
    if (remote !== null) {
      run("docker", ["pull", ref]);
      assertReleaseImage(inspect(run, ref), verified);
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
      if (comparison === 0) assertReleaseImage(currentImage, verified);
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

  if (!tagObject) {
    const object = JSON.parse(run("gh", ["api", "--method", "POST", `repos/${repository}/git/tags`, "-f", `tag=${tag}`, "-f", `message=${tagMessage}`, "-f", `object=${sha}`, "-f", "type=commit"]));
    run("gh", ["api", "--method", "POST", `repos/${repository}/git/refs`, "-f", `ref=${tagRef}`, "-f", `sha=${object.sha}`]);
  }
  const noteFile = path.join(directory, "release-notes.md");
  writeFileSync(noteFile, release.notes);
  if (!existingRelease) {
    run("gh", ["release", "create", tag, "--repo", repository, "--verify-tag", "--draft", "--title", tag, "--notes-file", noteFile, "--latest=false", ...(release.prerelease ? ["--prerelease"] : [])]);
  }
  for (const ref of refs) {
    if (!existingImages.has(ref)) {
      run("docker", ["tag", localImageId, ref]);
      run("docker", ["push", ref]);
    }
  }
  // Check the published artifact using an empty Docker config, not the publisher's credentials.
  const anonymousConfig = mkdtempSync(path.join(os.tmpdir(), "kanbalone-release-pull-"));
  let digest;
  try {
    writeFileSync(path.join(anonymousConfig, "config.json"), "{}\n");
    for (const ref of refs) {
      const pull = run("docker", ["--config", anonymousConfig, "pull", ref]);
      const remote = inspect(run, ref, ["--config", anonymousConfig]);
      assertReleaseImage(remote, verified);
      const pulledDigest = /^Digest: (sha256:[a-f0-9]{64})$/m.exec(pull)?.[1];
      const repositoryDigest = `${imageName}@${pulledDigest}`;
      if (!pulledDigest || !remote.RepoDigests?.includes(repositoryDigest)) throw new Error("Registry digest missing after anonymous pull");
      if (digest && digest !== repositoryDigest) throw new Error("Published version tags refer to different registry digests");
      digest = repositoryDigest;
    }
  } finally { rmSync(anonymousConfig, { recursive: true, force: true }); }
  const result = { ...manifest, configId, repository, source, registryDigest: digest, tags: refs, releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`, advanceLatest };
  const manifestFile = path.join(directory, "published-manifest.json");
  writeFileSync(manifestFile, `${JSON.stringify(result, null, 2)}\n`);
  if (!existingRelease || existingRelease.draft) {
    run("gh", ["release", "upload", tag, manifestFile, "--repo", repository, "--clobber"]);
    run("gh", ["release", "edit", tag, "--repo", repository, "--draft=false", "--latest=false", "--notes-file", noteFile]);
  }
  if (advanceLatest) {
    run("docker", ["tag", localImageId, `${imageName}:latest`]);
    run("docker", ["push", `${imageName}:latest`]);
    run("gh", ["release", "edit", tag, "--repo", repository, "--latest"]);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishRelease({
    version: process.env.RELEASE_VERSION,
    sha: process.env.RELEASE_SHA,
    repository: process.env.GITHUB_REPOSITORY,
    repositoryId: process.env.GITHUB_REPOSITORY_ID,
    candidateArtifactId: process.env.CANDIDATE_ARTIFACT_ID,
    artifactDirectory: process.env.RELEASE_ARTIFACT_DIR ?? "release-artifact",
    publish: process.env.RELEASE_PUBLISH === "true",
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
