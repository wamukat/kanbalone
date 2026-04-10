export function calculateVisibleWindow(totalCount, rowHeight, overscan, scrollTop, viewportHeight) {
  const safeViewportHeight = Math.max(viewportHeight, rowHeight * 8);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(safeViewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(totalCount, startIndex + visibleCount);
  return { startIndex, endIndex };
}

export function takeRoundRobinBatch(laneQueues, startLaneIndex, batchSize) {
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
