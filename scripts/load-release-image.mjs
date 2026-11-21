import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File } from "./package-release-image.mjs";
import { runCommand } from "./smoke-image.mjs";
import { parseVersion } from "./release-common.mjs";

const exec = promisify(execFile);
const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const validDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value);
async function archiveBytes(file, entry) {
  // Read named metadata without extracting any archive paths into the host filesystem.
  const { stdout } = await exec("tar", ["-xOf", file, "--", entry], {
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120000,
  });
  return stdout;
}

export async function archiveIdentity(file, ciImageId) {
  assert.ok(validDigest(ciImageId), "Invalid CI image ID");
  const entries = JSON.parse(await archiveBytes(file, "manifest.json"));
  assert.equal(entries.length, 1, "Expected one saved platform image");
  const entry = entries[0];
  assert.match(
    entry.Config,
    /^(?:blobs\/sha256\/[a-f0-9]{64}|[a-f0-9]{64}\.json)$/,
  );
  const configBytes = await archiveBytes(file, entry.Config);
  const configId = digest(configBytes);
  assert.ok(
    entry.Config.includes(configId.slice(7)),
    "Config filename/digest mismatch",
  );
  const config = JSON.parse(configBytes);
  assert.ok(
    Array.isArray(config.rootfs?.diff_ids) &&
      config.rootfs.diff_ids.every(validDigest),
  );
  assert.ok(Array.isArray(entry.Layers));
  assert.equal(entry.Layers.length, config.rootfs.diff_ids.length);
  if (ciImageId !== configId) {
    // Containerd stores expose a manifest ID; classic stores expose its config ID.
    // Prove their relationship from the checksum-verified archive, never from labels alone.
    const bytes = await archiveBytes(
      file,
      `blobs/sha256/${ciImageId.slice(7)}`,
    );
    assert.equal(digest(bytes), ciImageId, "CI manifest digest mismatch");
    const manifest = JSON.parse(bytes);
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(
      manifest.config.digest,
      configId,
      "CI manifest references another config",
    );
    assert.deepEqual(
      manifest.layers.map((layer) => {
        assert.ok(validDigest(layer.digest));
        return `blobs/sha256/${layer.digest.slice(7)}`;
      }),
      entry.Layers,
      "Saved layer sequence differs from CI manifest",
    );
  }
  return { configId, config };
}

export async function loadReleaseImage(
  directory,
  { expectedSha, expectedVersion, run = runCommand } = {},
) {
  assert.match(
    expectedSha ?? "",
    /^[a-f0-9]{40}$/,
    "Provide the reviewed RELEASE_SHA",
  );
  parseVersion(expectedVersion);
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sha, expectedSha, "Unexpected release SHA");
  assert.equal(manifest.version, expectedVersion, "Unexpected release version");
  assert.equal(manifest.platform, "linux/amd64");
  assert.equal(manifest.imageFile, "image.tar");
  assert.match(manifest.imageSha256, /^[a-f0-9]{64}$/);
  const file = path.resolve(directory, manifest.imageFile);
  assert.equal(
    await sha256File(file),
    manifest.imageSha256,
    "Artifact checksum mismatch",
  );
  const { configId, config } = await archiveIdentity(file, manifest.imageId);
  assert.equal(config.os, "linux");
  assert.equal(config.architecture, "amd64");
  assert.equal(
    config.config?.Labels?.["org.opencontainers.image.revision"],
    expectedSha,
  );
  assert.equal(
    config.config?.Labels?.["org.opencontainers.image.version"],
    expectedVersion,
  );
  await run("docker", ["load", "--input", file]);
  let loaded;
  const errors = [];
  for (const id of new Set([manifest.imageId, configId])) {
    try {
      const images = JSON.parse(await run("docker", ["image", "inspect", id]));
      assert.equal(images.length, 1);
      loaded = images[0];
      break;
    } catch (error) {
      errors.push(error);
    }
  }
  if (!loaded)
    throw new AggregateError(errors, "Neither verified image ID was loaded");
  assert.ok(
    [manifest.imageId, configId].includes(loaded.Id),
    "Unrelated local image ID",
  );
  assert.equal(loaded.Os, config.os);
  assert.equal(loaded.Architecture, config.architecture);
  assert.deepEqual(
    loaded.RootFS.Layers,
    config.rootfs.diff_ids,
    "Loaded root filesystem differs",
  );
  assert.equal(
    loaded.Config?.Labels?.["org.opencontainers.image.revision"],
    expectedSha,
  );
  assert.equal(
    loaded.Config?.Labels?.["org.opencontainers.image.version"],
    expectedVersion,
  );
  return {
    version: expectedVersion,
    sha: expectedSha,
    imageSha256: manifest.imageSha256,
    ciImageId: manifest.imageId,
    configId,
    localImageId: loaded.Id,
    platform: manifest.platform,
    verifiedAt: new Date().toISOString(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const directory = process.argv[2] ?? "release-artifact";
  rm(path.join(directory, "loaded-image.json"), { force: true })
    .then(() =>
      loadReleaseImage(directory, {
        expectedSha: process.env.RELEASE_SHA,
        expectedVersion: process.env.RELEASE_VERSION,
      }),
    )
    .then(async (report) => {
      await writeFile(
        path.join(directory, "loaded-image.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
