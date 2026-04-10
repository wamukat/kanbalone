import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = process.env.SOLOBOARD_BASE_URL ?? "http://127.0.0.1:3000";
const BOARD_NAME = process.env.SOLOBOARD_PERF_BOARD ?? "Perf 1000";
const TICKET_COUNT = Number(process.env.SOLOBOARD_PERF_TICKETS ?? "1000");
const TAG_COUNT = Number(process.env.SOLOBOARD_PERF_TAGS ?? "20");
const MIN_COMMENTS = Number(process.env.SOLOBOARD_PERF_MIN_COMMENTS ?? "10");
const MAX_COMMENTS = Number(process.env.SOLOBOARD_PERF_MAX_COMMENTS ?? "50");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

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

function buildPayload() {
  const board = {
    id: 1,
    name: BOARD_NAME,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lanes = [
    { id: 1, boardId: 1, name: "todo", position: 0 },
    { id: 2, boardId: 1, name: "doing", position: 1 },
    { id: 3, boardId: 1, name: "done", position: 2 },
  ];

  const tags = Array.from({ length: TAG_COUNT }, (_, index) => ({
    id: index + 1,
    boardId: 1,
    name: `tag-${String(index + 1).padStart(2, "0")}`,
    color: `hsl(${Math.round((index / TAG_COUNT) * 360)} 52% 46%)`,
  }));

  const lanePositions = new Map(lanes.map((lane) => [lane.id, 0]));
  const tickets = [];
  let commentId = 1;
  const samples = [];

  for (let ticketId = 1; ticketId <= TICKET_COUNT; ticketId += 1) {
    const laneId = ticketId % 7 === 0 ? 3 : ticketId % 5 === 0 ? 2 : 1;
    const position = lanePositions.get(laneId) ?? 0;
    lanePositions.set(laneId, position + 1);

    const selectedTags = shuffle(tags)
      .slice(0, randomInt(1, 4))
      .map((tag) => ({ name: tag.name }));

    const comments = Array.from({ length: randomInt(MIN_COMMENTS, MAX_COMMENTS) }, (_, commentIndex) => ({
      id: commentId++,
      ticketId,
      bodyMarkdown: `Comment ${commentIndex + 1} for #${ticketId}: verify rendering, filtering, and API response under load.`,
    }));

    const parentTicketId = ticketId % 10 === 2 ? ticketId - 1 : null;
    const blockerIds = ticketId > 1 && ticketId % 7 === 0 ? [ticketId - 1] : [];
    const isCompleted = laneId === 3;
    const priority = randomInt(0, 5);

    const ticket = {
      id: ticketId,
      boardId: 1,
      laneId,
      parentTicketId,
      title: `Performance ticket ${String(ticketId).padStart(4, "0")}`,
      bodyMarkdown: [
        `# Ticket ${ticketId}`,
        "",
        `This is a generated load-test ticket for ${BOARD_NAME}.`,
        "",
        "- Validate kanban rendering",
        "- Validate list rendering",
        "- Validate detail endpoint latency",
      ].join("\n"),
      isCompleted,
      priority,
      position,
      tags: selectedTags,
      comments,
      blockerIds,
    };
    tickets.push(ticket);
    if (ticketId === 1 || ticketId === Math.ceil(TICKET_COUNT / 2) || ticketId === TICKET_COUNT) {
      samples.push({
        id: ticketId,
        laneId,
        commentCount: comments.length,
        priority,
      });
    }
  }

  return {
    payload: { board, lanes, tags, tickets },
    samples,
    totalComments: commentId - 1,
  };
}

async function main() {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`SoloBoard is not reachable at ${BASE_URL}`);
  }

  const existing = await api("/api/boards");
  for (const board of existing.boards.filter((item) => item.name === BOARD_NAME)) {
    await api(`/api/boards/${board.id}`, { method: "DELETE" });
  }

  const { payload, samples, totalComments } = buildPayload();
  const startedAt = performance.now();
  const imported = await api("/api/boards/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const elapsedMs = performance.now() - startedAt;

  const report = {
    baseUrl: BASE_URL,
    boardId: imported.board.id,
    boardName: imported.board.name,
    tickets: TICKET_COUNT,
    tags: TAG_COUNT,
    totalComments,
    lanes: imported.lanes,
    samples,
    importedInMs: Number(elapsedMs.toFixed(1)),
    createdAt: new Date().toISOString(),
  };

  await mkdir("data", { recursive: true });
  await writeFile("data/perf-seed-report.json", `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
