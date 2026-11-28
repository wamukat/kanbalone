import { getLocale, t } from "./app-i18n.js";
import { buildBodyDiffRows } from "./app-ticket-detail-renderers.js";
import { getPriorityLevel } from "./app-priority.js";
import { renderTag } from "./app-tags.js";

const textLimit = 12000;
const lineLimit = 24;

export function renderTicketVisit(result, escape, registerText = () => "") {
  const e = value => escape(String(value));
  const label = value => e(t(value));
  const time = ms => {
    if (ms == null) return "—";
    const date = new Date(ms);
    return '<time datetime="' + date.toISOString() + '">' +
      e(new Intl.DateTimeFormat(getLocale(), { dateStyle: "short", timeStyle: "short" }).format(date)) + '</time>';
  };
  const { before, current, kind, saveError } = result;
  const notice = (title, text, warning = false) => '<div class="ticket-visit-notice' + (warning ? ' ticket-visit-warning' : '') +
    '"><strong>' + label(title) + '</strong><p>' + label(text) + '</p></div>';
  if (kind === "loading") return '<p class="ticket-visit-loading muted">' + label("Loading changes…") + '</p>';
  const range = '<div class="ticket-visit-range"><div><span class="muted">' + label("Previous view") + '</span> ' + time(before?.seenAt) +
    ' <span class="muted" aria-hidden="true">→</span> <span class="muted">' + label("This view") + '</span> ' + time(current?.seenAt) +
    '</div><button type="button" class="ghost ticket-visit-link" data-visit-history>' + label("Open activity") + '</button></div>';
  const guidance = current && !saveError ? '<p class="muted ticket-visit-guidance">' +
    label("Opening this ticket saves the displayed state for next time in this browser.") + '</p>' : "";
  if (kind === "error") return range + notice("Could not load changes", "Your previous comparison point is unchanged. Reopen this ticket to try again.", true);
  const storageWarning = saveError ? notice("Could not save the comparison point",
    "You can read this comparison, but the same changes may appear the next time you open this ticket.", true) : "";
  const content = kind === "expired" ? notice("Previous comparison point expired",
    "The previous state could not be matched to this data. This view is the new comparison point.", true) :
    !before ? (saveError ? "" : notice("No previous comparison point", "This view is the first comparison point in this browser.")) :
      renderChanges(before.state, current.state, e, label, registerText);
  return range + guidance + '<div data-visit-notices></div>' + content + storageWarning;
}

