import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const { nodes, samples, timeDeltas } = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parent = new Map(nodes.flatMap((node) => (node.children ?? []).map((child) => [child, node.id])));
  const self = new Map();
  const inclusive = new Map();
  function label(id) {
    const { callFrame: frame } = byId.get(id);
    return (frame.functionName || '(anonymous)') + (frame.url ? ' ' + new URL(frame.url).pathname.split('/').at(-1) + ':' + (frame.lineNumber + 1) : '');
  }
  for (const [index, id] of samples.entries()) {
    const delta = timeDeltas[index] / 1000;
    const leaf = label(id);
    self.set(leaf, (self.get(leaf) ?? 0) + delta);
    const ancestry = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) ancestry.add(label(cur));
    for (const frame of ancestry) inclusive.set(frame, (inclusive.get(frame) ?? 0) + delta);
  }
  const ranked = (values) => [...values].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, ms]) => [name, Number(ms.toFixed(1))]);
  console.log(JSON.stringify({ file, self: ranked(self), inclusive: ranked(inclusive) }));
}
