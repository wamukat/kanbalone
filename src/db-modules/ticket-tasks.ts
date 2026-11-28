import type Database from "better-sqlite3";

import { renderMarkdown } from "../markdown.js";
import type { Id, TicketTask, TicketTaskCounts, TicketTaskRecord, TicketTaskState } from "../types.js";
import { addActivity } from "./ticket-writes.js";

export const maxTaskBodyLength = 100_000;
const maxInteger = Number.MAX_SAFE_INTEGER;
type TaskRow = { number: number; body_markdown: string; done: number; revision: number };
export type TaskInput = { bodyMarkdown: string; done?: boolean };
export type TaskChanges = Partial<TaskInput>;
type TaskFilters = { q?: string; done?: boolean };
const emptyCounts: TicketTaskCounts = { taskCount: 0, doneTaskCount: 0 };

export class TaskError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
  }
}

export function migrateTicketTasks(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ticket_task_counters (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
      last_number INTEGER NOT NULL CHECK (last_number BETWEEN 1 AND ${maxInteger})
    );
    CREATE TABLE IF NOT EXISTS ticket_tasks (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      number INTEGER NOT NULL CHECK (number BETWEEN 1 AND ${maxInteger}),
      body_markdown TEXT NOT NULL,
      done INTEGER NOT NULL CHECK (done IN (0, 1)),
      revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND ${maxInteger}),
      PRIMARY KEY (ticket_id, number)
    ) WITHOUT ROWID;
  `);
}

function taskRecord(row: TaskRow): TicketTaskRecord {
  return { number: row.number, bodyMarkdown: row.body_markdown, done: Boolean(row.done), revision: row.revision };
}

function taskView(task: TicketTaskRecord): TicketTask {
  return { ...task, bodyHtml: renderMarkdown(task.bodyMarkdown) };
}

function requireTicket(sqlite: Database.Database, ticketId: Id): Id {
  const ticket = sqlite.prepare("SELECT board_id FROM tickets WHERE id = ?").get(ticketId) as { board_id: Id } | undefined;
  if (!ticket) throw new TaskError("Ticket not found", 404, "TICKET_NOT_FOUND");
  return ticket.board_id;
}

function requireTask(sqlite: Database.Database, ticketId: Id, number: number): TicketTaskRecord {
  const row = sqlite.prepare("SELECT * FROM ticket_tasks WHERE ticket_id = ? AND number = ?").get(ticketId, number) as TaskRow | undefined;
  if (!row) throw new TaskError("Task not found", 404, "TASK_NOT_FOUND");
  return taskRecord(row);
}

export function isTaskPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isTaskBody(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !/[\uD800-\uDFFF]/u.test(value) &&
    [...value].length <= maxTaskBodyLength;
}

export function requireTaskBody(body: unknown): string {
  if (!isTaskBody(body)) throw new TaskError("Task Markdown must have 1 to 100000 valid Unicode characters and contain non-whitespace text", 400, "INVALID_TASK_BODY");
  return body;
}

export function getTicketTaskCounts(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TicketTaskCounts> {
  if (ticketIds.length === 0) return new Map();
  const rows = sqlite.prepare(`
    SELECT ticket_id, count(*) AS taskCount, sum(done) AS doneTaskCount
    FROM ticket_tasks WHERE ticket_id IN (SELECT value FROM json_each(?)) GROUP BY ticket_id
  `).all(JSON.stringify(ticketIds)) as Array<TicketTaskCounts & { ticket_id: Id }>;
  return new Map(rows.map(({ ticket_id, ...counts }) => [ticket_id, counts]));
}

export function listTicketTasks(sqlite: Database.Database, ticketId: Id, { q, done }: TaskFilters = {}) {
  return sqlite.transaction(() => {
    requireTicket(sqlite, ticketId);
    const counts = getTicketTaskCounts(sqlite, [ticketId]).get(ticketId) ?? emptyCounts;
    const completion = done === undefined ? null : Number(done);
    const rows = sqlite.prepare(`
      SELECT number, body_markdown, done, revision FROM ticket_tasks
      WHERE ticket_id = ? AND (? IS NULL OR instr(lower(body_markdown), lower(?)) > 0)
        AND (? IS NULL OR done = ?) ORDER BY number
    `).all(ticketId, q ?? null, q ?? null, completion, completion) as TaskRow[];
    return { ...counts, tasks: rows.map(row => taskView(taskRecord(row))) };
  })();
}

export function getTicketTask(sqlite: Database.Database, ticketId: Id, number: number): TicketTask {
  return taskView(requireTask(sqlite, ticketId, number));
}

function taskActivity(
  sqlite: Database.Database, boardId: Id, ticketId: Id, task: TicketTaskRecord, now: string,
  action: "task_created" | "task_updated" | "task_deleted", previous?: TicketTaskRecord,
): void {
  const text = [...task.bodyMarkdown.trim().replace(/\s+/gu, " ")];
  const bodyExcerpt = text.length > 160 ? text.slice(0, 159).join("") + "…" : text.join("");
  const operation = action === "task_created" ? "Created" : action === "task_updated" ? "Updated" : "Deleted";
  const details: Record<string, unknown> = { taskNumber: task.number, bodyExcerpt, done: task.done };
  if (previous) {
    const bodyChanged = previous.bodyMarkdown !== task.bodyMarkdown;
    Object.assign(details, { bodyChanged, previousDone: previous.done });
    if (bodyChanged) Object.assign(details, { oldBodyMarkdown: previous.bodyMarkdown, newBodyMarkdown: task.bodyMarkdown });
  }
  if (action === "task_deleted") details.deletedBodyMarkdown = task.bodyMarkdown;
  addActivity(sqlite, {
    boardId, ticketId, action, createdAt: now,
    message: `${operation} Task #${task.number}`,
    details,
  });
}

