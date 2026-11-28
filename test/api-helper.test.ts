import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildApp } from "../src/app.js";

const exec = promisify(execFile);
const helperPath = path.resolve("skills/kanbalone-api/scripts/kanbalone_api.py");

function runHelper(base: string, args: string[], stdin = "") {
  const result = exec("python3", [helperPath, "--base", base, ...args]);
  result.child.stdin!.end(stdin);
  return result;
}

test("API helper sends default and explicit headers with its existing body inputs", async (t) => {
  const requests: Array<{ method?: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, headers: request.headers, body });
    if (request.url === "/api/redirect") {
      response.writeHead(302, { location: "/api/test" }).end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  for (const [method, body] of [["GET", ""], ["DELETE", ""], ["POST", '{"bodyMarkdown":"hello"}']]) {
    await runHelper(base, [method, "/api/test"], body);
  }
  assert.deepEqual(requests.map(({ method, headers }) => [method, headers.accept, headers["content-type"]]), [
    ["GET", "application/json", undefined],
    ["DELETE", "application/json", undefined],
    ["POST", "application/json", "application/json"],
  ]);
  assert.equal(requests[0].body, "");
  assert.equal(requests[1].body, "");
  assert.deepEqual(JSON.parse(requests[2].body), { bodyMarkdown: "hello" });

  await runHelper(base, [
    "--header", "Accept: application/xml",
    "--header", "X-Trace: unused",
    "POST", "/api/test",
    "--header", "aCCePt: application/hal+json",
    "--header", "CONTENT-type: application/json; charset=utf-8",
    "--header", "x-trace:  Café: test  ",
    "--header", "X-Empty:",
    '{"title":"argument"}',
  ], "ignored stdin");
  const { headers, body } = requests[3];
  assert.equal(headers.accept, "application/hal+json");
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
  assert.equal(headers["x-trace"], "Café: test");
  assert.equal(headers["x-empty"], "");
  assert.deepEqual(JSON.parse(body), { title: "argument" });

  await runHelper(base, ["POST", "/api/test", "--header", "X-Trace: stdin"], '{"title":"pipe"}');
  assert.equal(requests[4].headers["x-trace"], "stdin");
  assert.deepEqual(JSON.parse(requests[4].body), { title: "pipe" });

  const dir = await mkdtemp(path.join(tmpdir(), "kanbalone-helper-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "body.md");
  const markdown = "# Example\r\nMarkdown\n";
  await writeFile(file, markdown);
  await runHelper(base, [
    "PATCH", "/api/test", '{"title":"file"}', "--body-file", file, "--header", "X-Trace: markdown",
  ], "ignored stdin");
  assert.equal(requests[5].headers["x-trace"], "markdown");
  assert.deepEqual(JSON.parse(requests[5].body), { title: "file", bodyMarkdown: markdown });

  await runHelper(base, [
    "GET", "/api/redirect", "--header", "Authorization: Bearer example", "--header", "Content-Type: text/plain",
  ]);
  assert.equal(requests[6].headers.authorization, "Bearer example");
  assert.equal(requests[6].headers["content-type"], "text/plain");
  assert.equal(requests[7].headers.authorization, undefined);
  assert.equal(requests[7].headers.accept, "application/json");
});

test("API helper rejects malformed headers before sending a request and keeps their values out of diagnostics", async () => {
  const marker = "private-test-value";
  for (const header of [
    marker,
    `: ${marker}`,
    `X Bad: ${marker}`,
    `Authorization: ${marker}\r\nX-Folded: invalid`,
    `Authorization: ${marker}\n`,
    `Authorization: ${marker}\x1f`,
    `Authorization: ${marker}\x7f`,
    `Authorization: ${marker}\x85`,
    `Authorization: ${marker}漢`,
  ]) {
    await assert.rejects(runHelper("http://127.0.0.1:1", ["GET", "/api/test", "--header", header]), (error: {
      code: number; stdout: string; stderr: string;
    }) => {
      assert.equal(error.code, 2);
      assert.equal(error.stdout, "");
      assert.match(error.stderr, /argument --header:/);
      assert.doesNotMatch(error.stderr, /private-test-value/);
      return true;
    });
  }
});

test("API helper uses If-Match for the real Group delete precondition", async (t) => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const base = await app.listen({ port: 0, host: "127.0.0.1" });
  const board = await app.inject({ method: "POST", url: "/api/boards", payload: { name: "Group test" } });
  assert.equal(board.statusCode, 201, board.body);
  const group = await app.inject({
    method: "POST", url: `/api/boards/${board.json().board.id}/groups`, payload: { name: "Empty" },
  });
  assert.equal(group.statusCode, 201, group.body);
  const url = `/api/groups/${group.json().id}`;
  const before = await app.inject(url);
  const updated = await app.inject({
    method: "PATCH", url, payload: { name: "Renamed", expectedRevision: before.json().revision },
  });
  assert.equal(updated.statusCode, 200, updated.body);

  await assert.rejects(runHelper(base, ["DELETE", url]), { code: 1, stderr: /HTTP 428/ });
  await assert.rejects(runHelper(base, ["DELETE", url, "--header", `If-Match: ${before.headers.etag}`]), {
    code: 1, stderr: /HTTP 409.*\n.*STALE_GROUP/,
  });
  const current = await app.inject(url);
  assert.equal(current.statusCode, 200, current.body);
  assert.equal(current.json().name, "Renamed");
  assert.ok(current.headers.etag);
  assert.equal((await runHelper(base, ["DELETE", url, "--header", `If-Match: ${current.headers.etag}`])).stdout.trim(), "HTTP 204");
  assert.equal((await app.inject(url)).statusCode, 404);
});

test("Markdown file input preserves text, combines fields, and rejects ambiguous inputs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "kanbalone-helper-"));
  const file = path.join(dir, "body.md");
  const markdown = '# 作業\r\nC:\\example\\file "quoted"\n';
  await writeFile(file, markdown);
  const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('helper', sys.argv[1])
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
print(helper.read_body(sys.argv[3] if len(sys.argv) > 3 else None, sys.argv[2]).decode())
`;
  const run = (...args: string[]) => exec("python3", ["-c", script, helperPath, ...args]);
  try {
    assert.deepEqual(JSON.parse((await run(file, '{"title":"task","laneId":1}')).stdout), { title: "task", laneId: 1, bodyMarkdown: markdown });
    assert.deepEqual(JSON.parse((await run(file)).stdout), { bodyMarkdown: markdown });
    for (const fields of ['[]', '{"bodyMarkdown":"other"}', '{"appendMarkdown":"other"}', '{']) {
      await assert.rejects(run(file, fields));
    }
    await assert.rejects(run(path.join(dir, "missing.md")), /Cannot read Markdown file/);
    await writeFile(file, Buffer.from([0xff]));
    await assert.rejects(run(file), /Cannot read Markdown file/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
