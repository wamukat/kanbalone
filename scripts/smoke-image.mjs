import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
export async function runCommand(command, args) {
  const result = await exec(command, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return (command === "docker" && args[0] === "logs" ? result.stdout + result.stderr : result.stdout).trim();
}

export function imageOptionsFromEnvironment(env = process.env) {
  return { image: env.IMAGE_REF || "kanbalone:release-check", version: env.RELEASE_VERSION, sha: env.RELEASE_SHA };
}

export function validateImageOptions({ image, version, sha }) {
  if (!image || image.startsWith("-") || /\s/.test(image)) throw new Error("A valid image reference is required");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version || "")) throw new Error("RELEASE_VERSION is required and must be a version");
  if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("RELEASE_SHA must be a full commit SHA");
}

export async function inspectExpectedImage(options, run = runCommand) {
  validateImageOptions(options);
  const [metadata] = JSON.parse(await run("docker", ["image", "inspect", options.image]));
  if (!/^sha256:[0-9a-f]{64}$/.test(metadata?.Id || "")) throw new Error("Invalid Docker image ID");
  if (metadata.Os !== "linux" || metadata.Architecture !== "amd64") throw new Error("Expected a linux/amd64 image");
  const labels = metadata.Config?.Labels ?? {};
  if (labels["org.opencontainers.image.revision"] !== options.sha) throw new Error("Image revision does not match release SHA");
  if (labels["org.opencontainers.image.version"] !== options.version) throw new Error("Image version does not match release version");
  return metadata.Id;
}

export async function smokeImage(options, dependencies = {}) {
  const run = dependencies.run ?? runCommand;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const pause = dependencies.pause ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const imageId = await inspectExpectedImage(options, run);
  const suffix = randomUUID();
  const container = `kanbalone-ci-${suffix}`;
  const volume = `kanbalone-ci-data-${suffix}`;
  let volumeCreated = false;
  let runAttempted = false;
  let failure;
  let report;
  try {
    await run("docker", ["volume", "create", volume]);
    volumeCreated = true;
    runAttempted = true;
    await run("docker", ["run", "--detach", "--name", container, "--platform", "linux/amd64", "--publish", "127.0.0.1::3000", "--mount", `type=volume,source=${volume},target=/app/data`, imageId]);
    async function containerOrigin() {
      const bindings = JSON.parse(await run("docker", ["inspect", "--format", '{{json (index .NetworkSettings.Ports "3000/tcp")}}', container]));
      const binding = bindings?.find((item) => item.HostIp === "127.0.0.1");
      const port = Number(binding?.HostPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Docker did not bind an isolated loopback port");
      return `http://127.0.0.1:${port}`;
    }
    let origin = await containerOrigin();
    async function api(endpoint, method = "GET", data) {
      const response = await fetcher(`${origin}${endpoint}`, {
        method, signal: AbortSignal.timeout(3000),
        ...(data === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
      });
      if (!response.ok) throw new Error(`${method} ${endpoint} returned ${response.status}`);
      return response.json();
    }
    async function ready() {
      let last;
      for (let attempt = 0; attempt < 60; attempt++) {
        try { if ((await api("/api/health")).ok) return; } catch (error) { last = error; }
        await pause(500);
      }
      throw new Error(`Image did not become healthy: ${last?.message ?? "health response not ok"}`);
    }
    async function verifyVersion() {
      const meta = await api("/api/meta");
      if (meta.name !== "Kanbalone" || meta.version !== options.version) throw new Error("Runtime metadata does not match release version");
    }
    await ready();
    await verifyVersion();
    const board = await api("/api/boards", "POST", { name: "CI isolated persistence check", laneNames: ["Inbox"] });
    const ticket = await api(`/api/boards/${board.board.id}/tickets`, "POST", { laneId: board.lanes[0].id, title: "CI persistence", bodyMarkdown: "Before update" });
    const persistedBody = `Saved before restart: ${options.sha}`;
    await api(`/api/tickets/${ticket.id}`, "PATCH", { bodyMarkdown: persistedBody });
    await run("docker", ["restart", container]);
    // Docker can allocate a different ephemeral host port on restart.
    origin = await containerOrigin();
    await ready();
    await verifyVersion();
    const stored = await api(`/api/tickets/${ticket.id}`);
    if (stored.title !== "CI persistence" || stored.bodyMarkdown !== persistedBody || stored.boardId !== board.board.id || stored.laneId !== board.lanes[0].id) {
      throw new Error("Ticket did not persist across container restart");
    }
    report = { imageId, platform: "linux/amd64", version: options.version, sha: options.sha, persistenceVerified: true };
  } catch (error) {
    failure = error;
    if (runAttempted) {
      try {
        const logs = await run("docker", ["logs", "--tail", "50", container]);
        failure = new Error(`${error.message}\nContainer ${container} logs:\n${logs || "(no logs)"}`, { cause: error });
      } catch { /* Preserve the original failure if the container never started. */ }
    }
  }
  finally {
    const cleanupErrors = [];
    if (runAttempted) {
      try { await run("docker", ["rm", "--force", container]); } catch (error) { cleanupErrors.push(error); }
    }
    if (volumeCreated) {
      try { await run("docker", ["volume", "rm", volume]); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], "Smoke test cleanup failed; inspect only the named CI resources");
  }
  if (failure) throw failure;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = imageOptionsFromEnvironment();
  if (process.argv[2]) options.image = process.argv[2];
  smokeImage(options).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => {
    console.error(error); process.exitCode = 1;
  });
}