export function createTicketTask(sqlite: Database.Database, ticketId: Id, input: TaskInput, now: string) {
  requireTaskBody(input.bodyMarkdown);
  return sqlite.transaction(() => {
    const boardId = requireTicket(sqlite, ticketId);
    const allocated = sqlite.prepare(`
      INSERT INTO ticket_task_counters(ticket_id, last_number) VALUES (?, 1)
      ON CONFLICT(ticket_id) DO UPDATE SET last_number = last_number + 1
      WHERE last_number < ? RETURNING last_number
    `).get(ticketId, maxInteger) as { last_number: number } | undefined;
    if (!allocated) throw new TaskError("Task numbers exhausted", 409, "TASK_NUMBER_EXHAUSTED");
    const task = { number: allocated.last_number, bodyMarkdown: input.bodyMarkdown, done: input.done ?? false, revision: 1 };
    insertTask(sqlite, ticketId, task);
    taskActivity(sqlite, boardId, ticketId, task, now, "task_created");
    return { boardId, task: taskView(task) };
  }).immediate();
}

function requireRevision(task: TicketTaskRecord, expectedRevision: number): void {
  if (task.revision !== expectedRevision) throw new TaskError("Task changed; reload before trying again", 409, "STALE_TASK");
}

export function updateTicketTask(sqlite: Database.Database, ticketId: Id, number: number, expectedRevision: number, changes: TaskChanges, now: string) {
  if (changes.bodyMarkdown !== undefined) requireTaskBody(changes.bodyMarkdown);
  return sqlite.transaction(() => {
    const boardId = requireTicket(sqlite, ticketId);
    const current = requireTask(sqlite, ticketId, number);
    requireRevision(current, expectedRevision);
    const next = { ...current, ...changes };
    if (next.bodyMarkdown === current.bodyMarkdown && next.done === current.done) {
      return { boardId, changed: false, task: taskView(current) };
    }
    if (current.revision === maxInteger) throw new TaskError("Task revisions exhausted", 409, "TASK_REVISION_EXHAUSTED");
    next.revision++;
    sqlite.prepare("UPDATE ticket_tasks SET body_markdown = ?, done = ?, revision = ? WHERE ticket_id = ? AND number = ?")
      .run(next.bodyMarkdown, Number(next.done), next.revision, ticketId, number);
    taskActivity(sqlite, boardId, ticketId, next, now, "task_updated", current);
    return { boardId, changed: true, task: taskView(next) };
  }).immediate();
}

export function deleteTicketTask(sqlite: Database.Database, ticketId: Id, number: number, expectedRevision: number, now: string) {
  return sqlite.transaction(() => {
    const boardId = requireTicket(sqlite, ticketId);
    const task = requireTask(sqlite, ticketId, number);
    requireRevision(task, expectedRevision);
    sqlite.prepare("DELETE FROM ticket_tasks WHERE ticket_id = ? AND number = ?").run(ticketId, number);
    taskActivity(sqlite, boardId, ticketId, task, now, "task_deleted");
    return { boardId };
  }).immediate();
}

function insertTask(sqlite: Database.Database, ticketId: Id, task: TicketTaskRecord): void {
  sqlite.prepare("INSERT INTO ticket_tasks(ticket_id, number, body_markdown, done, revision) VALUES (?, ?, ?, ?, ?)")
    .run(ticketId, task.number, task.bodyMarkdown, Number(task.done), task.revision);
}

export function exportTicketTaskStates(sqlite: Database.Database, boardId: Id): Map<Id, TicketTaskState> {
  const counters = sqlite.prepare(`
    SELECT c.ticket_id, c.last_number FROM ticket_task_counters c JOIN tickets t ON t.id = c.ticket_id WHERE t.board_id = ?
  `).all(boardId) as Array<{ ticket_id: Id; last_number: number }>;
  const states = new Map(counters.map(({ ticket_id, last_number }) => [ticket_id, { lastNumber: last_number, tasks: [] as TicketTaskRecord[] }]));
  if (!states.size) return states;
  const rows = sqlite.prepare(`
    SELECT k.* FROM ticket_tasks k JOIN tickets t ON t.id = k.ticket_id WHERE t.board_id = ? ORDER BY k.ticket_id, k.number
  `).all(boardId) as Array<TaskRow & { ticket_id: Id }>;
  for (const row of rows) states.get(row.ticket_id)!.tasks.push(taskRecord(row));
  return states;
}

export function importTicketTaskState(sqlite: Database.Database, ticketId: Id, state: TicketTaskState): void {
  sqlite.prepare("INSERT INTO ticket_task_counters(ticket_id, last_number) VALUES (?, ?)").run(ticketId, state.lastNumber);
  for (const task of state.tasks) insertTask(sqlite, ticketId, task);
}
