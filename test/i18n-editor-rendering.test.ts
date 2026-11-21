import test from "node:test";
import assert from "node:assert/strict";

// Use Japanese before loading the browser modules; no persisted user preferences.
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "ja-JP" } });
const detailPath = "../public/app-ticket-detail-renderers.js";
const commentsPath = "../public/app-ticket-comment-renderers.js";
const { createTicketDetailRenderers } = await import(detailPath);
const { createTicketCommentRenderers } = await import(commentsPath);
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

test("Japanese ticket metadata translates UI labels without translating or injecting user names", () => {
  const renderers = createTicketDetailRenderers({ escapeHtml, state: { boardDetail: { lanes: [{ id: 1, name: 'Save <script>' }] } } });
  const html = renderers.renderTicketMeta({ laneId: 1, boardId: 2, tags: [], group: { id: 3, name: 'Delete <img>' } });
  assert.match(html, /レーン：/);
  assert.match(html, /グループ：/);
  assert.match(html, /Save &lt;script&gt;/);
  assert.match(html, /Delete &lt;img&gt;/);
  assert.doesNotMatch(html, /<script>|<img>/);
  assert.match(renderers.renderTicketMeta({ laneId: 1, tags: [] }), /未所属/);
});

test("Japanese comments preserve body content and localize action labels", () => {
  const renderers = createTicketCommentRenderers({ escapeHtml, state: { dialogTicket: null } }, {});
  const html = renderers.renderComments([{ id: 1, createdAt: "2026-11-21T00:00:00Z", bodyHtml: "<p>Save</p>", bodyMarkdown: "Save" }]);
  assert.match(html, /<p>Save<\/p>/);
  assert.match(html, /コメントを編集/);
  assert.match(html, /コメントを削除/);
  assert.match(html, />キャンセル</);
});

test("system activity is localized while externally supplied event content is retained", () => {
  const renderers = createTicketDetailRenderers({ escapeHtml });
  const date = "2026-11-21T00:00:00Z";
  const html = renderers.renderActivity([{ createdAt: date, message: "Ticket created" }, { createdAt: date, action: "ticket_moved_board", details: { toBoardName: "Save", toLaneName: "Delete" }, message: "Moved to Save / Delete" }], [{ createdAt: date, title: "Ticket created", summary: "Saved", source: "automation", kind: "custom" }]);
  assert.match(html, /チケットを作成しました/);
  assert.match(html, /Save \/ Deleteに移動しました/);
  assert.match(html, />Ticket created</);
  assert.match(html, />Saved</);
});

test("unknown translation keys use literal fallback, including object prototype names", async () => {
  const path = "../public/app-i18n.js";
  const { t, getLocale } = await import(path);
  assert.equal(getLocale(), "ja");
  for (const key of ["constructor", "toString", "__proto__", "Unknown UI key"]) {
    assert.equal(t(key), key);
  }
  assert.equal(t("Unknown {name}", { name: "Save <&>" }), "Unknown Save <&>");
});
