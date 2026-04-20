import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE_URL = process.env.KANBALONE_BASE_URL ?? "http://127.0.0.1:3000";
const BOARD_NAME = process.env.KANBALONE_PERF_BOARD ?? "Perf 1000";
const RUNS = Number(process.env.KANBALONE_PERF_RUNS ?? "5");
const AGENT_BROWSER = process.env.AGENT_BROWSER_BIN ?? "agent-browser";
const AGENT_BROWSER_SESSION = process.env.AGENT_BROWSER_SESSION ?? "kanbalone-ui";

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${payload.error ?? response.statusText}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const percentileIndex = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    minMs: Number(sorted[0].toFixed(1)),
    avgMs: Number(average.toFixed(1)),
    p95Ms: Number(sorted[percentileIndex].toFixed(1)),
    maxMs: Number(sorted.at(-1).toFixed(1)),
  };
}

async function benchmarkJson(name, path) {
  const samples = [];
  let bytes = 0;

  await fetch(`${BASE_URL}${path}`).then((response) => response.arrayBuffer());

  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) {
      throw new Error(`GET ${path} failed during benchmark`);
    }
    const buffer = await response.arrayBuffer();
    samples.push(performance.now() - startedAt);
    bytes = buffer.byteLength;
  }

  return {
    name,
    path,
    responseBytes: bytes,
    ...summarize(samples),
  };
}

async function runBrowser(command, ...args) {
  const { stdout } = await execFileAsync(AGENT_BROWSER, command ? [command, ...args] : args, {
    env: {
      ...process.env,
      AGENT_BROWSER_SESSION,
    },
  });
  return stdout.trim();
}

function parseBrowserEval(output) {
  const parsed = JSON.parse(output);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

async function benchmarkBrowserNavigation(url) {
  await runBrowser("open", url);
  const json = await runBrowser(
    "eval",
    "JSON.stringify((() => { const nav = performance.getEntriesByType('navigation')[0]; return nav ? nav.toJSON() : null; })())",
  );
  const nav = parseBrowserEval(json);
  return {
    url,
    domContentLoadedMs: Number(nav.domContentLoadedEventEnd.toFixed(1)),
    loadEventMs: Number(nav.loadEventEnd.toFixed(1)),
  };
}

async function benchmarkViewSwitch() {
  await runBrowser("open", `${BASE_URL}/boards/${globalThis.__perfBoardId}`);
  const toListMs = Number(
    parseBrowserEval(await runBrowser(
      "eval",
      `(() => new Promise((resolve) => {
        const start = performance.now();
        const button = [...document.querySelectorAll('[data-view-mode]')].find((item) => item.dataset.viewMode === 'list');
        button.click();
        const check = () => {
          const list = document.querySelector('#list-board');
          const rows = document.querySelectorAll('.list-row').length;
          if (list && !list.hidden && rows > 0) {
            resolve((performance.now() - start).toFixed(1));
            return;
          }
          setTimeout(check, 25);
        };
        check();
      }))()`,
    )),
  );

  const toKanbanMs = Number(
    parseBrowserEval(await runBrowser(
      "eval",
      `(() => new Promise((resolve) => {
        const start = performance.now();
        const button = [...document.querySelectorAll('[data-view-mode]')].find((item) => item.dataset.viewMode === 'kanban');
        button.click();
        const check = () => {
          const board = document.querySelector('#lane-board');
          const cards = document.querySelectorAll('.ticket-card').length;
          if (board && !board.hidden && cards > 0) {
            resolve((performance.now() - start).toFixed(1));
            return;
          }
          setTimeout(check, 25);
        };
        check();
      }))()`,
    )),
  );

  return { toListMs, toKanbanMs };
}

async function main() {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`Kanbalone is not reachable at ${BASE_URL}`);
  }

  const boards = await api("/api/boards");
  const board = boards.boards.find((item) => item.name === BOARD_NAME);
  if (!board) {
    throw new Error(`Board "${BOARD_NAME}" not found. Run perf:seed first.`);
  }
  globalThis.__perfBoardId = board.id;

  const boardShell = await api(`/api/boards/${board.id}`);
  const ticketSummaries = await api(`/api/boards/${board.id}/tickets`);
  if (!ticketSummaries.tickets.length) {
    throw new Error(`Board "${BOARD_NAME}" has no tickets. Run perf:seed first.`);
  }
  const sampleId = ticketSummaries.tickets[Math.floor(ticketSummaries.tickets.length / 2)].id;
  const doneLane = boardShell.lanes.find((lane) => lane.name === "done") ?? boardShell.lanes.at(-1);

  const apiResults = [];
  apiResults.push(await benchmarkJson("boards", "/api/boards"));
  apiResults.push(await benchmarkJson("board-shell", `/api/boards/${board.id}`));
  apiResults.push(await benchmarkJson("ticket-summaries", `/api/boards/${board.id}/tickets`));
  apiResults.push(await benchmarkJson("ticket-summaries-done", `/api/boards/${board.id}/tickets?lane_id=${doneLane.id}`));
  apiResults.push(await benchmarkJson("ticket-summaries-search", `/api/boards/${board.id}/tickets?q=Performance`));
  apiResults.push(await benchmarkJson("ticket-detail", `/api/tickets/${sampleId}`));
  apiResults.push(await benchmarkJson("ticket-comments", `/api/tickets/${sampleId}/comments`));
  apiResults.push(await benchmarkJson("ticket-relations", `/api/tickets/${sampleId}/relations`));

  const kanbanNav = await benchmarkBrowserNavigation(`${BASE_URL}/boards/${board.id}`);
  const listNav = await benchmarkBrowserNavigation(`${BASE_URL}/boards/${board.id}/list`);
  const viewSwitch = await benchmarkViewSwitch();

  const report = {
    baseUrl: BASE_URL,
    boardId: board.id,
    boardName: board.name,
    runs: RUNS,
    api: apiResults,
    ui: {
      kanbanNavigation: kanbanNav,
      listNavigation: listNav,
      viewSwitch,
    },
    createdAt: new Date().toISOString(),
  };

  await mkdir("data", { recursive: true });
  await writeFile("data/perf-benchmark-report.json", `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
