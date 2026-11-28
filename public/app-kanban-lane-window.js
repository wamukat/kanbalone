const OVERSCAN = 5;
const ESTIMATED_CARD_HEIGHT = 92;

export function discardMeasurementsOutside(measurements, ticketIds) {
  for (const id of measurements.keys()) {
    if (!ticketIds.has(id)) measurements.delete(id);
  }
}

export function createKanbanLaneWindow(list, tickets, createCard, measurements, pruneMeasurements) {
  const indexById = new Map(tickets.map((ticket, index) => [ticket.id, index]));
  if (pruneMeasurements) discardMeasurementsOutside(measurements, indexById);
  const measurementCapacity = Math.max(indexById.size, measurements.size);
  const evictionCandidates = measurements.keys();
  const gap = Number.parseFloat(getComputedStyle(list).paddingBlockStart) || 0;
  const offsets = new Float64Array(tickets.length + 1);
  const heights = new Float64Array(tickets.length);
  const nodes = new Map();
  const cardIndexes = new WeakMap();
  const sentinel = document.createComment("end of Kanban window");
  list.append(sentinel);
  list.dataset.kanbanWindow = String(tickets.length);
  let width = list.clientWidth;
  let scheduled = 0;
  let disposed = false;
  let dragId = null;
  let positionBeforeLayout = null;
  let observedScrollTop = 0;

  function rememberHeight(ticket, height) {
    if (!measurements.has(ticket.id) && measurements.size === measurementCapacity) {
      // A full cache with a missing current ID must contain an ID from outside this window's model.
      for (const id of evictionCandidates) {
        if (indexById.has(id)) continue;
        measurements.delete(id);
        break;
      }
    }
    measurements.set(ticket.id, { height, width, revision: ticket.updatedAt, taskCount: ticket.taskCount, doneTaskCount: ticket.doneTaskCount, unresolvedBlockerCount: ticket.unresolvedBlockerCount, hasChildren: ticket.hasChildren });
  }

  function rememberPosition() {
    positionBeforeLayout = anchor();
    observedScrollTop = list.scrollTop;
  }

  function currentPosition() {
    if (positionBeforeLayout && Math.abs(observedScrollTop - list.scrollTop) <= 1) return positionBeforeLayout;
    return anchor();
  }

  function resetHeights() {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const sample = measurements.get(ticket.id);
      heights[i] = sample?.width === width && sample.revision === ticket.updatedAt
        && sample.taskCount === ticket.taskCount && sample.doneTaskCount === ticket.doneTaskCount
        && sample.unresolvedBlockerCount === ticket.unresolvedBlockerCount && sample.hasChildren === ticket.hasChildren
        ? sample.height : ESTIMATED_CARD_HEIGHT;
    }
    updateOffsets();
  }

  function updateOffsets() {
    for (let i = 0; i < tickets.length; i++) {
      offsets[i + 1] = offsets[i] + heights[i] + (i === 0 ? 0 : gap);
    }
  }

  function cardTop(index) {
    return gap + offsets[index] + (index === 0 ? 0 : gap);
  }

  function indexAt(position) {
    let lo = 0;
    let hi = tickets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cardTop(mid) <= position) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function atBottom() {
    return list.scrollTop > 0 && list.scrollHeight - list.clientHeight - list.scrollTop <= 1;
  }

  function anchor() {
    const clip = list.getBoundingClientRect();
    let index = indexAt(list.scrollTop);
    let y = cardTop(index) - list.scrollTop;
    for (const [key, node] of nodes) {
      if (typeof key !== "number") continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom > clip.top && rect.top < clip.bottom) {
        index = key;
        y = rect.top - clip.top;
        break;
      }
    }
    return { id: tickets[index].id, index, y, bottom: atBottom(), top: list.scrollTop === 0 };
  }

  function restore(position) {
    if (!position || disposed || !list.isConnected || list.clientHeight <= 0) return;
    if (position.top || position.bottom) {
      paint();
      list.scrollTop = position.top ? 0 : list.scrollHeight;
      paint();
      if (position.bottom) list.scrollTop = list.scrollHeight;
      rememberPosition();
      return;
    }
    const index = indexById.get(position.id) ?? Math.min(position.index, tickets.length - 1);
    list.scrollTop = cardTop(index) - position.y;
    paint(index);
    const card = nodes.get(index);
    if (card) {
      list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - position.y;
    }
    paint();
    rememberPosition();
  }

  const observer = new ResizeObserver(entries => {
    if (disposed || !list.isConnected || list.clientWidth <= 0 || list.clientHeight <= 0) return;
    const dimensionsChanged = list.clientWidth !== width;
    const measured = [];
    for (const entry of entries) {
      const index = cardIndexes.get(entry.target);
      if (index == null || nodes.get(index) !== entry.target) continue;
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
      if (height > 0 && (dimensionsChanged || Math.abs(heights[index] - height) > 0.25)) {
        measured.push([index, height]);
      }
    }
    if (!measured.length && !dimensionsChanged) {
      paint();
      rememberPosition();
      return;
    }
    const position = currentPosition();
    if (dimensionsChanged) {
      width = list.clientWidth;
      resetHeights();
    }
    for (const [index, height] of measured) {
      heights[index] = height;
      rememberHeight(tickets[index], height);
    }
    updateOffsets();
    restore(position);
  });

  function resetAfterFontLoad() {
    if (disposed || !list.isConnected || list.clientHeight <= 0) return;
    const position = currentPosition();
    measurements.clear();
    resetHeights();
    for (const [index, card] of nodes) {
      if (typeof index !== "number") continue;
      const height = card.getBoundingClientRect().height;
      heights[index] = height;
      rememberHeight(tickets[index], height);
    }
    updateOffsets();
    restore(position);
  }

  function paint(extraIndex) {
    if (disposed || !list.isConnected || list.clientHeight <= 0) return;
    const start = Math.max(0, indexAt(list.scrollTop) - OVERSCAN);
    const end = Math.min(tickets.length - 1, indexAt(list.scrollTop + list.clientHeight) + OVERSCAN);
    const indexes = [];
    for (let i = start; i <= end; i++) indexes.push(i);
    const active = document.activeElement?.closest(".ticket-card");
    const focused = active && cardIndexes.get(active);
    for (const pinned of [extraIndex, focused, indexById.get(dragId)]) {
      if (pinned != null && (pinned < start || pinned > end) && !indexes.includes(pinned)) indexes.push(pinned);
    }
    indexes.sort((a, b) => a - b);

    const next = new Map();
    function spacer(from, to) {
      if (from >= to) return;
      const key = `${from}:${to}`;
      const node = nodes.get(key) ?? document.createElement("div");
      node.className = "kanban-window-spacer";
      node.setAttribute("aria-hidden", "true");
      node.style.height = `${offsets[to] - offsets[from]}px`;
      next.set(key, node);
    }
    let from = 0;
    const added = [];
    for (const index of indexes) {
      spacer(from, index);
      let card = nodes.get(index);
      if (!card) {
        card = createCard(tickets[index]);
        cardIndexes.set(card, index);
        added.push(card);
      }
      next.set(index, card);
      from = index + 1;
    }
    spacer(from, tickets.length);

    for (const [key, node] of nodes) {
      if (next.has(key)) continue;
      if (typeof key === "number") observer.unobserve(node);
      node.remove();
    }
    // Retained cards are already ordered. Insert around them without
    // reparenting a focused element or the browser's native drag source.
    let cursor = list.firstChild;
    for (const node of next.values()) {
      if (node === cursor) cursor = cursor.nextSibling;
      else list.insertBefore(node, cursor ?? sentinel);
    }
    nodes.clear();
    for (const [key, node] of next) nodes.set(key, node);
    for (const card of added) observer.observe(card, { box: "border-box" });
  }

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      const atEnd = atBottom();
      paint();
      if (atEnd) list.scrollTop = list.scrollHeight;
      rememberPosition();
    });
  }

  function title(ticketId, scroll = true) {
    const index = indexById.get(ticketId);
    if (index == null) return null;
    if (!nodes.has(index)) {
      if (scroll) list.scrollTop = Math.max(0, cardTop(index) - list.clientHeight / 2);
      paint(index);
    }
    return nodes.get(index)?.querySelector(".ticket-link") ?? null;
  }

  function neighbor(ticketId, direction) {
    const index = indexById.get(ticketId);
    return index == null ? undefined : tickets[index + direction]?.id ?? null;
  }

  function preview(listPreview) {
    // Mount a small prefix into the attached drag image so its width-dependent
    // wrapping can be used to bound the preview, without changing the source.
    let count = 0;
    let bottom = listPreview.getBoundingClientRect().bottom;
    while (count < tickets.length) {
      const card = nodes.get(count)?.cloneNode(true) ?? createCard(tickets[count]);
      listPreview.append(card);
      if (card.getBoundingClientRect().top >= bottom) {
        card.remove();
        break;
      }
      count++;
    }
    if (count < tickets.length) {
      const spacer = document.createElement("div");
      spacer.className = "kanban-window-spacer";
      spacer.style.height = `${offsets[tickets.length] - offsets[count]}px`;
      listPreview.append(spacer);
    }
  }

  function dispose() {
    disposed = true;
    observer.disconnect();
    if (scheduled) cancelAnimationFrame(scheduled);
    list.removeEventListener("scroll", schedule);
    document.fonts?.removeEventListener("loadingdone", resetAfterFontLoad);
  }

  resetHeights();
  list.addEventListener("scroll", schedule, { passive: true });
  document.fonts?.addEventListener("loadingdone", resetAfterFontLoad);
  observer.observe(list);
  paint();
  rememberPosition();

  return {
    title, neighbor, anchor, restore, paint, dispose, preview,
    firstId: tickets[0].id,
    lastId: tickets.at(-1).id,
    peekFirstTitle: () => nodes.get(0)?.querySelector(".ticket-link"),
    pinDrag(id) { dragId = id; schedule(); },
  };
}
