import assert from 'node:assert/strict';

export async function openPicker(page, type) {
  const search = page.locator(`#ticket-${type}-search`);
  if (!await search.isVisible()) {
    await page.locator('#ticket-relation-add-button').click();
    await page.locator(`[data-relation-add-type="${type}"]`).click();
  }
  return search;
}

export async function captureSettled(page, path) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => ['finished', 'idle'].includes(animation.playState)));
  await page.evaluate(() =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path });
}

export function watchBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push({ kind: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console', text: message.text() });
  });
  return errors;
}

export async function waitForStartedServer(child) {
  const { createInterface } = await import('node:readline');
  const { once } = await import('node:events');
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    const result = await Promise.race([
      once(lines, 'line').then(([line]) => JSON.parse(line)),
      once(child, 'exit').then(([code]) => { throw Error(`Fixture server exited with code ${code}`); }),
    ]);
    assert(result.url?.startsWith('http://127.0.0.1:'), 'Use a private fixture server');
    return result;
  } finally {
    lines.close();
  }
}
