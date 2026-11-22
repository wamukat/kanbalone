import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { out, sha256, writeJson } from './config.mjs';

function compare(directory, before, after) {
  const beforePath = resolve(directory, before);
  const afterPath = resolve(directory, after);
  const identicalBytes = readFileSync(beforePath).equals(readFileSync(afterPath));
  const dimensions = (path) => execFileSync('magick', ['identify', '-format', '%w %h', path], {
    encoding: 'utf8',
  }).split(' ').map(Number);
  const [width, height] = dimensions(beforePath);
  assert.deepEqual(dimensions(afterPath), [width, height]);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let bounds = null;
  if (!identicalBytes) {
    const rgba = (path) => execFileSync('magick', [path, '-depth', '8', 'rgba:-'], {
      maxBuffer: width * height * 4 + 1024,
    });
    const a = rgba(beforePath);
    const b = rgba(afterPath);
    assert.equal(a.length, width * height * 4);
    assert.equal(b.length, a.length);
    for (let offset = 0; offset < a.length; offset += 4) {
      let delta = 0;
      for (let channel = 0; channel < 4; channel++) {
        delta = Math.max(delta, Math.abs(a[offset + channel] - b[offset + channel]));
      }
      if (delta === 0) continue;
      changedPixels++;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      const x = (offset / 4) % width;
      const y = Math.floor(offset / 4 / width);
      if (bounds === null) bounds = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return {
    before, after, width, height, identicalBytes, changedPixels, maxChannelDelta, bounds,
    beforeSha256: sha256(readFileSync(beforePath)), afterSha256: sha256(readFileSync(afterPath)),
  };
}

const pairs = [
  ...['1005', '10005'].map((count) => compare(out, `before-${count}.png`, `after-${count}.png`)),
  ...readdirSync(resolve(out, 'visual'))
    .filter((name) => name.includes('-before-') && name.endsWith('.png'))
    .map((name) => compare(resolve(out, 'visual'), name, name.replace('-before-', '-after-'))),
];
assert.equal(pairs.length, 26);
writeJson('image-comparison.json', pairs);
console.table(pairs.map(({ before, identicalBytes, changedPixels, maxChannelDelta }) => ({
  before, identicalBytes, changedPixels, maxChannelDelta,
})));
