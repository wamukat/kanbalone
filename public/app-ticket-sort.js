// @ts-check

/**
 * @typedef {{ id: number; priority: number; tags?: Array<{ name: string }> }} SortableTicket
 * @typedef {{ key: string; direction: string }} TicketSort
 */

export const LIST_SORT_KEYS = new Set(["id", "tags", "priority"]);

/** @param {SortableTicket} a @param {SortableTicket} b */
function comparePriorityDescending(a, b) {
  return b.priority - a.priority || a.id - b.id;
}

/** @param {SortableTicket} a @param {SortableTicket} b */
function compareIdAscending(a, b) {
  return a.id - b.id;
}

/** @param {SortableTicket} ticket */
function getTagSortValue(ticket) {
  return [...(ticket.tags ?? [])]
    .map((tag) =>
      String(tag.name ?? "")
        .trim()
        .toLocaleLowerCase(),
    )
    .sort()
    .join("\u0000");
}

/** @param {SortableTicket} a @param {SortableTicket} b @param {string} [direction] */
function compareTags(a, b, direction = "asc") {
  const left = getTagSortValue(a);
  const right = getTagSortValue(b);
  if (left !== right) {
    if (!left) {
      return 1;
    }
    if (!right) {
      return -1;
    }
    const result = left.localeCompare(right);
    return direction === "desc" ? -result : result;
  }
  return compareIdAscending(a, b);
}

/** @param {SortableTicket} a @param {SortableTicket} b @param {string} [direction] */
function comparePriority(a, b, direction = "asc") {
  const priorityDifference = a.priority - b.priority;
  if (priorityDifference !== 0) {
    return direction === "desc" ? -priorityDifference : priorityDifference;
  }
  return compareIdAscending(a, b);
}

/** @param {TicketSort | null} [sort] @returns {(a: SortableTicket, b: SortableTicket) => number} */
export function getListTicketComparator(sort = null) {
  if (!sort || !LIST_SORT_KEYS.has(sort.key)) {
    return comparePriorityDescending;
  }
  if (sort.key === "tags") {
    return (a, b) => compareTags(a, b, sort.direction);
  }
  if (sort.key === "priority") {
    return (a, b) => comparePriority(a, b, sort.direction);
  }
  return sort.direction === "desc" ? (a, b) => b.id - a.id : compareIdAscending;
}
