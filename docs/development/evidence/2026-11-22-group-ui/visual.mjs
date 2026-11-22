import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import {
  createRuntime, createFixture, evidenceDir, longTagName, shortDescription, updatedDescription,
} from './fixture.mjs';

const [phase, filter = ''] = process.argv.slice(2);
assert(['before', 'after'].includes(phase), 'Specify before or after');
const candidate = phase === 'after';
const captureRoot = resolve(evidenceDir, 'captures');
const browser = await chromium.launch();
const resultsPath = resolve(evidenceDir, `${phase}-results.json`);
let records = {};
if (filter) {
  try { records = JSON.parse(readFileSync(resultsPath, 'utf8')).records; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const combo = ['en', 'ja'].flatMap(locale => ['light', 'dark'].flatMap(theme =>
  [1440, 390].map(width => ({ locale, theme, width }))));
const label = ({ locale, theme, width }) => `${locale}-${theme}-${width}`;
const cases = combo.filter(entry => !filter || label(entry).includes(filter));
assert(cases.length, 'No matching test cases');

async function verify(settings) {
  const { locale, theme, width } = settings;
  const key = label(settings);
  const context = await browser.newContext({
    viewport: { width, height: width === 1440 ? 900 : 844 },
    locale: locale === 'ja' ? 'ja-JP' : 'en-US',
    colorScheme: theme,
  });
  const runtime = await createRuntime(phase);
  try {
    const { url, api } = runtime;
    const f = await createFixture(runtime);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const boardUrl = `${url}/boards/${f.board.id}/group`;
    const action = name => page.locator(`[data-group-action="${name}"]`);
    const choice = g => page.locator(`[data-select-group="${g.id}"]`);
    const ticket = t => page.locator(`[data-group-ticket="${t.id}"]`);
    const row = t => page.locator('.group-ticket-row', { has: ticket(t) });
    const tags = t => row(t).locator('.tag');
    const heading = page.locator('.group-name');
    const form = page.locator('[data-group-form="description"]');
    const toolbarActions = [action('add'), action('new-ticket')];
    const archive = page.locator('.group-archive-toggle');
    const shortLink = page.locator('.group-description-body a');
    const previewLink = page.locator('.group-description-preview a');
    const checks = { browserVersion: browser.version(), apiVersion: (await api('GET', '/api/meta')).version };
    const center = loc => loc.evaluate(el => el.scrollIntoView({ block: 'center' }));
    const forCase = (localeValue, englishValue) => locale === 'ja' ? localeValue : englishValue;

    async function capture(issue, state, anchor) {
      if (anchor) await center(anchor);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getAnimations()
        .every(animation => ['finished', 'idle'].includes(animation.playState)));
      await page.evaluate(() =>
        new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const dir = resolve(captureRoot, String(issue));
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: resolve(dir, `${key}-${phase}-${state}.png`) });
    }
    async function load(reload = false) {
      if (reload) await page.reload();
      else await page.goto(boardUrl);
      await expect(heading).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      if (width === 390 && await page.locator('#sidebar-toggle-button').isVisible()) {
        await page.locator('#sidebar-toggle-button').click();
      }
    }
    async function select(g, keyboard = false) {
      if (!(await choice(g).isVisible())) await action('all').first().click();
      if (keyboard) await choice(g).press('Enter');
      else await choice(g).click();
      await expect(choice(g)).toHaveAttribute('aria-current', 'true');
      await expect(heading).toHaveText(g.name);
    }
    async function progress(g, resolved, total, open, archived) {
      const status = await api('GET', `/api/groups/${g.id}`);
      assert.equal(status.totalTicketCount, total);
      assert.equal(status.openTicketCount, open);
      assert.equal(status.archivedTicketCount, archived);
      const expectedCount = forCase(`未完了 ${open} 件 · 全 ${total} 件`, `${open} open · ${total} total`);
      await expect(choice(g)).toContainText(expectedCount);
      const meter = choice(g).locator('progress.group-choice-progress');
      const marker = choice(g).locator('.group-choice-completed');
      if (candidate) {
        assert.equal(status.resolvedTicketCount, resolved);
        await expect(meter).toHaveAttribute('max', String(Math.max(1, total)));
        await expect(meter).toHaveAttribute('value', String(resolved));
        await expect(marker).toHaveCount(total > 0 && resolved === total ? 1 : 0);
      } else {
        assert.equal(status.resolvedTicketCount, undefined);
        await expect(meter).toHaveCount(0);
        await expect(marker).toHaveCount(0);
      }
      return { open, total, archived, resolved: status.resolvedTicketCount ?? null, text: await choice(g).innerText() };
    }
    async function bounds() {
      return page.locator('#group-board').evaluate(el => {
        const rect = selector => {
          const { x, y, width, height } = el.querySelector(selector).getBoundingClientRect();
          return { x, y: y + el.scrollTop, width, height };
        };
        const control = ['.group-sort-buttons', '.group-add-button', '[data-group-action="add"]',
          '[data-group-action="new-ticket"]'];
        return {
          documentWidth: document.documentElement.scrollWidth,
          boardOverflow: el.scrollWidth - el.clientWidth,
          controls: Object.fromEntries(control.map(selector => [selector, rect(selector)])),
        };
      });
    }
    function assertFits({ documentWidth, boardOverflow }) {
      assert(documentWidth <= width, `Document width ${documentWidth} exceeds ${width}`);
      assert(boardOverflow <= 1, `Group horizontal overflow ${boardOverflow}`);
    }
    async function inspectTags(t, stored, names) {
      const expected = stored.tags.map(tag => tag.name).sort();
      assert.deepEqual(expected, [...names].sort());
      if (candidate) {
        await expect(tags(t)).toHaveCount(names.length);
        const badges = await tags(t).evaluateAll(elements => elements.map(el => {
          const rect = el.getBoundingClientRect();
          const row = el.closest('.group-ticket-row');
          const bounds = row.getBoundingClientRect();
          return {
            title: el.title,
            fullAccessibleLabel: el.querySelector('.visually-hidden')?.textContent,
            displayedLabel: el.querySelector('[aria-hidden="true"]')?.textContent,
            color: getComputedStyle(el).color,
            background: getComputedStyle(el).backgroundColor,
            noColor: el.classList.contains('tag-no-color'),
            inside: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
            interactive: el.matches('a,button,input,[tabindex], [role="button"]'),
          };
        }));
        assert.deepEqual(badges.map(badge => badge.title).sort(), expected);
        assert(badges.every(badge => badge.inside && !badge.interactive));
        assert(badges.every(badge => badge.fullAccessibleLabel === badge.title));
        assert(badges.every(badge => badge.noColor === !stored.tags.find(tag => tag.name === badge.title).color));
        const longBadge = badges.find(badge => badge.title === longTagName);
        if (longBadge) assert(longBadge.displayedLabel.endsWith('...'));
        return badges;
      }
      await expect(tags(t)).toHaveCount(0);
      return [];
    }
    async function inspectLink(loc) {
      await expect(loc).toBeVisible();
      await center(loc);
      await page.mouse.move(0, 0);
      const style = (el) => {
        const css = getComputedStyle(el);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        const hover = getComputedStyle(document.documentElement).getPropertyValue('--accent-hover').trim();
        const normalize = color => {
          const channels = color.slice(1).match(/../g).map(x => Number.parseInt(x, 16));
          return `rgb(${channels.join(', ')})`;
        };
        return {
          color: css.color, token: normalize(accent), hoverToken: normalize(hover),
          decoration: css.textDecorationLine, outline: css.outlineStyle, outlineColor: css.outlineColor,
          focusVisible: el.matches(':focus-visible'),
        };
      };
      const normal = await loc.evaluate(style);
      await loc.hover();
      const hovered = await loc.evaluate(style);
      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab');
      await loc.focus(); // Focus the same known link in each view, retaining keyboard modality.
      const focused = await loc.evaluate(style);
      await expect(loc).toBeFocused();
      if (candidate) {
        assert.equal(normal.color, normal.token);
        assert.equal(hovered.color, normal.hoverToken);
        assert.equal(focused.focusVisible, true);
        assert.notEqual(focused.outline, 'none');
      }
      return { normal, hovered, focused, href: await loc.getAttribute('href') };
    }
    async function editTicket(t, edit) {
      await ticket(t).click();
      await page.locator('#header-edit-button').click();
      await edit();
      const patch = page.waitForResponse(response =>
        response.url().endsWith(`/api/tickets/${t.id}`) && response.request().method() === 'PATCH');
      await page.locator('#save-ticket-button').click();
      assert.equal((await patch).status(), 200);
      await expect(page.locator('#ticket-view')).toBeVisible();
      await expect(page.locator('#editor-form')).toHaveJSProperty('inert', false);
      await page.locator('#ticket-view [data-ticket-group]').click();
      await expect(page.locator('#editor-dialog')).not.toHaveJSProperty('open', true);
      return api('GET', `/api/tickets/${t.id}`);
    }

    await load();
    await expect(choice(f.completed)).toHaveCount(0);
    await expect(choice(f.archived)).toHaveCount(0);
    await action('all').first().click();
    await select(f.mixed, true);
    checks.groups = {
      mixed: await progress(f.mixed, 2, 5, 2, 2),
      empty: await progress(f.empty, 0, 0, 0, 0),
      open: await progress(f.open, 0, 1, 1, 0),
      completed: await progress(f.completed, 1, 1, 0, 0),
      archivedOpen: await progress(f.archived, 0, 1, 0, 1),
    };
    checks.controls = await bounds();
    assertFits(checks.controls);
    await capture(1520, 'all-groups', action('all').first());
    const position = await Promise.all(toolbarActions.map(loc => loc.boundingBox()));
    await archive.click();
    await expect(archive).toHaveAttribute('aria-expanded', 'true');
    await expect(ticket(f.archivedOpen)).toBeVisible();
    await expect(ticket(f.archivedDone)).toBeVisible();
    await progress(f.mixed, 2, 5, 2, 2);
    await archive.click();
    await expect(archive).toHaveAttribute('aria-expanded', 'false');
    await expect(ticket(f.archivedOpen)).toHaveCount(0);
    // Compare page-space geometry with the same scroll offset.
    await center(action('all').first());
    const afterArchive = await bounds();
    assert.deepEqual(afterArchive.controls, checks.controls.controls);
    assert(position.every(Boolean));
    checks.archiveToggle = { progressUnchanged: true, controlsUnchanged: true };

    checks.tagsInitial = {
      parent: await inspectTags(f.parent, await api('GET', `/api/tickets/${f.parent.id}`), [f.colored.name, f.neutral.name, longTagName]),
      child: await inspectTags(f.child, await api('GET', `/api/tickets/${f.child.id}`), [longTagName, f.extra.name]),
    };
    const laneX = await page.locator('.group-ticket-meta').evaluateAll(es => es.map(el => el.getBoundingClientRect().left));
    assert(Math.max(...laneX) - Math.min(...laneX) <= 1, 'Lane metadata columns lost alignment');
    await capture(1521, 'parent-and-child', ticket(f.parent));

    checks.shortLink = await inspectLink(shortLink);
    assert.equal(checks.shortLink.href, 'https://example.com/guide');
    await shortLink.blur();
    await capture(1522, 'short-description', shortLink);

    await select(f.open, true);
    await expect(shortLink).toHaveCount(0);
    await action('expand-description').click();
    checks.expandedLink = await inspectLink(shortLink);
    assert.equal(checks.expandedLink.href, 'https://example.com/handoff');
    await shortLink.blur();
    await capture(1522, 'expanded-description', shortLink);
    await action('expand-description').click();
    await expect(shortLink).toHaveCount(0);

    await select(f.mixed);
    await action('edit-description').click();
    await form.locator('textarea').fill(updatedDescription);
    await action('preview-description').click();
    checks.previewLink = await inspectLink(previewLink);
    assert.equal(await previewLink.textContent(), 'updated release guide');
    await previewLink.blur();
    await capture(1522, 'editor-preview', previewLink);
    await action('cancel-description').click();
    const cancelled = await api('GET', `/api/groups/${f.mixed.id}`);
    assert.equal(cancelled.descriptionMarkdown, shortDescription);
    await expect(shortLink).toHaveText('release guide');
    await action('edit-description').click();
    await form.locator('textarea').fill(updatedDescription);
    await form.locator('button[type="submit"]').click();
    await expect(shortLink).toHaveText('updated release guide');
    const saved = await api('GET', `/api/groups/${f.mixed.id}`);
    assert.equal(saved.descriptionMarkdown, updatedDescription);
    assert.equal(saved.revision, cancelled.revision + 1);
    await load(true);
    await select(f.mixed);
    await expect(shortLink).toHaveText('updated release guide');
    if (key === 'en-light-1440') await capture(1522, 'saved-and-reloaded', shortLink);
    checks.description = { cancelled: cancelled.descriptionMarkdown, saved: saved.descriptionMarkdown, reloaded: true };

    // Reach a fully completed group through the ticket editor, then reopen the only ticket.
    await select(f.open);
    let stored = await editTicket(f.milestone, () => page.locator('#ticket-lane').selectOption(String(f.done.id)));
    assert.equal(stored.isResolved, true);
    if (!(await choice(f.open).isVisible())) await action('all').first().click();
    await select(f.open);
    checks.completed = await progress(f.open, 1, 1, 0, 0);
    if (key === 'en-light-1440') await capture(1520, 'completed', action('all').first());
    await load(true);
    await select(f.open);
    await progress(f.open, 1, 1, 0, 0);
    stored = await editTicket(f.milestone, () => page.locator('#ticket-lane').selectOption(String(f.todo.id)));
    assert.equal(stored.isResolved, false);
    await select(f.open);
    checks.reopened = await progress(f.open, 0, 1, 1, 0);
    if (key === 'en-light-1440') await capture(1520, 'reopened', action('all').first());
    await load(true);
    await select(f.open);
    await progress(f.open, 0, 1, 1, 0);

    // Edit membership through the ticket editor, then exercise shared sidebar tag management.
    await select(f.mixed);
    stored = await editTicket(f.parent, async () => {
      await expect(page.locator('#ticket-tag-summary')).toContainText(f.neutral.name);
      const search = page.locator('#ticket-tag-search');
      await search.focus();
      await search.pressSequentially(f.extra.name);
      await search.press('Enter');
      await expect(page.locator('#ticket-tag-summary [data-remove-tag-id]')).toHaveCount(4);
      await expect(page.locator(`#ticket-tag-summary [data-remove-tag-id="${f.neutral.id}"]`)).toBeVisible();
    });
    checks.ticketTagAdded = await inspectTags(f.parent, stored, [f.colored.name, f.neutral.name, f.long.name, f.extra.name]);
    if (await page.locator('#sidebar-reopen-button').isVisible()) await page.locator('#sidebar-reopen-button').click();
    const tagButton = name => page.locator('#sidebar-tag-list .sidebar-tag-badge', { hasText: name });
    await tagButton(f.colored.name).click();
    const tagForm = page.locator('[data-sidebar-tag-edit-form]');
    const renamed = 'visual review';
    await tagForm.locator('[data-sidebar-tag-name]').fill(renamed);
    await tagForm.locator('[data-field-id="color"]').fill('#336699');
    const patch = page.waitForResponse(response =>
      response.url().endsWith(`/api/tags/${f.colored.id}`) && response.request().method() === 'PATCH');
    await tagForm.locator('button[type="submit"]').click();
    assert.equal((await patch).status(), 200);
    await expect(tagButton(renamed)).toBeVisible();
    if (candidate) await expect(tags(f.parent).filter({ hasText: renamed })).toBeVisible();
    stored = await api('GET', `/api/tickets/${f.parent.id}`);
    assert.equal(stored.tags.find(tag => tag.id === f.colored.id).color.toLowerCase(), '#336699');
    checks.renamed = await inspectTags(f.parent, stored, [renamed, f.neutral.name, f.long.name, f.extra.name]);
    if (key === 'en-light-1440') await capture(1521, 'renamed-and-recolored', ticket(f.parent));

    await tagButton(renamed).click();
    await tagForm.locator('[data-sidebar-tag-delete]').click();
    const deletion = page.waitForResponse(response =>
      response.url().endsWith(`/api/tags/${f.colored.id}`) && response.request().method() === 'DELETE');
    await tagForm.locator('[data-sidebar-tag-delete-confirm]').click();
    assert.equal((await deletion).status(), 204);
    await expect(tagButton(renamed)).toHaveCount(0);
    stored = await api('GET', `/api/tickets/${f.parent.id}`);
    checks.removed = await inspectTags(f.parent, stored, [f.neutral.name, f.long.name, f.extra.name]);
    await load(true);
    await select(f.mixed);
    await inspectTags(f.parent, stored, [f.neutral.name, f.long.name, f.extra.name]);
    if (key === 'en-light-1440') await capture(1521, 'removed-and-reloaded', ticket(f.parent));
    assertFits(await bounds());
    checks.tagsReloaded = true;
    checks.errors = errors;
    assert.deepEqual(errors, []);
    return checks;
  } finally {
    await context.close();
    await runtime.close();
  }
}

try {
  for (const settings of cases) {
    const key = label(settings);
    records[key] = await verify(settings);
    writeFileSync(resultsPath, JSON.stringify({ phase, records }, null, 2) + '\n');
    console.log(`${phase} ${key} PASS`);
  }
} finally {
  await browser.close();
}
