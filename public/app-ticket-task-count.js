// @ts-check
import { t } from "./app-i18n.js";

/**
 * @param {{taskCount?: number, doneTaskCount?: number}} ticket
 * @param {(value: string) => string} escapeHtml
 */
export function renderTicketTaskCount(ticket, escapeHtml) {
  const total = ticket.taskCount ?? 0;
  if (total <= 0) return "";
  const done = ticket.doneTaskCount ?? 0;
  const label = escapeHtml(t("Tasks completed: {done} of {total}", { done, total }));
  const text = escapeHtml(t("{done}/{total} done", { done, total }));
  return `<span class="ticket-task-count" title="${label}" aria-label="${label}">${text}</span>`;
}
