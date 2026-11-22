import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const baseline = '5ff44622f74c2116147d60c11be7f86fbc2208d2';
export const evidenceDir = resolve('coverage/group-ui');
export const source = {
  before: resolve(evidenceDir, 'baseline-source'),
  after: resolve('.'),
};

export async function createRuntime(phase) {
  assert(Object.hasOwn(source, phase));
  const directory = mkdtempSync(resolve(tmpdir(), 'kanbalone-group-ui-'));
  const { buildApp } = await import(pathToFileURL(resolve(source[phase], 'src/app.ts')).href);
  const app = buildApp({
    dbFile: resolve(directory, 'fixture.sqlite'),
    staticDir: resolve(source[phase], 'public'),
    remoteCredentialProviders: [],
    remoteCredentialScopes: [],
  });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    url,
    async close() {
      app.server.closeAllConnections();
      await app.close();
      rmSync(directory, { recursive: true });
    },
    async api(method, path, body) {
      const response = await fetch(url + path, {
        method,
        ...(body && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const data = await response.text();
      assert(response.ok, `${method} ${path} returned ${response.status}: ${data}`);
      return data ? JSON.parse(data) : null;
    },
  };
}

export const shortDescription = 'Read the [release guide](https://example.com/guide) before handing off.';
export const longDescription = [
  '## Coordination',
  'Review the [handoff notes](https://example.com/handoff) before completing the release checklist.',
  '## Next steps',
  'Keep the review tasks grouped so collaborators can see what is waiting and what has already been checked.',
].join('\n\n');
export const updatedDescription = shortDescription.replace('release guide', 'updated release guide');
export const longTagName = 'documentation-handoff-reference-materials-very-long-label-for-review';

export async function createFixture({ api }) {
  const { board, lanes } = await api('POST', '/api/boards', {
    name: 'Release review', laneNames: ['Todo', 'Done'],
  });
  const [todo, done] = lanes;
  await api('PATCH', `/api/lanes/${done.id}`, { isCompletionLane: true });
  const base = `/api/boards/${board.id}`;
  const makeGroup = (name, descriptionMarkdown) =>
    api('POST', base + '/groups', { name, descriptionMarkdown });
  const makeTag = (name, color) => api('POST', base + '/tags', { name, color });
  const mixed = await makeGroup('Release checklist', shortDescription);
  const empty = await makeGroup('Ideas');
  const open = await makeGroup('Next milestone', longDescription);
  const completed = await makeGroup('Completed review');
  const archived = await makeGroup('Archived backlog');
  const colored = await makeTag('design', '#7950a3');
  const neutral = await makeTag('review', '');
  const long = await makeTag(longTagName, '#1F6F5F');
  const extra = await makeTag('follow-up', '#336699');
  const makeTicket = (title, extra = {}) =>
    api('POST', base + '/tickets', { title, laneId: todo.id, ...extra });

  const parent = await makeTicket('Prepare release handoff', {
    groupId: mixed.id, priority: 3, tagIds: [colored.id, neutral.id, long.id],
  });
  const child = await makeTicket('Verify keyboard navigation', {
    parentTicketId: parent.id, tagIds: [long.id, extra.id],
  });
  const resolved = await makeTicket('Collect baseline screenshots', {
    groupId: mixed.id, laneId: done.id,
  });
  const archivedOpen = await makeTicket('Deferred review', {
    groupId: mixed.id, isArchived: true, tagIds: [neutral.id],
  });
  const archivedDone = await makeTicket('Prior release proof', {
    groupId: mixed.id, isArchived: true, laneId: done.id,
  });
  const milestone = await makeTicket('Draft milestone plan', { groupId: open.id });
  const finished = await makeTicket('Confirm checklist', {
    groupId: completed.id, laneId: done.id,
  });
  const backlog = await makeTicket('Archived without completion', {
    groupId: archived.id, isArchived: true,
  });
  assert.equal(parent.id, 1);
  assert.equal(child.groupId, mixed.id);
  assert.equal(backlog.isResolved, false);
  return {
    board, todo, done, mixed, open, empty, completed, archived,
    parent, child, resolved, archivedOpen, archivedDone, milestone, finished, backlog,
    colored, neutral, long, extra,
  };
}
