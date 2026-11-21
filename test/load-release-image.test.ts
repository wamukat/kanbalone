import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const script = "../scripts/load-release-image.mjs";
const { loadReleaseImage } = await import(script);
const sha = "a".repeat(40),
  version = "1.0.0-rc.1";
const hash = (x: string | Buffer) =>
  createHash("sha256").update(x).digest("hex");
function fixture(
  t: any,
  { classicArchive = false, badConfigLink = false } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), "kanbalone-artifact-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const content = path.join(root, "content");
  mkdirSync(path.join(content, "blobs", "sha256"), { recursive: true });
  const config = {
    os: "linux",
    architecture: "amd64",
    config: {
      Labels: {
        "org.opencontainers.image.revision": sha,
        "org.opencontainers.image.version": version,
      },
    },
    rootfs: { type: "layers", diff_ids: [`sha256:${"b".repeat(64)}`] },
  };
  const bytes = JSON.stringify(config),
    configId = `sha256:${hash(bytes)}`;
  const configPath = classicArchive
    ? `${hash(bytes)}.json`
    : `blobs/sha256/${hash(bytes)}`;
  writeFileSync(path.join(content, configPath), bytes);
  const layer = "fixture layer",
    layerPath = `blobs/sha256/${hash(layer)}`;
  writeFileSync(path.join(content, layerPath), layer);
  const imageManifest = JSON.stringify({
    schemaVersion: 2,
    config: { digest: badConfigLink ? `sha256:${"c".repeat(64)}` : configId },
    layers: [{ digest: `sha256:${hash(layer)}` }],
  });
  const ciImageId = classicArchive ? configId : `sha256:${hash(imageManifest)}`;
  writeFileSync(
    path.join(content, "blobs", "sha256", hash(imageManifest)),
    imageManifest,
  );
  writeFileSync(
    path.join(content, "manifest.json"),
    JSON.stringify([{ Config: configPath, Layers: [layerPath] }]),
  );
  execFileSync("tar", [
    "-cf",
    path.join(root, "image.tar"),
    "-C",
    content,
    "manifest.json",
    classicArchive ? configPath : "blobs",
    ...(classicArchive ? ["blobs"] : []),
  ]);
  const manifest = {
    schemaVersion: 1,
    version,
    sha,
    imageId: ciImageId,
    imageFile: "image.tar",
    imageSha256: hash(readFileSync(path.join(root, "image.tar"))),
    platform: "linux/amd64",
  };
  writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  const calls: string[][] = [];
  const run = async (_: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "load") return "Loaded";
    // Simulate a classic store: the CI manifest ID is not a local config ID.
    if (args[2] !== configId) throw new Error("No such image");
    return JSON.stringify([
      {
        Id: configId,
        Os: "linux",
        Architecture: "amd64",
        Config: config.config,
        RootFS: { Layers: config.rootfs.diff_ids },
      },
    ]);
  };
  return { root, config, configId, ciImageId, manifest, calls, run };
}

test("loads a containerd archive into a classic store using proven config identity", async (t) => {
  const f = fixture(t);
  const result = await loadReleaseImage(f.root, {
    expectedSha: sha,
    expectedVersion: version,
    run: f.run,
  });
  assert.equal(result.ciImageId, f.ciImageId);
  assert.equal(result.localImageId, f.configId);
  assert.equal(f.calls.filter((x) => x[0] === "image").length, 2);
});
test("keeps the manifest ID when the receiving store supports it", async (t) => {
  const f = fixture(t);
  const run = async (_: string, args: string[]) =>
    args[0] === "load"
      ? "Loaded"
      : JSON.stringify([
          {
            Id: f.ciImageId,
            Os: "linux",
            Architecture: "amd64",
            Config: f.config.config,
            RootFS: { Layers: f.config.rootfs.diff_ids },
          },
        ]);
  const result = await loadReleaseImage(f.root, {
    expectedSha: sha,
    expectedVersion: version,
    run,
  });
  assert.equal(result.localImageId, f.ciImageId);
});
test("accepts classic docker save archives", async (t) => {
  const f = fixture(t, { classicArchive: true });
  const result = await loadReleaseImage(f.root, {
    expectedSha: sha,
    expectedVersion: version,
    run: f.run,
  });
  assert.equal(result.localImageId, f.configId);
});
test("rejects corrupted archives before invoking Docker", async (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, "image.tar"), "corrupt");
  await assert.rejects(
    loadReleaseImage(f.root, {
      expectedSha: sha,
      expectedVersion: version,
      run: f.run,
    }),
    /checksum/,
  );
  assert.deepEqual(f.calls, []);
});
test("rejects a wrong approved SHA before invoking Docker", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    loadReleaseImage(f.root, {
      expectedSha: "d".repeat(40),
      expectedVersion: version,
      run: f.run,
    }),
    /Unexpected release SHA/,
  );
  assert.deepEqual(f.calls, []);
});
test("rejects an archive whose manifest references another config", async (t) => {
  const f = fixture(t, { badConfigLink: true });
  await assert.rejects(
    loadReleaseImage(f.root, {
      expectedSha: sha,
      expectedVersion: version,
      run: f.run,
    }),
    /another config/,
  );
  assert.deepEqual(f.calls, []);
});
test("rejects a loaded image with different filesystem layers", async (t) => {
  const f = fixture(t);
  const run = async (_: string, args: string[]) =>
    args[0] === "load"
      ? "Loaded"
      : JSON.stringify([
          {
            Id: f.ciImageId,
            Os: "linux",
            Architecture: "amd64",
            Config: f.config.config,
            RootFS: { Layers: [`sha256:${"f".repeat(64)}`] },
          },
        ]);
  await assert.rejects(
    loadReleaseImage(f.root, {
      expectedSha: sha,
      expectedVersion: version,
      run,
    }),
    /filesystem differs/,
  );
});

test("CLI removes stale success records when verification fails", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, "loaded-image.json"), "old success");
  writeFileSync(path.join(f.root, "image.tar"), "corrupt");
  const result = spawnSync(
    process.execPath,
    ["scripts/load-release-image.mjs", f.root],
    {
      env: { ...process.env, RELEASE_VERSION: version, RELEASE_SHA: sha },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /checksum/);
  assert.equal(existsSync(path.join(f.root, "loaded-image.json")), false);
});
