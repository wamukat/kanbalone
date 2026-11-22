import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { variants } from './config.mjs';

const load = (source, file) => import(pathToFileURL(resolve(source, file)));
const legacy = await load(variants.before.source, 'src/db-modules/ticket-pagination.ts');
const current = await load(variants.after.source, 'src/db-modules/ticket-pagination.ts');
const { KanbanDb } = await load(variants.after.source, 'src/db.ts');
const db = new KanbanDb(':memory:');
try {
  const { board, lanes } = db.createBoard({ name: 'Review', laneNames: ['Todo', 'Done'] });
  db.sqlite.prepare('UPDATE lanes SET is_completion_lane = 1 WHERE id = ?').run(lanes[1].id);
  const ids = [];
  for (let i = 0; i < 9; i++) {
    const ticket = db.createTicket({
      boardId: board.id, laneId: lanes[i % 2].id, title: 'Title' + i,
      priority: i % 4 + 1, isArchived: i === 4,
      parentTicketId: i === 5 ? ids[2] : undefined,
      blockerIds: i === 6 ? [ids[0]] : undefined,
    });
    ids.push(ticket.id);
  }

  for (const filters of [{}, { includeArchived: true }, { priorities: [2, 3] }]) {
    const args = [db.sqlite, board.id, filters];
    assert.deepEqual(legacy.listTicketPage(...args, {}), current.listTicketPage(...args, {}));
    for (const order of ['id_asc', 'completed_desc', 'position_asc']) {
      assert.deepEqual(legacy.listTicketPage(...args, { order }), current.listTicketPage(...args, { order }));
      const options = { limit: 2, order };
      const before = legacy.listTicketPage(...args, options);
      const after = current.listTicketPage(...args, options);
      assert.deepEqual(before, after);
      assert(before.page.nextCursor);
      assert.deepEqual(
        legacy.listTicketPage(...args, { order, limit: 3, cursor: after.page.nextCursor }),
        current.listTicketPage(...args, { order, limit: 3, cursor: before.page.nextCursor }),
      );
    }
  }

  const list = (reader, limit, cursor) => reader(db.sqlite, board.id, { includeArchived: true }, { order: 'id_asc', limit, cursor });
  const candidates = (limit, cursor) => current.listTicketRelationCandidatePage(db.sqlite, board.id, { limit, cursor });
  const all = list(legacy.listTicketPage, 20);
  assert.equal(all.tickets.length, 9);
  assert(all.tickets.some(row => row.isArchived));
  assert(all.tickets.some(row => row.isResolved));
  assert(all.tickets.some(row => !row.isResolved));
  assert(all.tickets.some(row => row.parentTicketId !== null));
  assert(all.tickets.some(row => row.blockerIds.length > 0));
  const result = candidates(20);
  assert.equal(result.revision, all.revision);
  assert.deepEqual(result.tickets, all.tickets.map(({ id, title, parentTicketId, priority, blockerIds, isResolved }) => (
    { id, title, parentTicketId, priority, blockerIds, isResolved }
  )));
  assert.throws(() => list(current.listTicketPage, 2, candidates(2).page.nextCursor), { statusCode: 400 });
  assert.throws(() => candidates(2, list(legacy.listTicketPage, 2).page.nextCursor), { statusCode: 400 });
  console.log('PASS: three filters x three orders, old/new signed cursor interchange, six-field equality, and candidate cursor namespace.');
} finally {
  db.close();
}
