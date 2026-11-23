// @ts-check
/** @typedef {import("./app-group-types.js").GroupTicketWindowModel} Model */
/** @typedef {import("./app-group-types.js").GroupTicketRow} Row */
/** @typedef {{id: number, index: number, offset: number, bottom: boolean}} Anchor */

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
  let frame = 0;
  let lastWidth = canvas.clientWidth;
  let lastTop = root.scrollTop;
  /** @type {Anchor | null} */
  let lastAnchor = null;
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  observer.observe(canvas);
  root.addEventListener("scroll", schedule, { passive: true });

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
    entry.node.style.top = offsets[index] + "px";
    return entry;
  }

  /** @param {boolean} [updateRows] */
  function paint(updateRows = false) {
    if (!root.clientHeight) return;
    const relative = root.scrollTop - canvasTop();
    const from = rowAt(Math.max(0, relative - overscan));
    const to = Math.min(model.rows.length, rowAt(relative + root.clientHeight + overscan) + 1);
    /** @type {Set<number>} */
    const needed = new Set();
    for (let index = from; index < to; index++) needed.add(model.rows[index].ticket.id);
    for (const [id, entry] of mounted) {
      if (needed.has(id)) continue;
      observer.unobserve(entry.node);
      entry.node.remove();
      mounted.delete(id);
    }
    let next = canvas.firstElementChild;
    for (let index = from; index < to; index++) {
      const entry = rowElement(index);
      if (!entry) continue;
      if (updateRows || !entry.html) {
        const html = model.renderRow(model.rows[index]);
        if (html !== entry.html) entry.node.innerHTML = entry.html = html;
      }
      if (entry.node !== next) canvas.insertBefore(entry.node, next);
      next = entry.node.nextElementSibling;
      syncRowBusy(entry.node);
    }
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
    restore,
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
      root.classList.remove("has-group-ticket-window");
      canvas.remove();
    },
  };
}
