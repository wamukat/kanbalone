import test from "node:test";
import assert from "node:assert/strict";

import { mapActivityLog, mapComment, sanitizePriority } from "../src/db-modules/mappers.js";
import { renderMarkdown } from "../src/markdown.js";

test("mapComment renders markdown without changing persisted markdown", () => {
  const comment = mapComment({
    id: 1,
    ticket_id: 2,
    body_markdown: "Hello **Kanbalone**",
    created_at: "2026-04-13T00:00:00.000Z",
    updater: "Author",
  }, {
    commentId: 1,
    status: "local_only",
    remoteCommentId: null,
    pushedAt: null,
    lastError: null,
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:00:00.000Z",
  });

  assert.equal(comment.bodyMarkdown, "Hello **Kanbalone**");
  assert.match(comment.bodyHtml, /<strong>Kanbalone<\/strong>/);
  assert.equal(comment.sync.status, "local_only");
  assert.equal(comment.updater, "Author");
});

test("renderMarkdown highlights code blocks and preserves table markup", () => {
  const html = renderMarkdown([
    "| Name | Value |",
    "| --- | --- |",
    "| mode | list |",
    "",
    "```js",
    "const mode = \"list\";",
    "```",
  ].join("\n"));

  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /class="hljs language-js"/);
  assert.match(html, /hljs-keyword/);
});

test("renderMarkdown links plain local ticket references", () => {
  const html = renderMarkdown("Depends on #123, fixes (#456), but not gh#789.");

  assert.match(html, /Depends on <a href="\/tickets\/123">#123<\/a>/);
  assert.match(html, /fixes \(<a href="\/tickets\/456">#456<\/a>\)/);
  assert.match(html, /but not gh#789/);
});

test("renderMarkdown does not link ticket references inside links or code", () => {
  const html = renderMarkdown([
    "[existing #123](https://example.com/issues/123)",
    "",
    "`#456`",
    "",
    "```",
    "#789",
    "```",
  ].join("\n"));

  assert.match(html, /<a href="https:\/\/example.com\/issues\/123">existing #123<\/a>/);
  assert.match(html, /<code>#456<\/code>/);
  assert.match(html, /<pre><code class="hljs">.*#789.*<\/code><\/pre>/s);
  assert.doesNotMatch(html, /href="\/tickets\/123"/);
  assert.doesNotMatch(html, /href="\/tickets\/456"/);
  assert.doesNotMatch(html, /href="\/tickets\/789"/);
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
    updater: null,
  });

  assert.deepEqual(activity.details, {});
  assert.equal(activity.ticketId, null);
  assert.equal(activity.subjectTicketId, 3);
  assert.equal(activity.updater, null);
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


test("Markdown task states survive sanitization without enabling form controls", () => {
  const html = renderMarkdown("- [ ] Pending **review** #123\n- [x] Reviewed\n  - [X] Nested checked\n\n<input type=checkbox onclick=alert(1)><script>alert(1)</script><span onclick=alert(1)>safe</span>");
  assert.match(html, /aria-label="Not completed">☐<\/span>/);
  assert.equal((html.match(/aria-label="Completed">☑<\/span>/g) || []).length, 2);
  assert.match(html, /<strong>review<\/strong>/);
  assert.match(html, /href="\/tickets\/123"/);
  assert.doesNotMatch(html, /<input|<script|onclick=/);
});
