// @ts-check
/** @typedef {import("./app-group-types.js").GroupTicketWindowModel} Model */
/** @typedef {import("./app-group-types.js").GroupTicketRow} Row */
/** @typedef {import("./app-group-types.js").GroupTicketAnchor} Anchor */

/** @typedef {import("./app-group-types.js").GroupTicketFocus} TicketFocus */

const overscan = 650;

/** @param {Row} row */
function estimate(row) {
  const { title, tags } = row.ticket;
  return 52 + (row.lastInFamily ? 12 : 0) + (tags.length ? 20 : 0)
    + Math.max(0, Math.ceil(title.length / 130) - 1) * 20;
}

/** @param {HTMLElement} root */
function viewportTop(root) {
  return root.getBoundingClientRect().top + root.clientTop;
}

/** @param {HTMLElement} root */
function isAtBottom(root) {
  return root.scrollTop > 0 && root.scrollHeight - root.clientHeight - root.scrollTop <= 2;
}

/** @param {HTMLElement} root @param {HTMLElement} section */
export function captureGroupTicketAnchor(root, section) {
  const rows = section.getElementsByClassName("group-ticket-row");
  const top = viewportTop(root);
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].getBoundingClientRect().bottom <= top) low = middle + 1;
    else high = middle;
  }
  const row = rows[low];
  if (!row || row.getBoundingClientRect().top >= top + root.clientHeight) return null;
  return {
    id: Number(row.getAttribute("data-group-row-id")), index: low,
    offset: row.getBoundingClientRect().top - top, bottom: isAtBottom(root),
  };
}

/** @param {HTMLElement} root @param {HTMLElement} section @param {Anchor} anchor */
export function restoreGroupTicketAnchor(root, section, anchor) {
  if (anchor.bottom) root.scrollTop = root.scrollHeight;
  else {
    const same = section.querySelector(`[data-group-row-id="${anchor.id}"]`);
    const row = same ?? section.getElementsByClassName("group-ticket-row")[anchor.index];
    if (row) root.scrollTop += row.getBoundingClientRect().top - viewportTop(root) - anchor.offset;
  }
}

