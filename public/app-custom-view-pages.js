// A cursor belongs to one query and database revision. Rebuild only the path
// to the reader's current page when a change invalidates its cursor.
export const PAGE_SIZE = 50;

export async function readViewPage(query, definition, cursors, index, isCurrent) {
  const request = cursor => query({ definition, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
  const known = cursors.slice(0, index + 1);
  if (index === 0 || known[index]) {
    try {
      const page = await request(known[index]);
      return { page, index, cursors: [...known, page.nextCursor] };
    } catch (error) {
      if (error.status !== 409 || !index) throw error;
    }
  }
  const fresh = [null];
  for (let position = 0; isCurrent(); position++) {
    let page;
    try {
      page = await request(fresh[position]);
    } catch (error) {
      if (!position || error.status !== 409 || !isCurrent()) throw error;
      // Under continuous changes always provide a consistent first page.
      page = await request(null);
      return { page, index: 0, cursors: [null, page.nextCursor] };
    }
    fresh.push(page.nextCursor);
    if (!page.nextCursor || position === index) return { page, index: position, cursors: fresh };
  }
  return null;
}
