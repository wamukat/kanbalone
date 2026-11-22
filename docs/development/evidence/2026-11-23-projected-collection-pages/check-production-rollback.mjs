import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const evidence = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-subsecond-rollback-"));
const sources = {
  old: resolve(evidence, "variants/base"),
  current: resolve(process.argv[2]),
};
const servers = new Map();
const prefix = "/api/boards/2";

async function launch(version) {
  const source = sources[version];
  const dbFile = resolve(work, version + ".sqlite");
  await copyFile(resolve(evidence, "fixture.sqlite"), dbFile);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, url };
}

try {
  for (const version of Object.keys(sources)) servers.set(version, await launch(version));
  const { api } = await import(pathToFileURL(resolve(sources.current, "public/app-api.js")));
  const { collectTicketPages } = await import(pathToFileURL(resolve(sources.current, "public/app-ticket-pages.js")));

  const projections = [
    { path: prefix + "/group-tickets?groupId=2", order: "id_asc" },
    { path: prefix + "/list-ticket-references?archived=all", order: "position_asc" },
  ];
  for (const name of ["tickets", "relation-candidates"]) {
    const path = prefix + "/" + name + "?limit=200";
    const oldResponse = await fetch(servers.get("old").url + path);
    const currentResponse = await fetch(servers.get("current").url + path);
    assert.equal(currentResponse.status, 200);
    assert.equal(currentResponse.headers.get("X-Kanbalone-Ticket-Page-Limit"), null);
    assert.equal(await currentResponse.text(), await oldResponse.text());
    const overLimit = await fetch(servers.get("current").url + path.replace("limit=200", "limit=201"));
    assert.equal(overLimit.status, 400);
    await overLimit.text();
    console.log(path, "legacy response and cursor bytes match, 201 rejected");
  }
  for (const { path, order } of projections) {
    const expected = await collectTicketPages((url, init) => api(new URL(url, servers.get("old").url), init), path, {
      order, followPageLimit: true,
    });
    const requests = [];
    const actual = await collectTicketPages(async (url, init) => {
      const server = requests.length ? "old" : "current";
      const parsed = new URL(url, servers.get(server).url);
      const record = { server, limit: Number(parsed.searchParams.get("limit")), cursor: parsed.searchParams.get("cursor"), status: 200 };
      requests.push(record);
      try {
        return await api(parsed, init);
      } catch (error) {
        record.status = error.status;
        throw error;
      }
    }, path, { order, followPageLimit: true });
    assert.deepEqual(actual.tickets, expected.tickets);
    assert.equal(actual.ticketRevision, expected.ticketRevision);
    assert.deepEqual(actual.page, expected.page);
    assert.deepEqual(requests.map(req => req.limit).slice(0, 3), [200, 800, 200]);
    assert.equal(requests[0].status, 200);
    assert.equal(requests[1].status, 400);
    assert.equal(requests[1].cursor, requests[2].cursor);
    assert(requests.slice(2).every(req => req.status === 200 && req.limit === 200));
    console.log(path, "rollback 800→200", "requests", requests.length, "rows", actual.tickets.length, "ordered data and revision match");

    const oldFirst = await api(new URL(path + "&limit=200&order=" + order, servers.get("old").url));
    const currentNext = await api(new URL(path + "&limit=800&order=" + order + "&cursor=" +
      encodeURIComponent(oldFirst.page.nextCursor), servers.get("current").url));
    assert.deepEqual(currentNext.tickets, expected.tickets.slice(200, 1000));
    assert.equal(currentNext.page.total, expected.page.total);
    assert.equal(currentNext.ticketRevision, oldFirst.ticketRevision);
    console.log(path, "older cursor accepted with a continuation of", currentNext.tickets.length);
  }
} finally {
  for (const { app } of servers.values()) await app.close();
  await rm(work, { recursive: true, force: true });
}
