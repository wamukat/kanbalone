import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { baseline, createRuntime, dispatchImage, localText, seed } from './fixture.mjs';

const exec = promisify(execFile);
const agentBrowser = process.env.KANBALONE_IMAGE_EVIDENCE_BROWSER ?? 'agent-browser';
const evidence = dirname(fileURLToPath(import.meta.url));
const [phase, filter] = process.argv.slice(2);
assert(['before', 'after', 'final-after'].includes(phase), 'Specify before, after, or final-after');
const candidate = phase === 'after' || phase === 'final-after';
const cases = [
  { locale: 'ja', theme: 'light', width: 1440, height: 900 },
  { locale: 'en', theme: 'light', width: 1440, height: 900 },
  { locale: 'ja', theme: 'dark', width: 390, height: 844 },
  { locale: 'en', theme: 'dark', width: 390, height: 844 },
];
const settingKey = ({ locale, theme, width }) => `${locale}-${theme}-${width}`;
const selected = cases.filter(setting => (phase !== 'final-after' || setting.width === 390)
  && (!filter || new RegExp(filter).test(settingKey(setting))));
assert(selected.length, 'The filter matched no settings');
const captures = resolve(evidence, 'captures');
mkdirSync(captures, { recursive: true });
const resultsFile = resolve(evidence, `${phase}-results.json`);
const results = await Promise.allSettled(selected.map(record));
const records = filter ? readRecords() : {};
for (const [index, result] of results.entries()) {
  const key = settingKey(selected[index]);
  if (result.status === 'fulfilled') records[key] = result.value;
  else console.error(`[${key}] ${result.reason.stack}`);
}
writeFileSync(resultsFile, JSON.stringify({ phase, baseline, node: process.version, records }, null, 2) + '\n');
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;

function readRecords() {
  try {
    return JSON.parse(readFileSync(resultsFile, 'utf8')).records;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {};
  }
}

