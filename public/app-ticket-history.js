import { t } from "./app-i18n.js";
import { renderTag } from "./app-tags.js";

const valueFields = {
  board: "Board", lane: "Lane", title: "Title", priority: "Priority", isArchived: "Archive",
  parent: "Parent", children: "Children", blockers: "Blocked By", blockedBy: "Blocks", related: "Related", tags: "Tags",
};
const relationLists = new Set(["children", "blockers", "blockedBy", "related", "tags"]);
const commentActions = {
  comment_added: "Comment added #{number}",
  comment_imported: "Comment imported #{number}",
  comment_updated: "Comment updated #{number}",
  comment_deleted: "Comment deleted #{number}",
};
const compareLimit = 8_000;

const isText = (value) => typeof value === "string";
const isId = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isReference = (value) => value && isId(value.id) && isText(value.label);

export function historyMessage(entry, fallback) {
  const details = entry.details ?? {};
  const commentMessage = commentActions[entry.action];
  if (commentMessage && isId(details.commentId)) return t(commentMessage, { number: details.commentId });
  if (entry.action === "ticket_relations_changed") return t("Ticket relations changed");
  if (details.changeVersion !== 1) return fallback;
  const fields = Object.keys(details.changes ?? {});
  if (!fields.length && ["ticket_updated", "ticket_transitioned", "ticket_moved_board", "ticket_archived", "ticket_restored"].includes(entry.action)) {
    return t("No changes");
  }
  if (entry.action !== "ticket_updated" && entry.action !== "ticket_transitioned") return fallback;
  if (fields.length !== 1) return fallback;
  const labels = { lane: "Lane changed", bodyMarkdown: "Body updated", tags: "Tags changed" };
  return labels[fields[0]] ? t(labels[fields[0]]) : fallback;
}

export function renderHistoryDetails(entry, currentComments, escape) {
  const details = entry.details ?? {};
  const action = entry.action;
  const content = [];
  if (details.changeVersion === 1) {
    for (const [field, change] of Object.entries(details.changes ?? {})) {
      if (Object.hasOwn(valueFields, field) && change && Object.hasOwn(change, "before") && Object.hasOwn(change, "after")) {
        content.push(renderChange(field, change, escape));
      }
    }
  } else if (action === "ticket_group_changed") {
    content.push(valueChange(t("Group"), legacyReference(details, "fromGroup", t("Unassigned")),
      legacyReference(details, "toGroup", t("Unassigned")), escape));
  } else if (action === "ticket_transitioned" || action === "ticket_moved_board") {
    if (action === "ticket_moved_board") {
      content.push(valueChange(t("Board"), legacyReference(details, "fromBoard"), legacyReference(details, "toBoard"), escape));
    }
    content.push(valueChange(t("Lane"), legacyReference(details, "fromLane"), legacyReference(details, "toLane"), escape));
  } else if (["ticket_tag_reason_set", "ticket_tag_removed"].includes(action) && isId(details.tagId)) {
    content.push(valueChange(t("Tags"), null, `#${details.tagId}`, escape));
  } else if (["ticket_updated", "ticket_archived", "ticket_restored"].includes(action)) {
    content.push(`<div class="activity-change-line muted">${t("Change details not recorded")}</div>`);
  }

  if (commentActions[action]) {
    if (!isId(details.commentId)) {
      content.push(`<div class="activity-change-line muted">${t("Comment reference not recorded")}</div>`);
    }
    if (action === "comment_deleted") content.push(`<div class="activity-change-line muted">${t("Deleted comment")}</div>`);
    if (details.bodyUnchanged === true) content.push(`<div class="activity-change-line muted">${t("No changes")}</div>`);
    if (action !== "comment_updated" && typeof details.bodyExcerpt === "string") {
      content.push(`<div class="activity-change-line activity-text-excerpt">${escape(details.bodyExcerpt)}</div>`);
    }
    if (action !== "comment_deleted" && currentComments.has(details.commentId)) {
      content.push(`<button type="button" class="activity-text-link" data-activity-comment-id="${details.commentId}">${escape(t("Show current comment #{number}", { number: details.commentId }))}</button>`);
    }
  }
  if (action?.startsWith("task_") && isText(details.bodyExcerpt)) {
    content.push(`<div class="activity-meta muted ticket-task-excerpt">${escape(details.bodyExcerpt)}</div>`);
  }

  const deferred = details.bodyDetailsDeferred === true;
  const recordedBody = readRecordedText(entry);
  if (deferred || recordedBody) {
    const label = action === "comment_deleted" || action === "task_deleted" ? t("Show deleted text") :
      action === "comment_added" || action === "comment_imported" ? t("Show recorded comment text") : t("Show text change");
    const id = isId(entry.id) ? entry.id : "";
    content.push(`<details class="activity-text-details"${deferred && id ? ` data-activity-detail-id="${id}"` : ""}>
      <summary>${label}</summary>
      <div data-activity-detail-content>${recordedBody ? renderRecordedText(recordedBody, escape) : ""}</div>
    </details>`);
  }
  return content.join("");
}

function describeValue(field, value, empty = t("Not recorded")) {
  if (isReference(value)) return field === "parent" ? `#${value.id} ${value.label}` : value.label;
  if (field === "parent" && value === null) return t("No parent");
  if (field === "isArchived" && typeof value === "boolean") return t(value ? "Archived" : "Not archived");
  if (field === "priority" && [1, 2, 3, 4].includes(value)) return t(["Low", "Medium", "High", "Urgent"][value - 1]);
  if (isText(value)) return value;
  return empty;
}

