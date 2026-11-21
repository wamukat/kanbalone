import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("Japanese UI catalogs preserve interpolation parameters and agree on shared labels", async () => {
  const directory = path.join(process.cwd(), "public/locales");
  const files = fs.readdirSync(directory).filter(name => /^ja.*\.js$/.test(name));
  assert.ok(files.length > 0, "Japanese catalogs must exist");
  const seen = new Map<string, { value: string; file: string }>();
  const parameters = (value: string) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
  for (const file of files) {
    const catalog: Record<string, string> = (await import(pathToFileURL(path.join(directory, file)).href)).default;
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, "string", `${file}: ${key}`);
      assert.ok(value.trim(), `${file}: empty translation for ${key}`);
      assert.deepEqual(parameters(value), parameters(key), `${file}: interpolation mismatch for ${key}`);
      const existing = seen.get(key);
      if (existing) assert.equal(value, existing.value, `${file} and ${existing.file} disagree on ${key}`);
      seen.set(key, { value, file });
    }
  }
});

test("every explicit static UI translation has a Japanese catalog entry", async () => {
  const directory = path.join(process.cwd(), "public");
  const keys = new Set<string>();
  for (const file of fs.readdirSync(path.join(directory, "locales")).filter(name => /^ja.*\.js$/.test(name))) {
    const catalog = (await import(pathToFileURL(path.join(directory, "locales", file)).href)).default;
    Object.keys(catalog).forEach(key => keys.add(key));
  }
  const missing: string[] = [];
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    // UI source uses JSON-compatible double-quoted keys. Dynamic keys are
    // exercised by view tests, rather than inferred from arbitrary code here.
    for (const match of source.matchAll(/\b(?:t|tr)\(("(?:[^"\\]|\\.)*")/g)) {
      const key = JSON.parse(match[1]);
      if (!keys.has(key)) missing.push(`${file}: ${key}`);
    }
  }
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  for (const match of html.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([^"]*)"/g)) {
    const key = match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    if (!keys.has(key)) missing.push(`index.html: ${key}`);
  }
  assert.deepEqual(missing, [], "Missing translations must not silently fall back to English in Japanese UI");
});
