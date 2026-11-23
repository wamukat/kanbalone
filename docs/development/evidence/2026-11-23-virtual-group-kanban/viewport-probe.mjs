// Install in the page before navigation. The probe is used only by local fixture runners.
export function installViewportProbe() {
  const boardClip = { left: 0, top: 0, right: 0, bottom: 0 };
  const heldModels = new Map();
  const trackedViewports = new Map();

  function isIntersecting(rect, clip) {
    return rect.width > 0 && rect.height > 0
      && rect.left < clip.right && rect.right > clip.left
      && rect.top < clip.bottom && rect.bottom > clip.top;
  }

  function clipFor(element, outer) {
    const rect = element.getBoundingClientRect();
    const left = rect.left + element.clientLeft;
    const top = rect.top + element.clientTop;
    return {
      left: Math.max(outer.left, left),
      right: Math.min(outer.right, left + element.clientWidth),
      top: Math.max(outer.top, top),
      bottom: Math.min(outer.bottom, top + element.clientHeight),
    };
  }

  function snapshotViewport(view) {
    const kanban = view === 'kanban';
    const root = document.querySelector(kanban ? '#lane-board' : '#group-board');
    if (!root || root.hidden) return [];
    boardClip.right = innerWidth;
    boardClip.bottom = innerHeight;
    const rootClip = clipFor(root, boardClip);
    const lists = kanban ? root.querySelectorAll('.ticket-list[data-lane-id]') : [root];
    const items = [];
    for (const list of lists) {
      const clip = kanban ? clipFor(list, rootClip) : rootClip;
      if (clip.left >= clip.right || clip.top >= clip.bottom) continue;
      const rows = list.getElementsByClassName(kanban ? 'ticket-card' : 'group-ticket-row');
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        // Rows are top-to-bottom within each current lane or Group section.
        if (rect.top >= clip.bottom) break;
        if (!isIntersecting(rect, clip)) continue;
        const title = row.querySelector(kanban ? '.ticket-link' : '.group-ticket-title');
        const id = kanban ? Number(row.dataset.ticketId) : Number(row.querySelector('.ticket-ref')?.textContent.slice(1));
        if (!title || !Number.isSafeInteger(id) || id <= 0 || row.closest('[hidden], [inert]')) continue;
        const titleRect = title.getBoundingClientRect();
        const titleExposed = isIntersecting(titleRect, clip) && getComputedStyle(title).visibility === 'visible';
        items.push({
          id,
          laneId: kanban ? Number(list.dataset.laneId) : null,
          title: title.textContent.trim(),
          titleExposed,
          actionable: titleExposed && title.matches('button:not(:disabled), a[href]'),
          rect: [rect.x, rect.y, rect.width, rect.height],
        });
      }
    }
    return items;
  }

  function observeInitialViewport(view, expected) {
    const target = document.querySelector(view === 'kanban' ? '#lane-board' : '#group-board');
    if (!target) throw new Error('Board root missing');
    if (!expected.length) throw new Error('Baseline viewport empty');
    const matches = (rows) => rows.length === expected.length && rows.every((row, index) => {
      const reference = expected[index];
      return row.id === reference.id
        && row.laneId === reference.laneId
        && row.title === reference.title
        && row.titleExposed === reference.titleExposed
        && row.actionable === reference.actionable;
    });
    let scheduled = false;
    function check() {
      if (scheduled || !matches(snapshotViewport(view))) return;
      scheduled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const rows = snapshotViewport(view);
        if (!matches(rows)) {
          scheduled = false;
          check();
          return;
        }
        const at = performance.now();
        const mounted = target.getElementsByClassName(view === 'kanban' ? 'ticket-card' : 'group-ticket-row').length;
        trackedViewports.set(view, { at, rows, mounted });
        observer.disconnect();
      }));
    }
    const observer = new MutationObserver(check);
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    check();
  }

  function retainCollection({ view, boardId, scope, revision, orderedIds }) {
    // orderedIds is an accessor over the accepted model. Invoke it after timing.
    if (typeof orderedIds !== 'function') throw new TypeError('Expected an ordered-ID accessor');
    heldModels.set(view, { at: performance.now(), boardId, scope, revision, orderedIds });
  }

  function collectionInfo(view, includeIds = false) {
    const model = heldModels.get(view);
    if (!model) return null;
    const { orderedIds, ...meta } = model;
    return includeIds ? { ...meta, ids: orderedIds() } : meta;
  }

  window.__virtualFixtureProbe = {
    snapshotViewport,
    observeInitialViewport,
    initialViewport: (view) => trackedViewports.get(view) ?? null,
    retainCollection,
    collectionInfo,
  };
}