function legacyReference(details, prefix, emptyValue = t("Not recorded")) {
  const label = details[prefix + "Name"];
  const id = details[prefix + "Id"];
  if (isText(label)) return label;
  if (Object.hasOwn(details, prefix + "Id") && id === null) return emptyValue;
  return isId(id) ? `#${id} · ${t("Name not recorded")}` : t("Not recorded");
}

function valueChange(label, before, after, escape) {
  return `<div class="activity-change-line"><span class="muted">${escape(label)}</span>
    ${before !== null ? `<span><span class="visually-hidden">${t("Before")} </span>${escape(before)}</span><span class="muted" aria-hidden="true">→</span>` : ""}
    <span><span class="visually-hidden">${t("After")} </span>${escape(after)}</span></div>`;
}

function renderChange(field, { before, after }, escape) {
  const label = t(valueFields[field]);
  if (!relationLists.has(field)) {
    return valueChange(label, before === null && field !== "parent" ? null : describeValue(field, before), describeValue(field, after), escape);
  }
  const previous = Array.isArray(before) ? before.filter(isReference) : [];
  const next = Array.isArray(after) ? after.filter(isReference) : [];
  const previousIds = new Set(previous.map(({ id }) => id));
  const nextIds = new Set(next.map(({ id }) => id));
  const added = next.filter(({ id }) => !previousIds.has(id));
  const removed = previous.filter(({ id }) => !nextIds.has(id));
  const item = (reference) => field === "tags"
    ? renderTag({ name: reference.label, color: reference.color ?? "" }, escape)
    : `<span>#${reference.id} ${escape(reference.label)}</span>`;
  return [added, removed].map((values, index) => values.length ? `<div class="activity-change-line">
    <span class="muted">${escape(label)} · ${t(index === 0 ? "Added" : "Removed")}</span>
    ${values.map(item).join("")}</div>` : "").join("");
}

export function readRecordedText(entry) {
  const details = entry.details ?? {};
  const body = details.changeVersion === 1 ? details.changes?.bodyMarkdown : undefined;
  if (isText(body?.before) && isText(body?.after)) return { before: body.before, after: body.after };
  if (isText(details.oldBodyMarkdown) && isText(details.newBodyMarkdown)) {
    if (details.oldBodyMarkdown === details.newBodyMarkdown) return null;
    return { before: details.oldBodyMarkdown, after: details.newBodyMarkdown };
  }
  if (isText(details.deletedBodyMarkdown)) return { deleted: details.deletedBodyMarkdown };
  if (commentActions[entry.action] && isText(details.bodyMarkdown)) return { recorded: details.bodyMarkdown };
  return null;
}

function textPanel(label, text, escape) {
  return `<section class="activity-text-panel"><div class="activity-text-label muted">${label}</div>
    <pre>${text || escape(t("Empty text"))}</pre></section>`;
}

function splitsSurrogatePair(text, index) {
  const previous = text.charCodeAt(index - 1);
  const current = text.charCodeAt(index);
  return previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff;
}

function previousTextBoundary(text, index) {
  return splitsSurrogatePair(text, index) ? index - 1 : index;
}

function comparisonSlice(text, start, end, escape) {
  const first = previousTextBoundary(text, Math.max(0, start - 240));
  const last = previousTextBoundary(text, Math.min(text.length, end + 240, first + compareLimit));
  const rendered = [escape(text.slice(first, Math.min(last, start)))];
  if (last > start && end > start) rendered.push(`<mark>${escape(text.slice(start, Math.min(last, end)))}</mark>`);
  rendered.push(escape(text.slice(Math.min(last, end), last)));
  return { html: rendered.join(""), shortened: first > 0 || last < text.length };
}

export function renderRecordedText(text, escape) {
  if (!text) return `<p class="muted">${t("Text not recorded")}</p>`;
  if ("before" in text) {
    const { before, after } = text;
    let start = 0;
    let fromEnd = before.length;
    let toEnd = after.length;
    while (start < fromEnd && start < toEnd && before[start] === after[start]) start++;
    while (fromEnd > start && toEnd > start && before[fromEnd - 1] === after[toEnd - 1]) {
      fromEnd--;
      toEnd--;
    }
    start = Math.min(previousTextBoundary(before, start), previousTextBoundary(after, start));
    if (splitsSurrogatePair(before, fromEnd)) fromEnd++;
    if (splitsSurrogatePair(after, toEnd)) toEnd++;
    const left = comparisonSlice(before, start, fromEnd, escape);
    const right = comparisonSlice(after, start, toEnd, escape);
    return `<div class="activity-text-comparison">
      ${textPanel(t("Before"), left.html, escape)}${textPanel(t("After"), right.html, escape)}
    </div>${left.shortened || right.shortened ? `<p class="muted">${t("Showing part of the recorded text")}</p>` : ""}`;
  }
  const value = text.deleted ?? text.recorded;
  return `${textPanel(t(text.deleted !== undefined ? "Text at deletion" : "Text at the time"), escape(value.slice(0, previousTextBoundary(value, compareLimit))), escape)}
    ${value.length > compareLimit ? `<p class="muted">${t("Showing part of the recorded text")}</p>` : ""}`;
}
