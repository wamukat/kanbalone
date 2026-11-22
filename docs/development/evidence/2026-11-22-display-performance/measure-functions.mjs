import {chromium} from '@playwright/test';import fs from 'node:fs';
const browser=await chromium.launch();
for(const [phase,port] of [['before',3595],['after',3594]]){
 const context=await browser.newContext({locale:'en-US'});const page=await context.newPage();await page.goto(`http://127.0.0.1:${port}/boards/1/list`);await page.waitForSelector('.list-row');
 const r=await page.evaluate(fs.readFileSync('docs/development/evidence/2026-11-22-display-performance/profile-functions.js','utf8'));fs.writeFileSync(`docs/development/evidence/2026-11-22-display-performance/functions-${phase}.json`,JSON.stringify(r,null,2));await context.close();
}
await browser.close();
