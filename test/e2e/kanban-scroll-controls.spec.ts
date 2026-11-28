import { test, expect } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard } from './helpers.js';
import path from 'node:path';
const baseline=Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
for(const theme of ['light','dark'] as const) test(`scroll direction is visibly unavailable at each edge (${theme})`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({colorScheme:theme});
  await page.addInitScript(()=>localStorage.setItem('kanbalone:language','ja'));
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC||path.join(process.cwd(),'public')});
  const port=await getFreePort();await app.listen({host:'127.0.0.1',port});const base=`http://127.0.0.1:${port}`;
  try {
    const {board,lanes}=await createBoard(page.request,base,{name:'横スクロールの確認',laneNames:['未着手','作業中','レビュー','確認待ち','完了','保留']});
    const small=await createBoard(page.request,base,{name:'スクロール不要',laneNames:['未着手']});
    await page.goto(`${base}/boards/${board.id}`);
    const controls=page.locator('.kanban-scroll-controls'), left=controls.locator('button').first(),right=controls.locator('button').last(),viewport=page.locator('#lane-board');
    const capture=async(name:string)=>{if(process.env.EVIDENCE_DIR&&theme==='light')await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${name}.png`});};
    const style=async()=>{
      if(baseline)return;
      const disabled=controls.locator('button:disabled');await expect(disabled).toHaveCSS('cursor','default');await expect(disabled).toHaveCSS('opacity','0.45');
      const border=await disabled.evaluate(el=>getComputedStyle(el).borderColor);await disabled.hover();await expect(disabled).toHaveCSS('border-color',border);
    };
    await expect(controls).toBeVisible();await expect(left).toBeDisabled();await expect(right).toBeEnabled();await capture('left');await style();
    await right.focus();await page.keyboard.press('Enter');await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await viewport.evaluate(el=>el.scrollLeft=(el.scrollWidth-el.clientWidth)/2);await expect(left).toBeEnabled();await expect(right).toBeEnabled();await page.mouse.move(20,20);await capture('middle');
    await viewport.evaluate(el=>el.scrollLeft=el.scrollWidth);
    if(baseline) await expect(right).toBeEnabled(); else await expect(right).toBeDisabled();await expect(left).toBeEnabled();await capture('right');await style();
    await left.click();await expect(right).toBeEnabled();
    await page.setViewportSize({width:3000,height:900});await expect(controls).toBeHidden();
    await page.setViewportSize({width:1440,height:900});await expect(controls).toBeVisible();await expect(left).toBeDisabled();
    await page.goto(`${base}/boards/${small.board.id}`);await expect(controls).toBeHidden();
    await page.goto(`${base}/boards/${board.id}`);await expect(controls).toBeVisible();await expect(left).toBeDisabled();
    expect((await (await page.request.get(`${base}/api/boards/${board.id}`)).json()).lanes).toEqual(lanes);
  } finally {await page.close();await closeTestApp(app);}
});
