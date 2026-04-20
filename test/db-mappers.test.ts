import test from "node:test";
import assert from "node:assert/strict";

import { mapActivityLog, mapComment, sanitizePriority } from "../src/db-modules/mappers.js";

test("mapComment renders markdown without changing persisted markdown", () => {
  const comment = mapComment({
    id: 1,
    ticket_id: 2,
    body_markdown: "Hello **Kanbalone**",
    created_at: "2026-04-13T00:00:00.000Z",
  });

  assert.equal(comment.bodyMarkdown, "Hello **Kanbalone**");
  assert.match(comment.bodyHtml, /<strong>Kanbalone<\/strong>/);
});

test("mapActivityLog tolerates invalid details json", () => {
  const activity = mapActivityLog({
    id: 1,
    board_id: 2,
    ticket_id: null,
    subject_ticket_id: 3,
    action: "ticket_deleted",
    message: "Ticket deleted",
    details_json: "{invalid",
    created_at: "2026-04-13T00:00:00.000Z",
  });

  assert.deepEqual(activity.details, {});
  assert.equal(activity.ticketId, null);
  assert.equal(activity.subjectTicketId, 3);
});

test("sanitizePriority defaults missing priority and rejects out-of-range values", () => {
  assert.equal(sanitizePriority(undefined), 2);
  assert.equal(sanitizePriority(1), 1);
  assert.equal(sanitizePriority(4), 4);
  assert.throws(() => sanitizePriority(0), /Priority must be 1, 2, 3, or 4/);
  assert.throws(() => sanitizePriority(Number.NaN), /Priority must be 1, 2, 3, or 4/);
  assert.throws(() => sanitizePriority(3.9), /Priority must be 1, 2, 3, or 4/);
  assert.throws(() => sanitizePriority(100), /Priority must be 1, 2, 3, or 4/);
});
