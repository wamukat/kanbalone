import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const evidence = resolve(root, "coverage/subsecond-data");
const fixture = resolve(evidence, "fixture.sqlite");
const base = process.argv[2] ? resolve(process.argv[2]) : null;
const candidate = process.argv[3] ? resolve(process.argv[3]) : root;
const samples = Number(process.env.SUBSECOND_SAMPLES ?? 6);
const delayMs = Number(process.env.SUBSECOND_DELAY_MS ?? 0);
const onlyPhase = process.env.SUBSECOND_ONLY_PHASE;
const seekPhases = ["control", "tuple-only", "index-only", "tuple-and-index"]
  .map(phase => [phase, resolve(evidence, "seek-variants", phase)]);
const phases = (process.env.SUBSECOND_SEEK_VARIANTS === "1"
  ? seekPhases : base ? [["baseline", base], ["candidate", candidate]] : [["baseline", root]])
  .filter(([phase]) => !onlyPhase || onlyPhase === phase);
const label = process.env.SUBSECOND_LABEL ?? (base ? "paired" : "baseline");
const output = resolve(evidence, `api-${label}-${delayMs}.json`);
const temp = await mkdtemp(resolve(tmpdir(), "kanbalone-subsecond-api-"));
const apps = new Map();
const records = [];
const hash = value => createHash("sha256").update(value).digest("hex");
const variant = process.env.SUBSECOND_FIXTURE_VARIANT ?? "mixed";

async function launch(phase, source) {
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const { collectTicketPages } = await import(pathToFileURL(resolve(source, "public/app-ticket-pages.js")));
  const { loadListTicketCollection, loadKanbanTicketCollections } =
    await import(pathToFileURL(resolve(source, "public/app-ticket-collections.js")));
  const dbFile = resolve(temp, phase + ".sqlite");
  await cp(fixture, dbFile);
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const started = new WeakMap();
  app.addHook("onRequest", async request => started.set(request, { begin: performance.now() }));
  app.addHook("preSerialization", async (request, _reply, payload) => {
    started.get(request).serializedAt = performance.now();
    return payload;
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const { begin, serializedAt } = started.get(request);
    if (serializedAt != null) {
      reply.header("x-probe-generation-ms", String(serializedAt - begin));
      reply.header("x-probe-serialization-ms", String(performance.now() - serializedAt));
    }
    return payload;
  });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, url, collectTicketPages, loadListTicketCollection, loadKanbanTicketCollections };
}

async function sample(phase, boardId, scenario, run) {
  const { url, collectTicketPages, loadListTicketCollection, loadKanbanTicketCollections } = apps.get(phase);
  const requests = [];
  const base = `/api/boards/${boardId}`;
  const start = performance.now();
  async function api(path) {
    const begin = performance.now();
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const response = await fetch(new URL(path, url));
    const headersAt = performance.now();
    const text = await response.text();
    const bodyAt = performance.now();
    assert.equal(response.status, 200, `${phase} ${path}: ${text.slice(0, 200)}`);
    const packet = JSON.parse(text);
    const end = performance.now();
    const revision = response.headers.get("X-Kanbalone-Ticket-Revision");
    if (revision) Object.defineProperty(packet, "ticketRevision", { value: revision });
    const pageLimit = Number(response.headers.get("X-Kanbalone-Ticket-Page-Limit"));
    if (Number.isSafeInteger(pageLimit) && pageLimit > 0) Object.defineProperty(packet, "ticketPageLimit", { value: pageLimit });
    requests.push({
      path, rows: packet.tickets?.length, bytes: Buffer.byteLength(text), startedMs: begin - start, readyMs: end - start,
      generationMs: Number(response.headers.get("x-probe-generation-ms")),
      serializationMs: Number(response.headers.get("x-probe-serialization-ms")), headersMs: headersAt - begin,
      bodyMs: bodyAt - headersAt, parseMs: end - bodyAt,
    });
    return packet;
  }
  let result;
  if (scenario === "kanban") {
    const shell = await api(base);
    result = await loadKanbanTicketCollections(api, shell.lanes, base + "/tickets", { limits: new Map(), isCurrent: () => true });
  } else {
    const filters = scenario === "list-all-archives" ? "?archived=all"
      : scenario === "list-partial" ? "?priority=4"
      : scenario === "search-common" ? "?q=notification"
      : "";
    result = await loadListTicketCollection(api, base + "/tickets" + filters, { isCurrent: () => true });
  }
  const elapsedMs = performance.now() - start;
  return {
    phase, run, scenario, boardId, elapsedMs,
    count: result.tickets.length, referenceCount: result.referenceTickets?.length,
    hash: hash(JSON.stringify([result.tickets, result.referenceTickets])),
    requests,
  };
}

const scenarios = process.env.SUBSECOND_SCENARIOS?.split(",") ??
  ["list-active", "list-all-archives", "list-partial", "kanban", "search-common"];
await mkdir(evidence, { recursive: true });
try {
  for (const [phase, source] of phases) apps.set(phase, await launch(phase, source));
  for (const scenario of scenarios) {
    for (const boardId of [1, 2]) {
      let expected;
      for (let run = 0; run < samples; run += 1) {
        const offset = run % phases.length;
        const order = [...phases.slice(offset), ...phases.slice(0, offset)];
        for (const [phase] of order) {
          const record = await sample(phase, boardId, scenario, run);
          expected ??= record.hash;
          assert.equal(record.hash, expected, `${scenario} board=${boardId} phase=${phase}: rows or order diverged`);
          records.push(record);
        }
      }
      for (const [phase] of phases) {
        const runs = records.filter(sample => sample.phase === phase && sample.scenario === scenario && sample.boardId === boardId && sample.run > 0);
        const elapsed = runs.map(sample => sample.elapsedMs).sort((a, b) => a - b);
        console.log(phase, variant, scenario, boardId, runs[0].count, runs[0].requests.length, elapsed[Math.floor(elapsed.length / 2)].toFixed(1),
          elapsed.map(value => value.toFixed(1)).join(","));
      }
    }
  }
} finally {
  for (const { app } of apps.values()) await app.close();
  await rm(temp, { recursive: true, force: true });
  await writeFile(output, JSON.stringify({ runtime: process.version, fixture: hash(await readFile(fixture)),
    maxRssKiB: process.resourceUsage().maxRSS, variant, delayMs, records }, null, 2) + "\n");
}