/** @param {HTMLElement} root @param {HTMLElement} section @param {Model} initial */
export function createGroupTicketWindow(root, section, initial) {
  const canvas = document.createElement("div");
  canvas.className = "group-ticket-window";
  root.classList.add("has-group-ticket-window");
  section.replaceChildren(canvas);

  let model = initial;
  /** @type {Map<number, number>} */
  let indices = new Map();
  /** @type {Map<number, {node: HTMLElement, html: string}>} */
  const mounted = new Map();
  /** @type {Map<number, number>} */
  const measured = new Map();
  let offsets = new Float64Array(0);
  let busy = false;
  /** @type {number | null} */ let highlightedId = null;
  let frame = 0;
  /** @type {number | null} */ let preparedId = null;
  let lastWidth = canvas.clientWidth;
  let lastTop = root.scrollTop;
  /** @type {Anchor | null} */
  let lastAnchor = null;
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  observer.observe(canvas);
  root.addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("keydown", prepareTab, true);
  document.addEventListener("focusin", clearPreparedRow);

  /** @param {Model} next */
  function indexModel(next) {
    model = next;
    indices = new Map(model.rows.map(({ ticket }, index) => [ticket.id, index]));
    for (const id of measured.keys()) if (!indices.has(id)) measured.delete(id);
    writeOffsets();
  }

  function writeOffsets() {
    offsets = new Float64Array(model.rows.length + 1);
    for (let index = 0; index < model.rows.length; index++) {
      const row = model.rows[index];
      offsets[index + 1] = offsets[index] + (measured.get(row.ticket.id) ?? estimate(row));
    }
    canvas.style.height = offsets.at(-1) + "px";
  }

  function canvasTop() {
    return canvas.getBoundingClientRect().top - viewportTop(root) + root.scrollTop;
  }

  /** @param {number} position */
  function rowAt(position) {
    let low = 0;
    let high = model.rows.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle] <= position) low = middle;
      else high = middle;
    }
    return low;
  }

  function capture() {
    const top = viewportTop(root);
    const viewportBottom = top + root.clientHeight;
    for (const child of canvas.children) {
      const rect = child.getBoundingClientRect();
      if (rect.top >= viewportBottom) break;
      if (rect.bottom <= top) continue;
      const id = Number(child.getAttribute("data-group-window-id"));
      const index = indices.get(id);
      if (index !== undefined) return { id, index, offset: rect.top - top, bottom: isAtBottom(root) };
    }
    return null;
  }

  /** @param {number} index */
  function rowElement(index) {
    const row = model.rows[index];
    if (!row) return null;
    const id = row.ticket.id;
    let entry = mounted.get(id);
    if (!entry) {
      const node = document.createElement("div");
      node.className = "group-ticket-window-row";
      node.dataset.groupWindowId = String(id);
      entry = { node, html: "" };
      mounted.set(id, entry);
      observer.observe(node);
    }
    entry.node.dataset.groupFamilyId = String(row.familyId);
    entry.node.toggleAttribute("data-group-family-end", row.lastInFamily);
    entry.node.toggleAttribute("data-group-search-match", id === highlightedId);
    entry.node.style.top = offsets[index] + "px";
    return entry;
  }

  function activeRow() {
    const active = document.activeElement;
    const row = active?.closest("[data-group-window-id]");
    return row instanceof HTMLElement && canvas.contains(row) ? row : null;
  }

  /** @param {boolean} [updateRows] */
  function paint(updateRows = false) {
    if (!root.clientHeight) return;
    const focusedRow = activeRow();
    const focusedId = Number(focusedRow?.dataset.groupWindowId);
    const focusedAction = focusedRow && document.activeElement?.hasAttribute("data-group-remove")
      ? "[data-group-remove]" : "[data-group-ticket]";
    const relative = root.scrollTop - canvasTop();
    const from = rowAt(Math.max(0, relative - overscan));
    const to = Math.min(model.rows.length, rowAt(relative + root.clientHeight + overscan) + 1);
    const needed = new Set(Array.from({ length: to - from }, (_, index) => index + from));
    for (const id of [focusedId, preparedId]) {
      const index = id === null ? undefined : indices.get(id);
      if (index !== undefined) needed.add(index);
    }
    for (const [id, entry] of mounted) {
      const index = indices.get(id);
      if (index !== undefined && needed.has(index)) continue;
      observer.unobserve(entry.node);
      entry.node.remove();
      mounted.delete(id);
    }
    const nodes = [];
    for (const index of [...needed].sort((a, b) => a - b)) {
      const entry = rowElement(index);
      if (!entry) continue;
      if (updateRows || !entry.html) {
        const html = model.renderRow(model.rows[index]);
        if (html !== entry.html) entry.node.innerHTML = entry.html = html;
      }
      syncRowBusy(entry.node);
      nodes.push(entry.node);
    }
    const pinned = focusedRow ? nodes.indexOf(focusedRow) : -1;
    let next = canvas.firstElementChild;
    if (pinned >= 0) {
      // Put siblings around the focused node so native focus stays attached.
      let before = focusedRow;
      for (let index = pinned - 1; index >= 0; index--) {
        const node = nodes[index];
        if (node.nextElementSibling !== before || node.parentElement !== canvas) canvas.insertBefore(node, before);
        before = node;
      }
      next = focusedRow?.nextElementSibling ?? null;
    }
    for (let index = pinned + 1; index < nodes.length; index++) {
      const node = nodes[index];
      if (node !== next) canvas.insertBefore(node, next ?? null);
      next = node.nextElementSibling;
    }
    if (focusedRow && canvas.contains(focusedRow) && document.activeElement === document.body) {
      const action = focusedRow.querySelector(focusedAction);
      if (action instanceof HTMLButtonElement && !action.disabled) action.focus({ preventScroll: true });
    }
  }

  /** @param {number} start @param {number} step */
  function findFocusableRow(start, step) {
    for (let index = start; index >= 0 && index < model.rows.length; index += step) {
      const row = model.rows[index];
      if (!row.context || (row.canRemove && !busy)) return index;
    }
    return -1;
  }

  /** @param {KeyboardEvent} event */
  function prepareTab(event) {
    if (!event.isTrusted || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || event.isComposing
      || event.defaultPrevented || !root.clientHeight || document.querySelector("dialog[open]")) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const step = event.shiftKey ? -1 : 1;
    const current = activeRow();
    let start;
    if (current) {
      const actions = [...current.querySelectorAll("button:not(:disabled)")];
      const within = actions.indexOf(active) + step;
      if (within >= 0 && within < actions.length) return;
      const index = indices.get(Number(current.dataset.groupWindowId));
      if (index === undefined) return;
      start = index + step;
    } else {
      const relation = active.compareDocumentPosition(canvas);
      if (step === 1 && (relation & Node.DOCUMENT_POSITION_FOLLOWING)) start = 0;
      else if (step === -1 && (relation & Node.DOCUMENT_POSITION_PRECEDING)) start = model.rows.length - 1;
      else return;
    }
    const target = findFocusableRow(start, step);
    if (target < 0) return;
    preparedId = model.rows[target].ticket.id;
    paint();
    schedule();
  }

  function clearPreparedRow() {
    if (preparedId === null) return;
    preparedId = null;
    schedule();
  }

  /** @param {number} id @param {number} [inset] */
  function reveal(id, inset = 0) {
    const index = indices.get(id);
    if (index === undefined || !root.clientHeight) return null;
    const clip = viewportTop(root) + inset;
    let entry = mounted.get(id);
    const box = entry?.node.getBoundingClientRect();
    if (!box || box.top < clip || box.bottom > viewportTop(root) + root.clientHeight) {
      root.scrollTop = canvasTop() + offsets[index] - inset;
      paint();
      entry = mounted.get(id);
      if (entry) root.scrollTop += entry.node.getBoundingClientRect().top - clip;
    }
    schedule();
    return entry?.node ?? null;
  }

  function captureFocus() {
    const active = document.activeElement;
    const current = activeRow();
    if (!current) return null;
    const id = Number(current.dataset.groupWindowId);
    const index = indices.get(id);
    return index === undefined ? null : { id, index, remove: !!active?.hasAttribute("data-group-remove") };
  }

  /** @param {TicketFocus} origin @param {boolean} [revealTarget] */
  function focus(origin, revealTarget = false) {
    const index = indices.get(origin.id);
    const row = index === undefined ? null : model.rows[index];
    const preferred = origin.remove ? "[data-group-remove]" : "[data-group-ticket]";
    if (row && ((origin.remove && row.canRemove && !busy) || (!origin.remove && !row.context))) {
      preparedId = origin.id;
      paint();
      const node = revealTarget ? reveal(origin.id) : mounted.get(origin.id)?.node;
      const action = node?.querySelector(preferred);
      if (action instanceof HTMLButtonElement && !action.disabled) {
        action.focus({ preventScroll: true });
        return true;
      }
    }
    const start = index ?? Math.min(origin.index, model.rows.length - 1);
    const next = findFocusableRow(start, 1);
    const fallback = next >= 0 ? next : findFocusableRow(start - 1, -1);
    if (fallback < 0) return false;
    const button = reveal(model.rows[fallback].ticket.id)?.querySelector("button:not(:disabled)");
    if (!(button instanceof HTMLButtonElement)) return false;
    button.focus({ preventScroll: true });
    return true;
  }

  /** @param {HTMLElement} node */
  function syncRowBusy(node) {
    const action = node.querySelector("[data-group-remove]");
    if (action instanceof HTMLButtonElement) action.disabled = busy;
  }

  /** @param {Anchor | null} anchor */
  function restore(anchor) {
    if (!anchor || !root.clientHeight) return;
    if (anchor.bottom) root.scrollTop = root.scrollHeight;
    else {
      const index = indices.get(anchor.id) ?? Math.min(anchor.index, model.rows.length - 1);
      root.scrollTop = canvasTop() + offsets[index] - anchor.offset;
      paint();
      const item = mounted.get(model.rows[index]?.ticket.id);
      if (item) root.scrollTop += item.node.getBoundingClientRect().top - viewportTop(root) - anchor.offset;
    }
    paint();
  }

  function refresh() {
    frame = 0;
    preparedId = null;
    if (!canvas.isConnected || !root.clientHeight) return;
    const width = canvas.clientWidth;
    const widthChanged = lastWidth !== width;
    const anchor = widthChanged && Math.abs(root.scrollTop - lastTop) <= 1 ? lastAnchor : capture();
    lastWidth = width;
    let updated = widthChanged;
    if (widthChanged) measured.clear();
    for (const [id, { node }] of mounted) {
      const height = node.getBoundingClientRect().height;
      if (!height || Math.abs((measured.get(id) ?? 0) - height) < 0.05) continue;
      measured.set(id, height);
      updated = true;
    }
    if (updated) {
      writeOffsets();
      restore(anchor);
    }
    paint();
    lastTop = root.scrollTop;
    lastAnchor = capture();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }

  indexModel(initial);
  paint();
  schedule();

  return {
    capture,
    captureFocus,
    focus,
    reveal,
    restore,
    /** @param {number | null} id */
    highlight(id) {
      highlightedId = id;
      for (const [key, { node }] of mounted) node.toggleAttribute("data-group-search-match", key === id);
    },
    /** @param {Model} next @param {Anchor | null} anchor */
    update(next, anchor) {
      indexModel(next);
      restore(anchor);
      paint(true);
      schedule();
    },
    /** @param {boolean} value */
    setBusy(value) {
      busy = value;
      for (const { node } of mounted.values()) syncRowBusy(node);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("scroll", schedule);
      document.removeEventListener("keydown", prepareTab, true);
      document.removeEventListener("focusin", clearPreparedRow);
      root.classList.remove("has-group-ticket-window");
      canvas.remove();
    },
  };
}
