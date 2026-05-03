// @ts-check

/**
 * @param {number} totalCount
 * @param {number} rowHeight
 * @param {number} overscan
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @returns {{ startIndex: number; endIndex: number }}
 */
export function calculateVisibleWindow(totalCount, rowHeight, overscan, scrollTop, viewportHeight) {
  const safeViewportHeight = Math.max(viewportHeight, rowHeight * 8);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(safeViewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(totalCount, startIndex + visibleCount);
  return { startIndex, endIndex };
}

/**
 * @template T
 * @param {Array<{ tickets: T[]; index: number }>} laneQueues
 * @param {number} startLaneIndex
 * @param {number} batchSize
 * @returns {{ selections: Array<{ laneIndex: number; ticketIndex: number }>; nextLaneIndex: number }}
 */
export function takeRoundRobinBatch(laneQueues, startLaneIndex, batchSize) {
  /** @type {Array<{ laneIndex: number; ticketIndex: number }>} */
  const selections = [];
  if (laneQueues.length === 0 || batchSize <= 0) {
    return { selections, nextLaneIndex: 0 };
  }

  let cursor = startLaneIndex % laneQueues.length;
  let checked = 0;
  while (selections.length < batchSize && checked < laneQueues.length) {
    const queue = laneQueues[cursor];
    if (queue.index < queue.tickets.length) {
      selections.push({ laneIndex: cursor, ticketIndex: queue.index });
      queue.index += 1;
      checked = 0;
    } else {
      checked += 1;
    }
    cursor = (cursor + 1) % laneQueues.length;
  }

  return { selections, nextLaneIndex: cursor };
}