function renderChanges(before, after, e, label, registerText) {
  const heading = (title, content) => content ? '<section class="ticket-visit-section"><h3>' + label(title) + '</h3>' + content + '</section>' : "";
  const status = done => label(done ? "Done" : "Open");
  const priority = value => e(getPriorityLevel(value).label);
  const none = label("None");
  const ref = (item, showId = false) => item ? (showId ? "#" + e(item.id) + " " : "") + e(item.label) : none;
  const change = (oldValue, newValue) => '<span class="ticket-visit-value"><span class="visually-hidden">' + label("Before") + '</span>' +
    oldValue + '<span class="muted" aria-hidden="true"> → </span><span class="visually-hidden">' + label("After") + '</span>' + newValue + '</span>';
  const action = (kind, wording) => '<span class="ticket-visit-action ' + kind + '">' + label(wording) + '</span>';
  const fullText = (...values) => {
    const index = registerText(values);
    return '<details class="ticket-visit-expand" data-visit-full-text="' + index + '"><summary>' +
      label("Show full text") + '</summary><div class="ticket-visit-pair" data-visit-full-text-content></div></details>';
  };
  const textSection = before.bodyMarkdown === after.bodyMarkdown ? "" :
    textDifference(before.bodyMarkdown, after.bodyMarkdown, e, label, fullText);
  const hint = (title, content) => '<details class="ticket-visit-expand"><summary>' + label(title) + '</summary>' + content + '</details>';
  const detailsText = text => previewText(text, e, label) + (text.length > textLimit ? " " + fullText(text) : "");
  const textPair = (oldValue, newValue) => '<div class="ticket-visit-pair"><div><strong>' + label("Before") + '</strong>' +
    '<p>' + previewText(oldValue, e, label) + '</p></div><div><strong>' + label("After") + '</strong><p>' +
    previewText(newValue, e, label) + '</p></div></div>' +
    (Math.max(oldValue.length, newValue.length) > textLimit ? fullText(oldValue, newValue) : "");
  const item = (name, actionLabel, content) => '<li><strong>' + name + '</strong> ' + actionLabel + ' ' + content + '</li>';
  const list = items => items.length ? '<ul class="ticket-visit-list">' + items.join("") + '</ul>' : "";
  const comment = id => e(t("Comment #{id}", { id }));
  const task = number => e(t("Task #{number}", { number }));
  const comments = compareCollection(before.comments, after.comments, "id",
    commentItem => item(comment(commentItem.id), action("added", "Added"), detailsText(commentItem.bodyMarkdown) +
      ' <bdi class="muted">' + (commentItem.updater ? e(commentItem.updater) : label("Not recorded")) + '</bdi>'),
    commentItem => item(comment(commentItem.id), action("removed", "Deletion"), hint("Show previous text", detailsText(commentItem.bodyMarkdown))),
    (oldItem, newItem) => oldItem.bodyMarkdown === newItem.bodyMarkdown ? "" :
      item(comment(newItem.id), action("changed", "Edited"),
        hint("Show before and after", textPair(oldItem.bodyMarkdown, newItem.bodyMarkdown))));
  const tasks = compareCollection(before.tasks, after.tasks, "number",
    taskItem => item(task(taskItem.number), action("added", "Added"), previewText(taskItem.bodyMarkdown, e, label) + " · " + status(taskItem.done)),
    taskItem => item(task(taskItem.number), action("removed", "Deletion"), previewText(taskItem.bodyMarkdown, e, label)),
    (oldItem, newItem) => {
      const edited = oldItem.bodyMarkdown !== newItem.bodyMarkdown;
      const changedStatus = oldItem.done !== newItem.done;
      if (!edited && !changedStatus) return "";
      const details = [
        changedStatus ? action("changed", newItem.done ? "Completed" : "Reopened") + " " + change(status(oldItem.done), status(newItem.done)) : "",
        edited ? hint("Show body changes", textPair(oldItem.bodyMarkdown, newItem.bodyMarkdown)) : previewText(newItem.bodyMarkdown, e, label),
      ];
      return item(task(newItem.number), edited ? action("changed", "Body edited") : "", details.filter(Boolean).join(" "));
    });

  const attrs = [];
  const prop = (title, content) => {
    if (content) attrs.push('<dt>' + label(title) + '</dt><dd>' + content + '</dd>');
  };
  const scalar = (key, title, show = e) => {
    if (before[key] !== after[key]) prop(title, change(show(before[key]), show(after[key])));
  };
  scalar("title", "Title");
  scalar("priority", "Priority", priority);
  scalar("isArchived", "Archive", value => label(value ? "Archived" : "Not archived"));
  const sameRef = (a, b) => a?.id === b?.id && a?.label === b?.label;
  for (const [key, title] of [["board", "Board"], ["lane", "Lane"], ["group", "Group"], ["parent", "Parent ticket"]]) {
    if (!sameRef(before[key], after[key])) prop(title, change(ref(before[key], key === "parent"), ref(after[key], key === "parent")));
  }
  for (const [key, title, showId] of [["tags", "Tags", false], ["children", "Child tickets", true],
    ["blockers", "Blockers", true], ["blockedBy", "Blocks", true], ["related", "Related tickets", true]]) {
    const renderRef = record => key === "tags" ? renderTag({ name: record.label,
      color: /^#[a-f0-9]{6}$/i.test(record.color) ? record.color : null }, e) : ref(record, showId);
    const entries = compareCollection(before[key], after[key], "id",
      record => action("added", "Added") + " " + renderRef(record),
      record => action("removed", "Removed") + " " + renderRef(record),
      (oldRecord, newRecord) => sameRef(oldRecord, newRecord) ? "" : change(renderRef(oldRecord), renderRef(newRecord)));
    prop(title, entries.map(entry => '<span class="ticket-visit-value">' + entry + '</span>').join(""));
  }

  return heading("Ticket body", textSection) +
    heading("Attributes and relationships", attrs.length ? '<dl class="ticket-visit-attributes">' + attrs.join("") + '</dl>' : "") +
    heading("Comments", list(comments)) + heading("Task", list(tasks)) ||
    '<div class="ticket-visit-notice"><strong>' + label("No changes since last view") + '</strong><p>' +
    label("The two displayed states match. Open activity to check intermediate operations.") + '</p></div>';
}

function compareCollection(before, after, name, add, remove, update) {
  const old = new Map(before.map(item => [item[name], item]));
  const addedOrEdited = after.map(item => {
    const previous = old.get(item[name]);
    old.delete(item[name]);
    return previous ? update(previous, item) : add(item);
  }).filter(Boolean);
  return [...addedOrEdited, ...Array.from(old.values(), remove)];
}

function previewText(value, e, label) {
  // Avoid putting unbounded Markdown into hidden DOM or cutting off half an emoji.
  const end = /[\uD800-\uDBFF]/.test(value[textLimit - 1] ?? "") ? textLimit - 1 : textLimit;
  return e(value.slice(0, end)) + (value.length > end ? ' <span class="muted">' + label("Excerpt") + '</span>' : "");
}

function textDifference(before, after, e, label, fullText) {
  let start = 0;
  const longText = Math.max(before.length, after.length) > textLimit;
  if (longText) {
    while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
    start = Math.max(0, start - 120);
    if (/[\uDC00-\uDFFF]/.test(before[start] ?? "") || /[\uDC00-\uDFFF]/.test(after[start] ?? "")) start--;
  }
  const excerpt = value => {
    const end = start + textLimit;
    return value.slice(start, /[\uD800-\uDBFF]/.test(value[end - 1] ?? "") ? end - 1 : end);
  };
  const rows = buildBodyDiffRows(excerpt(before), excerpt(after));
  const first = rows.findIndex(row => row.type !== "same");
  if (first === -1) return fullText(before, after);
  const relevant = rows.slice(Math.max(0, first - 1)).filter((row, index, selected) => row.type !== "same" ||
    selected[index - 1]?.type !== "same" || selected[index + 1]?.type !== "same");
  const shown = relevant.slice(0, lineLimit).map(row => {
    const kind = row.type === "remote" ? ["removed", "−", "Deletion"] : row.type === "local" ? ["added", "+", "Added"] : ["", "", "Context"];
    return '<div class="ticket-visit-line ' + kind[0] + '"><span>' + kind[1] + ' ' + label(kind[2]) +
      '</span><p>' + e(row.text) + '</p></div>';
  }).join("");
  return '<div class="ticket-visit-diff">' + shown + '</div>' + (longText || relevant.length > lineLimit
    ? '<p class="muted">' + label("Excerpt") + '</p>' + fullText(before, after) : "");
}
