import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("the stylesheet check reports missing tokens in the shipped import graph", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "kanbalone-css-tokens-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name: string, contents: string) => writeFileSync(path.join(directory, name), contents);
  const run = () => spawnSync(process.execPath, [
    path.resolve("scripts/check-css-tokens.mjs"), path.join(directory, "styles.css"),
  ], { encoding: "utf8" });

  write("styles.css", '@import url("./base.css"); @import "./view.css";');
  write("base.css", ":root { --surface: white }");
  write("unused.css", ".unused { border-color: var(--outside-the-bundle) }");
  write("view.css", [
    '@property --registered { syntax: "<color>"; inherits: true; initial-value: black; }',
    ".panel { --scoped: var(--surface); color: var(--scoped); border-color: var(--registered) }",
    ".panel { background: var(--optional, var(--surface)); height: var(--shared-toolbar-height) }",
    '.label::after { content: "var(--literal)"; /* var(--comment) */ }',
    ".panel { border-color: var(--registered, var(--unused)) }",
    '.icon { background-image: url("data:image/svg+xml,var(--inside-url)") }',
  ].join("\n"));
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);

  write("base.css", ":root { --renamed: white }");
  const removed = run();
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /view\.css:2: undefined CSS token --surface/);
  assert.match(removed.stderr, /view\.css:3: undefined CSS token --surface/);

  write("view.css", ".panel { border: 1px solid color-mix(in srgb, var(--typo) 68%, transparent) }");
  const typo = run();
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /view\.css:1: undefined CSS token --typo/);

  write("view.css", String.raw`.panel { color: v\61 r(--escaped-missing) }`);
  const escaped = run();
  assert.equal(escaped.status, 1);
  assert.match(escaped.stderr, /view\.css:1: undefined CSS token --escaped-missing/);
});
