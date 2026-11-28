import { test, expect } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard } from './helpers.js';
import path from 'node:path';
import fs from 'node:fs';
const baseline=Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
test('scroll buttons animate between positions and respect reduced motion at activation',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>localStorage.setItem('kanbalone:language','ja'));
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC||path.join(process.cwd(),'public')});const port=await getFreePort();await app.listen({host:'127.0.0.1',port});const base=`http://127.0.0.1:${port}`;
  try {
    const {board,lanes}=await createBoard(page.request,base,{name:'スムーズなスクロール',laneNames:['未着手','作業中','レビュー','確認待ち','完了','保留']});await page.goto(`${base}/boards/${board.id}`);
    const viewport=page.locator('#lane-board'),left=page.locator('.kanban-scroll-controls button').first(),right=page.locator('.kanban-scroll-controls button').last();await expect(right).toBeEnabled();
    if(process.env.EVIDENCE_DIR)await page.screenshot({path:`${process.env.EVIDENCE_DIR}/start.png`});
    const measure=()=>viewport.evaluate(async el=>{
      const end=el.scrollWidth-el.getBoundingClientRect().width,started=performance.now();
      const samples:Array<{ms:number;left:number}>=[];
      (document.querySelector('.kanban-scroll-controls button:last-child') as HTMLButtonElement).click();
      samples.push({ms:0,left:el.scrollLeft});
      while(Math.abs(el.scrollLeft-end)>1 && performance.now()-started<3000){
        await new Promise(requestAnimationFrame);samples.push({ms:Math.round(performance.now()-started),left:el.scrollLeft});
      }
      return {end,samples};
    });
    const normal=await measure();expect(normal.end).toBeGreaterThan(0);expect(normal.samples.at(-1)!.left).toBeCloseTo(normal.end,0);
    expect(normal.samples.some(s=>s.left>0&&s.left<normal.end-1)).toBe(!baseline);
    await expect(right).toBeDisabled();await expect(left).toBeEnabled();
    if(process.env.EVIDENCE_DIR)await page.screenshot({path:`${process.env.EVIDENCE_DIR}/end.png`});
    await left.focus();await page.keyboard.press('Enter');await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBe(0);await expect(left).toBeDisabled();
    await page.emulateMedia({reducedMotion:'reduce'});const reduced=await measure();expect(reduced.samples[0].left).toBeCloseTo(reduced.end,0);await expect(right).toBeDisabled();
    if(process.env.EVIDENCE_DIR)fs.writeFileSync(`${process.env.EVIDENCE_DIR}/movement.json`,JSON.stringify({normal,reduced},null,2)+'\n');
    expect((await (await page.request.get(`${base}/api/boards/${board.id}`)).json()).lanes).toEqual(lanes);
  } finally {await page.close();await closeTestApp(app);}
});
