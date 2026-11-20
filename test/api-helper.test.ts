import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

test("API helper sends JSON content type only with a body", async () => {
  const requests: Array<{ method?: string; contentType?: string; body: string }> = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, contentType: request.headers["content-type"], body });
    response.setHeader("content-type", "application/json");
    response.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    for (const [method, body] of [["GET", ""], ["DELETE", ""], ["POST", '{"bodyMarkdown":"hello"}']]) {
      const child = spawn("python3", [path.resolve("skills/kanbalone-api/scripts/kanbalone_api.py"), "--base", `http://127.0.0.1:${address.port}`, method, "/api/test"]);
      let error = "";
      child.stderr.on("data", (chunk) => { error += chunk; });
      child.stdout.resume();
      const finished = new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
      child.stdin.end(body);
      assert.equal(await finished, 0, error);
    }
    assert.deepEqual(requests.slice(0, 2), [
      { method: "GET", contentType: undefined, body: "" },
      { method: "DELETE", contentType: undefined, body: "" },
    ]);
    assert.equal(requests[2].contentType, "application/json");
    assert.deepEqual(JSON.parse(requests[2].body), { bodyMarkdown: "hello" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Markdown file input preserves text, combines fields, and rejects ambiguous inputs", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
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
  const run = (...args: string[]) => promisify(execFile)("python3", ["-c", script, path.resolve("skills/kanbalone-api/scripts/kanbalone_api.py"), ...args]);
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
