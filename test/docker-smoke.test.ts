import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
const smokeScript = "../scripts/smoke-image.mjs";
const packageScript = "../scripts/package-release-image.mjs";
const { smokeImage } = await import(smokeScript);
const { packageReleaseImage } = await import(packageScript);
const sha = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;
const options = { image: "kanbalone:release-check", version: "1.0.0-rc.1", sha };

function fixture({ loseData = false, failRun = false, wrongRevision = false, missingAssets = false, legacyAssets = false } = {}) {
  const commands: string[][] = [];
  const js = legacyAssets ? "/app.js" : "/generated/app-ABCD1234.js";
  const css = legacyAssets ? "/styles.css" : "/generated/styles-ABCD1234.css";
  let body = "";
  let restarted = false;
  const run = async (command: string, args: string[]) => {
    commands.push([command, ...args]);
    if (args[0] === "image") return JSON.stringify([{ Id: imageId, Os: "linux", Architecture: "amd64", Config: { Labels: {
      "org.opencontainers.image.revision": wrongRevision ? "c".repeat(40) : sha,
      "org.opencontainers.image.version": options.version,
    } } }]);
    if (args[0] === "inspect") return JSON.stringify([{ HostIp: "127.0.0.1", HostPort: restarted ? "45679" : "45678" }]);
    if (args[0] === "logs") return "CI fixture server logs";
    if (args[0] === "run" && failRun) throw new Error("Docker run failed");
    if (args[0] === "restart") restarted = true;
    return "";
  };
  const fetcher = async (url: string, init: RequestInit = {}) => {
    assert.equal(new URL(url).origin, `http://127.0.0.1:${restarted ? "45679" : "45678"}`, "use the current port after restart");
    const endpoint = new URL(url).pathname;
    if (endpoint === "/api/health") return Response.json({ ok: true });
    if (endpoint === "/api/meta") return Response.json({ name: "Kanbalone", version: options.version });
    if (endpoint === "/api/boards") return Response.json({ board: { id: 1 }, lanes: [{ id: 2 }] });
    if (endpoint === "/api/boards/1/tickets") return Response.json({ id: 3 });
    if (endpoint === "/tickets/3") return new Response(
      `<link rel="stylesheet" href="${css}"><script type="module" src="${js}"></script>`,
      { headers: { "content-type": "text/html" } },
    );
    if (endpoint === css) return new Response("body{}", { headers: { "content-type": "text/css" } });
    if (endpoint === js) return new Response("export {};", {
      status: missingAssets ? 404 : 200,
      headers: { "content-type": "text/javascript" },
    });
    if (init.method === "PATCH") { body = JSON.parse(String(init.body)).bodyMarkdown; return Response.json({ id: 3 }); }
    assert.equal(endpoint, "/api/tickets/3");
    assert.ok(restarted, "readback must happen after restart");
    return Response.json({ id: 3, title: "CI persistence", bodyMarkdown: loseData ? "" : body, boardId: 1, laneId: 2 });
  };
  return { commands, run, fetch: fetcher, pause: async () => {} };
}

test("smoke verifies persistence after the host port changes on restart, using owned resources", async () => {
  const fake = fixture();
  const result = await smokeImage(options, fake);
  assert.equal(result.persistenceVerified, true);
  assert.equal(result.assetsVerified, true);
  const run = fake.commands.find((args) => args[1] === "run")!;
  assert.equal(run.at(-1), imageId);
  assert.ok(run.includes("127.0.0.1::3000"));
  const cleanup = fake.commands.filter((args) => args[1] === "rm" || args[1] === "volume" && args[2] === "rm");
  assert.equal(cleanup.length, 2);
  assert.match(cleanup[0].at(-1)!, /^kanbalone-ci-[0-9a-f-]+$/);
  assert.match(cleanup[1].at(-1)!, /^kanbalone-ci-data-[0-9a-f-]+$/);
});

test("lost persistence fails the smoke while cleaning only its own container and volume", async () => {
  const fake = fixture({ loseData: true });
  await assert.rejects(smokeImage(options, fake), /did not persist[\s\S]*CI fixture server logs/);
  assert.deepEqual(fake.commands.slice(-2).map((args) => args.slice(0, 3)), [["docker", "rm", "--force"], ["docker", "volume", "rm"]]);
});

test("missing bundled browser assets fail the deployed image smoke", async () => {
  const fake = fixture({ missingAssets: true });
  await assert.rejects(smokeImage(options, fake), /Missing browser asset \/generated\/app-ABCD1234.js/);
});

test("smoke can verify a runtime that still references source asset URLs", async () => {
  const fake = fixture({ legacyAssets: true });
  assert.equal((await smokeImage(options, fake)).assetsVerified, true);
});

test("partial container startup is cleaned; wrong revision never starts any container", async () => {
  const failed = fixture({ failRun: true });
  await assert.rejects(smokeImage(options, failed), /Docker run failed/);
  assert.ok(failed.commands.some((args) => args[1] === "rm"));
  assert.ok(failed.commands.some((args) => args[1] === "volume" && args[2] === "rm"));
  const wrong = fixture({ wrongRevision: true });
  await assert.rejects(smokeImage(options, wrong), /revision/);
  assert.equal(wrong.commands.length, 1);
});

test("packaging saves exactly the tested image and hashes its bytes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kanbalone-image-package-"));
  try {
    const bytes = Buffer.from("fake Docker archive: byte identity test");
    const run = async (command: string, args: string[]) => {
      assert.equal(command, "docker");
      assert.deepEqual(args, ["save", "--output", path.join(directory, "image.tar"), imageId]);
      await writeFile(args[2], bytes); return "";
    };
    const manifest = await packageReleaseImage(options, directory, {
      run, smoke: async () => ({ imageId, persistenceVerified: true }),
    });
    assert.equal(manifest.imageSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(manifest.sha, sha);
    assert.equal(manifest.imageId, imageId);
    assert.equal(manifest.imageFile, "image.tar");
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")), manifest);
    await assert.rejects(packageReleaseImage(options, directory, {
      smoke: async () => { throw new Error("Smoke failed"); },
      run: async () => { assert.fail("must not save failed image"); },
    }), /Smoke failed/);
    await assert.rejects(readFile(path.join(directory, "manifest.json")), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
