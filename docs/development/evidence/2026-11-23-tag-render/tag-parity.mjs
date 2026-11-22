import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baselinePath = process.argv[2];
const candidatePath = process.argv[3];
const before = await import(pathToFileURL(baselinePath));
const after = await import(pathToFileURL(candidatePath));
const values = [
  '', 'x', 'engineering', 'a'.repeat(27), 'a'.repeat(28), 'a'.repeat(29), 'x\r\ny',
  '保守と運用', '新しい取り組みに向けた合意形成と運用改善について継続的に検討する',
  'café', 'cafe\u0301', '<alpha & "beta">', '👩🏽‍💻', '👨‍👩‍👧‍👦family', '🇯🇵🇺🇸flag',
  '🏷️'.repeat(20), '👩🏽‍💻'.repeat(29), '🧪'.repeat(14), '🧪'.repeat(15),
  'a\u0301'.repeat(27), 'a\u0301'.repeat(28), 'a\u0301'.repeat(29),
  'ภาษาไทยเพื่อการทดสอบป้ายกำกับ', '\ud83d', '\ude00',
];
const limits = [undefined, -1, 0, 1, 2, 3, 4, 8, 27, 28, 29, 80, Infinity, NaN];
const colors = [undefined, null, '', '#557766', '#eeeeee', '#37aa35'];
const original = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
const records = [];
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
for (const useIntl of [true, false]) {
  try {
    if (!useIntl) Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
    let comparisons = 0;
    for (const value of values) {
      for (const maxLength of limits) {
        for (const color of colors) {
          const opts = maxLength === undefined ? {} : { maxLength };
          const tag = { name: value, color };
          assert.deepEqual(after.formatTagLabel(tag, opts), before.formatTagLabel(tag, opts));
          assert.equal(after.renderTag(tag, escape, opts), before.renderTag(tag, escape, opts));
          comparisons += 2;
        }
      }
    }
    records.push({ useIntl, comparisons });
  } finally {
    Object.defineProperty(Intl, 'Segmenter', original);
  }
}
const output = path.resolve(process.env.KANBALONE_RENDER_OUTPUT ?? 'coverage/tag-render-perf');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'tag-parity.json'), JSON.stringify({
  node: process.version, baselinePath, candidatePath, records, nameExamples: values.length, limits: limits.length, colors: colors.length,
}, null, 2) + '\n');
console.log(records);
