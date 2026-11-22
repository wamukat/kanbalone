import { readFileSync } from 'node:fs';

function stats(values, multiplier = 1) {
  const sorted = values.filter((value) => Number.isFinite(value)).map((value) => value * multiplier).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { median: round(median), min: round(sorted[0]), max: round(sorted.at(-1)) };
}
function round(value) { return Number(value.toFixed(2)); }
for (const file of process.argv.slice(2)) {
  const { provenance, samples } = JSON.parse(readFileSync(file));
  const keys = [...new Set(samples.map((sample) => sample.fixture + '|' + sample.variant))];
  for (const key of keys) {
    const matching = samples.filter((sample) => sample.fixture + '|' + sample.variant === key);
    const filtered = provenance.diagnostics ? matching : matching.filter((sample) => !sample.warmup);
    if (!filtered.length) continue;
    const get = (key, selector, multiplier = 1) => [key, stats(filtered.map(selector), multiplier)];
    const metrics = Object.fromEntries([
      get('first', (s) => s.timing.first),
      get('allLanesFirst', (s) => Object.keys(s.timing.lanes).length ? Math.max(...Object.values(s.timing.lanes).map((lane) => lane.first)) : undefined),
      get('complete', (s) => s.timing.complete),
      get('afterResponse', (s) => s.ticketTiming.elapsedAfterLastResponse),
      get('lastResponse', (s) => s.ticketTiming.responseEnd),
      get('collection', (s) => s.ticketTiming.collectionSpan),
      get('server', (s) => s.ticketTiming.cumulativeServerMs),
      get('task', (s) => s.metrics.TaskDuration, 1000),
      get('script', (s) => s.metrics.ScriptDuration, 1000),
      get('style', (s) => s.metrics.RecalcStyleDuration, 1000),
      get('layout', (s) => s.metrics.LayoutDuration, 1000),
      get('maxLongTask', (s) => Math.max(0, ...s.timing.longTasks.map(({ duration }) => duration))),
    ]);
    const diagnostics = provenance.diagnostics ? Object.fromEntries(
      [...new Set(filtered.flatMap((s) => s.marks.map((mark) => mark.name)))].map((name) =>
        get(name, (s) => s.marks.filter((mark) => mark.name === name &&
          (name === 'kanbalone-response-json-await' ? /\/tickets\?/.test(mark.detail) : mark.detail > 0)
        ).reduce((sum, mark) => sum + mark.duration, 0)),
      ),
    ) : undefined;
    const parseReplay = provenance.diagnostics ? stats(filtered.flatMap((s) =>
      s.parseReplay.filter((replay) => !replay.warmup).map((replay) => replay.duration)
    )) : undefined;
    const list = (key) => [...new Set(filtered.map((s) => s[key]))];
    console.log(JSON.stringify({
      file, fixture: key, runs: filtered.length, metrics, diagnostics, parseReplay,
      pages: [...new Set(filtered.map((s) => s.ticketTiming.count))],
      bytes: [...new Set(filtered.map((s) => s.ticketTiming.decodedBodyBytes))],
      counts: { cardsOrRows: list('size'), nodes: list('rowElementCount'), useElements: list('useCount') },
      scrollHeights: filtered[0].scrollHeights,
      parity: { id: list('idHash'), geometry: list('geometryHash'), tags: list('tagMarkupHash') },
    }));
  }
}
