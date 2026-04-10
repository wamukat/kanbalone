export function calculateVisibleWindow(
  totalCount: number,
  rowHeight: number,
  overscan: number,
  scrollTop: number,
  viewportHeight: number,
): { startIndex: number; endIndex: number };

export function takeRoundRobinBatch(
  laneQueues: Array<{ index: number; tickets: unknown[] }>,
  startLaneIndex: number,
  batchSize: number,
): {
  selections: Array<{ laneIndex: number; ticketIndex: number }>;
  nextLaneIndex: number;
};
