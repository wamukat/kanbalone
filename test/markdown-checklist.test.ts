import test from "node:test";
import assert from "node:assert/strict";
import { markdownTaskOffsets } from "../src/markdown-checklist.js";
import { renderMarkdown } from "../src/markdown.js";

test("editable task offsets follow real Markdown tasks, not code or raw HTML", () => {
  const body = ["日本語😀", "", "```md", "- [ ] duplicate", "```", "", "- [ ] duplicate", "  - [X] nested", "", "> - [ ] quoted", "", "1. [x] ordered", "", "End of list.", "", "    - [ ] code", "", '<span class="task-checkbox" data-task-offset="3">fake</span>'].join("\r\n");
  const offsets = markdownTaskOffsets(body);
  assert.deepEqual(offsets.map(offset => body.slice(offset - 1, offset + 2)), ["[ ]", "[X]", "[ ]", "[x]"]);
  assert.equal(offsets[0], body.indexOf("- [ ] duplicate", body.indexOf("```", body.indexOf("```") + 3)) + 3);
  const html = renderMarkdown(body, undefined, true);
  assert.deepEqual([...html.matchAll(/data-task-offset="(\d+)"/g)].map(match => Number(match[1])), offsets);
  assert.doesNotMatch(html, /kanbalone-|<input|data-task-offset="3"/);
  assert.equal(html.replace(/ data-task-offset="\d+"/g, ""), renderMarkdown(body));
});

test("task offsets preserve duplicate, nested, loose, quoted and empty items", () => {
  for (const body of ["- [ ] same\n- [x] same", "- [ ] outer\n  - [ ] inner\n- [ ] last", "> - [ ] quoted\n>   - [x] nested", "- [ ] first\n\n  paragraph\n\n- [x] second", "- [ ] <b>inline</b>"]) {
    const offsets = markdownTaskOffsets(body);
    assert.ok(offsets.length > 0, body);
    assert.ok(offsets.every(offset => offset >= 0), body);
    const html = renderMarkdown(body, undefined, true);
    assert.equal((html.match(/data-task-offset/g) || []).length, offsets.length, body);
    assert.equal(html.replace(/ data-task-offset="\d+"/g, ""), renderMarkdown(body), body);
    for (const offset of offsets) {
      const next = body.slice(0, offset) + (body[offset] === " " ? "x" : " ") + body.slice(offset + 1);
      assert.equal(next.length, body.length);
      assert.equal([...next].filter((char, index) => char !== [...body][index]).length, 1);
    }
  }
});

test("empty markers that Marked treats as ordinary text stay read only", () => {
  assert.deepEqual(markdownTaskOffsets("- [ ] \n- [x] "), []);
});
