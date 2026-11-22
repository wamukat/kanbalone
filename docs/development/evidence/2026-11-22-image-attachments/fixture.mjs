import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const baseline = '5ff44622f74c2116147d60c11be7f86fbc2208d2';
export const roots = {
  before: resolve('coverage/image-evidence/baseline-source'),
  after: resolve(process.env.KANBALONE_IMAGE_EVIDENCE_CANDIDATE_ROOT ?? '.'),
};

export async function createRuntime(phase) {
  const root = roots[phase];
  assert(root);
  const { buildApp } = await import(pathToFileURL(resolve(root, 'src/app.ts')).href);
  const directory = mkdtempSync(resolve(tmpdir(), 'kanbalone-image-evidence-'));
  const app = buildApp({
    dbFile: resolve(directory, 'fixture.sqlite'),
    staticDir: resolve(root, 'public'),
    remoteCredentialProviders: [],
    remoteCredentialScopes: [],
  });
  const uploads = [];
  let failNextUpload = false;
  let uploadHold = null;
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || request.url.split('?')[0] !== '/api/attachments') return;
    if (uploadHold) await uploadHold;
    if (failNextUpload) {
      failNextUpload = false;
      return reply.code(503).send({ error: 'Synthetic attachment upload failure' });
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    if (request.method === 'POST' && request.url.split('?')[0] === '/api/attachments') {
      uploads.push({ status: reply.statusCode, contentType: request.headers['content-type'] });
    }
  });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    origin,
    uploads,
    failUpload() { failNextUpload = true; },
    holdUpload() {
      let release;
      uploadHold = new Promise(resolve => { release = resolve; });
      return () => { uploadHold = null; release(); };
    },
    async json(method, pathname, body) {
      const response = await fetch(origin + pathname, {
        method,
        ...(body && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      assert(response.ok, `${method} ${pathname}: ${response.status}`);
      return response.status === 204 ? null : response.json();
    },
    async close() {
      const closing = app.close();
      app.server.closeAllConnections();
      await closing;
      rmSync(directory, { recursive: true });
    },
  };
}

export function localText(locale) {
  return locale === 'ja' ? {
    board: '添付画像の確認', todo: '未着手', review: '確認中', ticket: 'ダイアログ表示を確認',
    body: '**確認手順**\n\n表示を確認して結果を共有します。',
    note: '一覧の並びを確認しました。', newTicket: '作成時の画像を添付',
    newBody: '作成時の確認画像です。', newComment: '再確認時の表示です。',
  } : {
    board: 'Attachment review', todo: 'Todo', review: 'Review', ticket: 'Review the dialog layout',
    body: '**Verification steps**\n\nCheck the layout and share the result.',
    note: 'The list order is correct.', newTicket: 'Attach an image during creation',
    newBody: 'This is the initial review image.', newComment: 'Here is the follow-up result.',
  };
}

export async function seed({ json }, text) {
  const { board, lanes } = await json('POST', '/api/boards', {
    name: text.board, laneNames: [text.todo, text.review],
  });
  const ticket = await json('POST', `/api/boards/${board.id}/tickets`, {
    title: text.ticket, bodyMarkdown: text.body, laneId: lanes[0].id, priority: 2,
  });
  const comment = await json('POST', `/api/tickets/${ticket.id}/comments`, { bodyMarkdown: text.note });
  return { board, lane: lanes[0], ticket, comment };
}

export async function dispatchImage(selector, operation, example) {
  const editor = document.querySelector(selector);
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 132;
  const context = canvas.getContext('2d');
  context.fillStyle = '#eaf4ef';
  context.fillRect(0, 0, 560, 132);
  context.fillStyle = '#095e4e';
  context.fillRect(0, 0, 10, 132);
  context.font = '600 26px sans-serif';
  context.fillText('Layout check', 29, 48);
  context.font = '16px sans-serif';
  context.fillText(`Synthetic image / ${example}`, 29, 83);
  context.fillStyle = '#247854';
  context.beginPath();
  context.arc(499, 66, 27, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#fff';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(488, 66);
  context.lineTo(496, 74);
  context.lineTo(511, 57);
  context.stroke();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const bytes = await blob.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const name = `${example}.png`;
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], name, { type: 'image/png' }));
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
  const event = operation === 'paste'
    ? new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
    : new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
  if (operation === 'drop') {
    for (const type of ['dragenter', 'dragover']) {
      editor.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
  }
  editor.dispatchEvent(event);
  return { name, hash, bytes: blob.size, consumed: event.defaultPrevented };
}
