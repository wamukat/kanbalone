const MAX_CACHED_HEIGHTS = 2048;

// Only mounted rows are observed or read. Unvisited rows occupy their estimated
// height, allowing the full matching collection to retain a native scrollbar.
export function createListRowWindow({
  viewport, canvas, spacer, entries, estimate, overscan, measurements, layoutKey, createRow, initialAnchor,
}) {
  const indices = new Map(entries.map(({ ticket }, index) => [ticket.id, index]));
  const heights = new Float64Array(entries.length);
  const offsets = new Float64Array(entries.length + 1);
  const mounted = new Map();
  const nodeIndices = new WeakMap();
  let width = viewport.clientWidth;
  let lastTop = viewport.scrollTop;
  let lastAnchor = initialAnchor;
  let pendingAnchor = initialAnchor;
  let frame = 0;

  function writeOffsets(from = 0) {
    for (let index = from; index < entries.length; index++) offsets[index + 1] = offsets[index] + heights[index];
    spacer.style.height = `${offsets[entries.length]}px`;
  }

  function resetHeights() {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const cached = measurements.get(entry.ticket.id);
      heights[index] = cached?.width === width && cached.key === layoutKey(entry) ? cached.height : estimate;
    }
  }

  function indexAt(top) {
    let low = 0;
    let high = entries.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid] <= top) low = mid;
      else high = mid;
    }
    return low;
  }

  function capture() {
    if (!viewport.clientHeight) return pendingAnchor ?? lastAnchor ?? null;
    const top = viewport.scrollTop;
    if (pendingAnchor && Math.abs(top - lastTop) <= 1) return pendingAnchor;
    const index = indexAt(top);
    return {
      id: entries[index].ticket.id,
      index,
      offset: Math.max(0, top - offsets[index]),
      top: top === 0,
      bottom: top > 0 && viewport.scrollHeight - viewport.clientHeight - top <= 1,
    };
  }

  function remember() {
    lastTop = viewport.scrollTop;
    lastAnchor = capture();
  }

  function paint(extraIndex) {
    const start = Math.max(0, indexAt(viewport.scrollTop) - overscan);
    const end = Math.min(entries.length - 1, indexAt(viewport.scrollTop + viewport.clientHeight) + overscan);
    const wanted = new Set();
    for (let index = start; index <= end; index++) wanted.add(index);
    const active = document.activeElement?.closest(".list-row");
    const focusedIndex = active && nodeIndices.get(active);
    if (focusedIndex != null) wanted.add(focusedIndex);
    if (extraIndex != null) wanted.add(extraIndex);

    for (const [index, row] of mounted) {
      if (wanted.has(index)) continue;
      observer.unobserve(row);
      row.remove();
      mounted.delete(index);
    }
    let next = canvas.firstElementChild;
    for (const index of [...wanted].sort((a, b) => a - b)) {
      let row = mounted.get(index);
      if (!row) {
        row = createRow(entries[index]);
        row.setAttribute("aria-rowindex", String(index + 2));
        nodeIndices.set(row, index);
        mounted.set(index, row);
        observer.observe(row, { box: "border-box" });
      }
      const top = `${offsets[index]}px`;
      if (row.style.top !== top) row.style.top = top;
      if (row !== next) canvas.insertBefore(row, next);
      next = row.nextElementSibling;
    }
  }

  function setScroll(anchor) {
    const index = indices.get(anchor.id) ?? Math.min(anchor.index, entries.length - 1);
    viewport.scrollTop = anchor.top ? 0 : anchor.bottom ? viewport.scrollHeight :
      offsets[index] + Math.min(anchor.offset, Math.max(heights[index] - 1, 0));
  }

  function restore(anchor) {
    if (!anchor) return;
    if (!viewport.clientHeight) {
      pendingAnchor = anchor;
      return;
    }
    setScroll(anchor);
    paint();
    remember();
  }

  function rememberHeight(index, height) {
    const entry = entries[index];
    const id = entry.ticket.id;
    if (measurements.has(id)) measurements.delete(id);
    else if (measurements.size === MAX_CACHED_HEIGHTS) measurements.delete(measurements.keys().next().value);
    measurements.set(id, { width, height, key: layoutKey(entry) });
  }

  function updateGeometry(records, fontsChanged = false) {
    if (fontsChanged) measurements.clear();
    if (!viewport.isConnected || !viewport.clientWidth || !viewport.clientHeight) return;
    const nextWidth = viewport.clientWidth;
    const widthChanged = nextWidth !== width;
    const sameScroll = Math.abs(viewport.scrollTop - lastTop) <= 1 ||
      (lastAnchor?.bottom && viewport.scrollTop >= Math.min(lastTop, viewport.scrollHeight - viewport.clientHeight) - 1);
    const measureInitialAnchor = pendingAnchor != null && sameScroll;
    const anchor = (sameScroll ? pendingAnchor ?? lastAnchor : null) ?? capture();
    pendingAnchor = null;
    let earliest = entries.length;
    if (widthChanged || fontsChanged) {
      width = nextWidth;
      resetHeights();
      earliest = 0;
    }
    const recordHeights = new Map(records.map(item => [item.target, item.borderBoxSize?.[0]?.blockSize]));
    for (const [index, row] of mounted) {
      if (!widthChanged && !fontsChanged && !measureInitialAnchor && !recordHeights.has(row)) continue;
      const height = recordHeights.get(row) ?? row.getBoundingClientRect().height;
      if (height <= 0 || (!widthChanged && !fontsChanged && Math.abs(heights[index] - height) < 0.05)) continue;
      heights[index] = height;
      rememberHeight(index, height);
      earliest = Math.min(earliest, index);
    }
    if (earliest < entries.length) writeOffsets(earliest);
    const gutter = `${viewport.offsetWidth - viewport.clientWidth}px`;
    const grid = viewport.parentElement;
    if (grid.style.getPropertyValue("--list-viewport-gutter") !== gutter) grid.style.setProperty("--list-viewport-gutter", gutter);
    if (anchor && (earliest < entries.length || anchor.bottom || measureInitialAnchor)) setScroll(anchor);
    paint();
    remember();
  }

  const observer = new ResizeObserver(records => updateGeometry(records));
  const onFontsChanged = () => updateGeometry([], true);
  document.fonts?.addEventListener("loadingdone", onFontsChanged);

  resetHeights();
  writeOffsets();
  if (initialAnchor && viewport.clientHeight) {
    setScroll(initialAnchor);
  }
  paint();
  if (viewport.clientWidth) remember();
  observer.observe(viewport);

  return {
    capture,
    restore,
    reveal(ticketId, scroll) {
      const index = indices.get(ticketId);
      if (index == null) return null;
      if (scroll) {
        const top = offsets[index];
        const bottom = offsets[index + 1];
        if (top < viewport.scrollTop || (heights[index] >= viewport.clientHeight && top !== viewport.scrollTop)) {
          viewport.scrollTop = top;
        } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
          viewport.scrollTop = bottom - viewport.clientHeight;
        }
      }
      paint(index);
      const row = mounted.get(index);
      if (scroll && row && viewport.clientHeight) {
        // The first visit to a long row still uses an estimate. Align its
        // actual content without waiting for the asynchronous observer.
        const viewportRect = viewport.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        if (rowRect.top < viewportRect.top || rowRect.height >= viewport.clientHeight) viewport.scrollTop += rowRect.top - viewportRect.top;
        else if (rowRect.bottom > viewportRect.bottom) viewport.scrollTop += rowRect.bottom - viewportRect.bottom;
        remember();
      }
      return row ?? null;
    },
    schedule() {
      if (pendingAnchor && Math.abs(viewport.scrollTop - lastTop) > 1) pendingAnchor = null;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
        remember();
      });
    },
    paint,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", onFontsChanged);
    },
  };
}