async function record(settings) {
  const { locale, theme, width, height } = settings;
  const key = settingKey(settings);
  const session = `attachment-${process.pid}-${phase}-${key}`;
  const runtime = await createRuntime(candidate ? 'after' : 'before');
  const { origin, uploads, json } = runtime;
  const text = localText(locale);
  const observations = {};
  const captureFiles = [];
  const js = value => JSON.stringify(value);
  const browser = async (...args) => {
    try {
      const { stdout } = await exec(agentBrowser, ['--session', session, '--json', ...args], { timeout: 45000 });
      const result = JSON.parse(stdout);
      assert(result.success, result.error);
      return result.data;
    } catch (error) {
      throw new Error(`${args[0]} ${args[1]?.slice(0, 180) ?? ''}: ${error.stdout || error.message}`, { cause: error });
    }
  };
  const evaluate = async source => (await browser('eval', source)).result;
  const wait = condition => browser('wait', '--fn', condition);
  const existence = selector => `!!document.querySelector(${js(selector)})?.getClientRects().length`;
  const visible = selector => wait(existence(selector));
  const scroll = selector => evaluate(`document.querySelector(${js(selector)}).scrollIntoView({block:'center',inline:'nearest'})`);
  const click = selector => browser('click', selector);
  const value = selector => evaluate(`document.querySelector(${js(selector)}).value`);
  const go = path => browser('open', origin + path);

  async function screenshot(state, anchor) {
    if (anchor) await scroll(anchor);
    await evaluate(`(async () => {
      await document.fonts.ready;
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    })()`);
    const name = `${phase}-${key}-${state}.png`;
    await browser('screenshot', resolve(captures, name));
    captureFiles.push(name);
  }

  async function activate(selector, next, markdown) {
    await visible(selector);
    await click(selector);
    await visible(next);
    if (markdown !== undefined) await browser('fill', next, markdown);
  }

  const storedComment = async (ticketId, commentId) => (await json('GET', `/api/tickets/${ticketId}/comments`))
    .comments.find(comment => comment.id === commentId);
  const ticketBody = async ticketId => (await json('GET', `/api/tickets/${ticketId}`)).bodyMarkdown;

  async function imageInput(name, selector, operation, original) {
    assert.equal(await value(selector), original);
    const count = uploads.length;
    const file = await evaluate(`(${dispatchImage.toString()})(${js(selector)}, ${js(operation)}, ${js(name)})`);
    if (candidate) {
      await wait(`document.querySelector(${js(selector)})?.value.includes(${js(file.name)})`);
      assert.equal(file.consumed, true);
      assert.equal(uploads.length, count + 1);
      assert.deepEqual(uploads.at(-1), { status: 201, contentType: 'image/png' });
    } else {
      assert.equal(file.consumed, false);
      assert.equal(uploads.length, count);
    }
    const markdown = await value(selector);
    const attachment = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].at(-1)?.[1] ?? null;
    let asset = null;
    if (candidate) {
      assert(attachment?.startsWith('/api/attachments/'), markdown);
      assert(markdown.startsWith(original));
      const response = await fetch(origin + attachment);
      const content = Buffer.from(await response.arrayBuffer());
      asset = { status: response.status, contentType: response.headers.get('content-type'),
        bytes: content.length, hash: createHash('sha256').update(content).digest('hex') };
      assert.deepEqual(asset, { status: 200, contentType: 'image/png', bytes: file.bytes, hash: file.hash });
    } else {
      assert.equal(markdown, original);
      assert.equal(attachment, null);
    }
    observations[name] = { operation, original, file, markdown, attachment, asset };
    await screenshot(name, selector);
    return observations[name];
  }

  async function verifyImage(record, view, state, takeShot = false) {
    await visible(view);
    const img = `${view} img`;
    if (candidate) {
      await wait(`(() => {
        const image = document.querySelector(${js(img)});
        return image?.complete && image.naturalWidth > 0;
      })()`);
      record.reloaded = await evaluate(`(() => {
        const image = document.querySelector(${js(img)});
        const { left, right, width, height } = image.getBoundingClientRect();
        const parent = image.closest(${js(view)}).getBoundingClientRect();
        return { src: image.getAttribute('src'), alt: image.alt,
          width: image.naturalWidth, height: image.naturalHeight,
          renderedWidth: width, renderedHeight: height, left, right,
          containerLeft: parent.left, containerRight: parent.right,
          documentWidth: document.documentElement.scrollWidth };
      })()`);
      assert.equal(record.reloaded.src, record.attachment);
      assert.equal(record.reloaded.width, 560);
      assert.equal(record.reloaded.height, 132);
      const { left, right, containerLeft, containerRight } = record.reloaded;
      assert(left >= Math.max(0, containerLeft) - 1 && right <= Math.min(width, containerRight) + 1,
        `Image exceeds the visible container: ${JSON.stringify(record.reloaded)}`);
      if (takeShot) await screenshot(`${state}-reloaded`, img);
    } else {
      record.reloaded = await evaluate(`document.querySelectorAll(${js(img)}).length`);
      assert.equal(record.reloaded, 0);
      if (takeShot) await screenshot(`${state}-reloaded`, view);
    }
  }

  const primary = locale === 'ja' ? 'drop' : 'paste';
  const secondary = locale === 'ja' ? 'paste' : 'drop';
  const showReload = key === 'ja-light-1440' || key === 'en-dark-390';
  try {
    const { board, lane, ticket, comment } = await seed(runtime, text);
    const boardPath = `/boards/${board.id}`;
    const ticketPath = `/tickets/${ticket.id}`;
    const detail = '#ticket-view-body';
    const body = '#ticket-body';
    const inlineBody = '[data-detail-body-input]';
    const newComment = '#comment-body';
    const editComment = '[data-comment-edit-body]';
    const commentRow = `[data-comment-id="${comment.id}"]`;
    const commentView = id => `[data-comment-id="${id}"] .comment-display`;
    const newButton = `.lane[data-lane-id="${lane.id}"] .add-ticket-button`;
    const { version } = await json('GET', '/api/meta');

    await go(boardPath);
    await browser('set', 'viewport', String(width), String(height), '1');
    await browser('set', 'media', theme);
    await evaluate(`localStorage.setItem('kanbalone:language', ${js(locale)})`);
    await browser('reload');
    await wait(`document.documentElement.lang === ${js(locale)} && matchMedia('(prefers-color-scheme: ${theme})').matches`);
    const browserSettings = await evaluate(`({ userAgent: navigator.userAgent, locale: document.documentElement.lang,
      width: innerWidth, height: innerHeight, scale: devicePixelRatio })`);
    assert.deepEqual([browserSettings.width, browserSettings.height, browserSettings.scale], [width, height, 1]);

    await activate(newButton, body);
    await browser('fill', '#ticket-title', text.newTicket);
    await browser('fill', body, text.newBody);
    if (phase === 'final-after') {
      const status = '#ticket-body + .image-attachment-feedback [data-image-upload-status]';
      const save = '#save-ticket-button';
      const positions = async () => evaluate(`(() => {
        const bounds = selector => {
          const { left, top, width, height } = document.querySelector(selector).getBoundingClientRect();
          return { left, top, width, height };
        };
        return { save: bounds(${js(save)}), body: bounds(${js(body)}) };
      })()`);
      await scroll(body);
      const initial = await positions();
      assert.equal(await value(body), text.newBody);
      const releaseUpload = runtime.holdUpload();
      let file, pending, label;
      try {
        file = await evaluate(`(${dispatchImage.toString()})(${js(body)}, ${js(primary)}, 'ticket-creation')`);
        await wait(`document.querySelector(${js(status)})?.dataset.kind === 'saving'`);
        pending = await positions();
        label = await evaluate(`document.querySelector(${js(status)}).textContent.trim()`);
        assert.deepEqual(pending, initial);
        assert.equal(await value(body), text.newBody);
        assert.equal(uploads.length, 0);
        await screenshot('ticket-creation-uploading');
      } finally {
        releaseUpload();
      }
      await wait(`document.querySelector(${js(body)})?.value.includes(${js(file.name)})`);
      const draft = await value(body);
      const final = await positions();
      assert.deepEqual(final, initial);
      await screenshot('ticket-creation');
      assert.deepEqual(uploads, [{ status: 201, contentType: 'image/png' }]);
      return { settings, version, browserSettings, captureFiles, uploads,
        observations: { operation: primary, uploadStatus: label, initial, pending, final, file, draft } };
    }
    const creation = await imageInput('ticket-creation', body, primary, text.newBody);
    await click('#save-ticket-button');
    await wait('!document.querySelector("#editor-dialog").open');
    const list = await json('GET', `/api/boards/${board.id}/tickets`);
    const created = list.tickets.find(item => item.title === text.newTicket);
    assert(created, 'Ticket creation did not persist');
    creation.stored = await ticketBody(created.id);
    assert.equal(creation.stored, creation.markdown.trim());
    await go(`/tickets/${created.id}`);
    await verifyImage(creation, detail, 'ticket-creation', showReload);

    await go(ticketPath);
    await activate('#header-edit-button', body);
    const full = await imageInput('ticket-full-edit', body, secondary, text.body);
    await click('#save-ticket-button');
    await visible(detail);
    full.stored = await ticketBody(ticket.id);
    assert.equal(full.stored, full.markdown.trim());
    await browser('reload');
    await verifyImage(full, detail, 'ticket-full-edit');
    await json('PATCH', `/api/tickets/${ticket.id}`, { bodyMarkdown: text.body });

    await go(ticketPath);
    await activate('[data-detail-edit="body"]', inlineBody);
    const inline = await imageInput('ticket-inline-edit', inlineBody, primary, text.body);
    await click('[data-detail-save-body]');
    await wait(`!(${existence(inlineBody)})`);
    inline.stored = await ticketBody(ticket.id);
    assert.equal(inline.stored, inline.markdown.trim());
    await browser('reload');
    await verifyImage(inline, detail, 'ticket-inline-edit', showReload);
    await json('PATCH', `/api/tickets/${ticket.id}`, { bodyMarkdown: text.body });

    await go(ticketPath);
    await activate('#comment-compose-toggle', newComment, text.newComment);
    const posted = await imageInput('comment-creation', newComment, secondary, text.newComment);
    await click('#save-comment-button');
    await wait(`document.querySelector(${js(newComment)})?.value === ""`);
    const { comments } = await json('GET', `/api/tickets/${ticket.id}/comments`);
    const latest = comments.find(item => item.id !== comment.id);
    assert(latest);
    posted.stored = latest.bodyMarkdown;
    assert.equal(posted.stored, posted.markdown.trim());
    await browser('reload');
    await verifyImage(posted, commentView(latest.id), 'comment-creation', showReload);
    await json('DELETE', `/api/comments/${latest.id}`);

    await go(ticketPath);
    await activate(`${commentRow} [data-toggle-comment-actions]`, `[data-edit-comment-id="${comment.id}"]`);
    await activate(`[data-edit-comment-id="${comment.id}"]`, editComment);
    const edited = await imageInput('comment-inline-edit', editComment, primary, text.note);
    await click(`[data-save-comment-id="${comment.id}"]`);
    await wait(`!(${existence(editComment)})`);
    edited.stored = (await storedComment(ticket.id, comment.id)).bodyMarkdown;
    assert.equal(edited.stored, edited.markdown.trim());
    await browser('reload');
    await verifyImage(edited, commentView(comment.id), 'comment-inline-edit', showReload);

    if (candidate && showReload) {
      const editButton = '#header-edit-button';
      const confirmDialog = '#ux-dialog';
      const confirmation = async (name, selector, record) => {
        await click(editButton);
        await wait(`document.querySelector(${js(confirmDialog)})?.open`);
        record.prompt = await evaluate(`document.querySelector('#ux-title').textContent.trim()`);
        assert(record.prompt);
        await screenshot(`${name}-discard-prompt`);
        await click('#ux-dismiss-button');
        await wait(`!document.querySelector(${js(confirmDialog)})?.open`);
        record.draftAfterKeep = await value(selector);
        assert.equal(record.draftAfterKeep, record.markdown);
        await click(editButton);
        await wait(`document.querySelector(${js(confirmDialog)})?.open`);
        await click('#ux-submit-button');
        await visible(body);
        assert.equal(await value(body), text.body);
      };
      await activate('#comment-compose-toggle', newComment, text.newComment);
      const cancelNew = await imageInput('comment-creation-cancel', newComment, primary, text.newComment);
      await confirmation('comment-creation', newComment, cancelNew);
      await browser('reload');
      await visible(detail);
      cancelNew.storedCommentCount = (await json('GET', `/api/tickets/${ticket.id}/comments`)).comments.length;
      assert.equal(cancelNew.storedCommentCount, 1);

      await activate(`${commentRow} [data-toggle-comment-actions]`, `[data-edit-comment-id="${comment.id}"]`);
      await activate(`[data-edit-comment-id="${comment.id}"]`, editComment);
      const cancelEdit = await imageInput('comment-inline-edit-cancel', editComment, secondary, edited.stored);
      await confirmation('comment-inline-edit', editComment, cancelEdit);
      await browser('reload');
      await visible(detail);
      cancelEdit.stored = (await storedComment(ticket.id, comment.id)).bodyMarkdown;
      assert.equal(cancelEdit.stored, edited.stored);

      await activate('[data-detail-edit="body"]', inlineBody);
      const cancelled = await imageInput('ticket-cancel', inlineBody, secondary, text.body);
      await click('[data-detail-cancel="body"]');
      await wait(`document.querySelector(${js(confirmDialog)})?.open`);
      await click('#ux-submit-button');
      await wait(`!(${existence(inlineBody)})`);
      cancelled.stored = await ticketBody(ticket.id);
      assert.equal(cancelled.stored, text.body);
      await browser('reload');
      await visible(detail);
      assert.equal(await evaluate(`document.querySelectorAll('${detail} img').length`), 0);
      cancelled.afterCancelAssetStatus = (await fetch(origin + cancelled.attachment)).status;

      await activate('[data-detail-edit="body"]', inlineBody);
      runtime.failUpload();
      const failure = await evaluate(`(${dispatchImage.toString()})(${js(inlineBody)}, ${js(primary)}, 'ticket-upload-failure')`);
      await wait(`document.querySelector('[data-image-upload-status][data-kind="error"]')?.textContent.trim().length > 0`);
      const error = await evaluate(`document.querySelector('[data-image-upload-status][data-kind="error"]').textContent.trim()`);
      assert.equal(await value(inlineBody), text.body);
      assert.equal(await ticketBody(ticket.id), text.body);
      assert.deepEqual(uploads.at(-1), { status: 503, contentType: 'image/png' });
      await screenshot('ticket-upload-failure', '[data-image-upload-status][data-kind="error"]');
      observations.failure = { operation: primary, failure, error, upload: uploads.at(-1), draft: text.body,
        stored: await ticketBody(ticket.id) };
    }

    return { settings, version, browserSettings, captureFiles, uploads, observations };
  } finally {
    await runtime.close();
    await browser('close').catch(error => console.error(error.message));
  }
}
