import { test, expect } from '@playwright/test';
import { createBoard, startTestApp } from './helpers.js';

for (const locale of ['ja', 'en']) test(`${locale}: preview progress survives stale responses and resets for retry`, async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(locale => localStorage.setItem('kanbalone:language',locale),locale);
  const {baseUrl,close}=await startTestApp(page);
  const releases: (() => void)[]=[];
  try {
    const {board}=await createBoard(page.request,baseUrl,{name:'Remote preview',laneNames:['Todo']});
    await page.route('**/api/meta', route => route.fulfill({json:{name:'Kanbalone',version:'test',remoteProviders:[{id:'github',hasCredential:true}]}}));
    let requests=0;
    await page.route('**/remote-import/preview',async route => {
      const index=requests++;
      await new Promise<void>(resolve => releases[index]=resolve);
      await route.fulfill(index===1 ? {status:503,json:{error:'Simulated outage'}} : {json:{provider:'github',displayRef:`example/repo#${index+1}`,state:'open',title:`Preview ${index+1}`,duplicate:false}});
    });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole('button',{name:locale==='ja'?'新しいチケット':'New ticket',exact:true}).click();
    await page.locator('#remote-import-create-button').click();
    const url=page.locator('#editor-remote-url'),button=page.locator('#editor-remote-import-preview-button');
    await url.fill('https://github.com/example/repo/issues/1');
    await button.click();
    await expect.poll(()=>requests).toBe(1);
    await expect(button).toHaveText(locale==='ja'?'読み込み中…':'Loading...');
    await expect(button).toHaveAttribute('aria-busy','true');
    await expect(button).toBeDisabled();
    if(process.env.EVIDENCE_DIR) await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${locale}-pending.png`});
    // Input replacement permits a distinct request; the old completion cannot clear its busy state.
    await url.fill('https://github.com/example/repo/issues/2');
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(()=>requests).toBe(2);
    const firstResponse=page.waitForResponse(r=>r.url().endsWith('/remote-import/preview'));
    releases[0](); await firstResponse;
    await expect(button).toHaveAttribute('aria-busy','true');
    await expect(page.locator('#editor-remote-import-preview')).toBeHidden();
    releases[1]();
    await expect(page.locator('#editor-remote-import-error')).toContainText('Simulated outage');
    await expect(button).toHaveAttribute('aria-busy','false');
    await expect(button).toHaveText(locale==='ja'?'プレビュー':'Preview');
    await button.click();
    await expect.poll(()=>requests).toBe(3);
    releases[2]();
    await expect(page.locator('#editor-remote-import-preview')).toContainText('Preview 3');
    await expect(button).toBeEnabled();
    await expect(page.locator('#editor-remote-import-submit-button')).toBeEnabled();
    // Closing invalidates an outstanding preview even when the same URL is reused.
    await button.click(); await expect.poll(()=>requests).toBe(4);
    await page.locator('#editor-remote-import-cancel-button').click();
    await page.locator('#remote-import-create-button').click();
    await url.fill('https://github.com/example/repo/issues/2');
    await button.click(); await expect.poll(()=>requests).toBe(5);
    const closedResponse=page.waitForResponse(r=>r.url().endsWith('/remote-import/preview'));
    releases[3](); await closedResponse;
    await expect(button).toHaveAttribute('aria-busy','true');
    await expect(page.locator('#editor-remote-import-preview')).toBeHidden();
    releases[4]();
    await expect(page.locator('#editor-remote-import-preview')).toContainText('Preview 5');
    expect((await (await page.request.get(`${baseUrl}/api/boards/${board.id}/tickets`)).json()).tickets).toEqual([]);
  } finally {releases.forEach(release=>release());await close();}
});
