import { expect, test } from "@playwright/test";
import { startTestApp, createBoard, createTicket } from "./helpers.js";

test("inline body Escape keeps changes until explicit discard", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Draft safety", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Draft", bodyMarkdown: "Original" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator('[data-detail-edit="body"]').click();
    await page.locator('[data-detail-body-input]').fill("Unsaved body");
    await page.keyboard.press("Escape");
    await expect(page.locator('#ux-title')).toHaveText("Discard changes?");
    await page.locator('#ux-cancel-button').click();
    await expect(page.locator('[data-detail-body-input]')).toHaveValue("Unsaved body");
    await page.locator('[data-detail-body-input]').press("Escape");
    await page.locator('#ux-submit-button').click();
    await expect(page.locator('[data-detail-body-input]')).toHaveCount(0);
    await expect(page.locator('#ticket-view-body')).toContainText("Original");
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', true);
    await page.keyboard.press("Escape");
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', false);
  } finally { await close(); }
});

test("full editor protects changes on outside click and Back, saved edits close without confirmation", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Draft safety", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Draft", bodyMarkdown: "Original" });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await page.getByRole('button', { name: 'Draft', exact: true }).click();
    await page.locator('#header-edit-button').click();
    await page.locator('#ticket-body').fill('Keep this');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#ux-title')).toHaveText('Discard changes?');
    await page.locator('#ux-cancel-button').click();
    await expect(page.locator('#ticket-body')).toHaveValue('Keep this');
    await page.goBack();
    await expect(page.locator('#ux-dialog')).toHaveJSProperty('open', true);
    await expect(page.locator('#ux-title')).toHaveText('Discard changes?');
    await page.locator('#ux-cancel-button').click();
    await expect(page).toHaveURL(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator('#ticket-body')).toHaveValue('Keep this');
    await page.locator('#editor-form').getByRole('button', {name:'Save',exact:true}).click();
    await expect(page.locator('#ticket-view-body')).toContainText('Keep this');
    // The detail updates before the post-save board refresh releases the saving guard.
    await expect(page.locator('#editor-form')).toHaveJSProperty('inert', false);
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', false);
    await expect(page.locator('#ux-dialog')).toHaveJSProperty('open', false);
  } finally { await close(); }
});

test("failed inline save and comment refresh preserve the body draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Failed save", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Draft", bodyMarkdown: "Original" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator('[data-detail-edit="body"]').click();
    await page.locator('[data-detail-body-input]').fill('Recoverable draft');
    await page.route(`**/api/tickets/${ticket.id}`, async route => {
      if (route.request().method() === 'PATCH') await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test save failure'})});
      else await route.continue();
    });
    await page.locator('[data-detail-save-body]').click();
    await expect(page.locator('#editor-save-state')).toHaveText('Save failed');
    await page.locator('[data-detail-body-input]').press('Escape');
    await expect(page.locator('#ux-title')).toHaveText('Discard changes?');
    await page.locator('#ux-cancel-button').click();
    await expect(page.locator('[data-detail-body-input]')).toHaveValue('Recoverable draft');
    await page.locator('#comment-compose-toggle').click();
    await page.locator('#comment-body').fill('Review note');
    await page.locator('#save-comment-button').click();
    await expect(page.locator('#ticket-comments')).toContainText('Review note');
    await expect(page.locator('[data-detail-body-input]')).toHaveValue('Recoverable draft');
    await page.locator('#header-edit-button').click();
    await expect(page.locator('#ux-title')).toHaveText('Discard changes?');
    await page.locator('#ux-cancel-button').click();
    await expect(page.locator('[data-detail-body-input]')).toHaveValue('Recoverable draft');
  } finally { await close(); }
});

test("inline body is readonly during save, preventing a later draft from being lost", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const board = await createBoard(page.request, baseUrl, { name: 'Slow save', laneNames: ['Todo'] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, {laneId:board.lanes[0].id,title:'Slow',bodyMarkdown:'Original'});
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator('[data-detail-edit="body"]').click();
    await page.locator('[data-detail-body-input]').fill('Submitted draft');
    await page.route(`**/api/tickets/${ticket.id}`, async route => {
      if (route.request().method() === 'PATCH') await gate;
      await route.continue();
    });
    await page.locator('[data-detail-save-body]').click();
    await expect(page.locator('[data-detail-body-input]')).toHaveJSProperty('readOnly',true);
    await page.locator('[data-detail-body-input]').press('Escape');
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open',true);
    await page.locator('#comment-compose-toggle').click();
    await page.locator('#comment-body').fill('Note during save');
    await page.locator('#save-comment-button').click();
    await expect(page.locator('#ticket-comments')).toContainText('Note during save');
    await expect(page.locator('[data-detail-body-input]')).toHaveValue('Submitted draft');
    await expect(page.locator('[data-detail-body-input]')).toHaveJSProperty('readOnly', true);
    release();
    await expect(page.locator('#ticket-view-body')).toContainText('Submitted draft');
    await expect(page.locator('[data-detail-body-input]')).toHaveCount(0);
  } finally { release(); await close(); }
});
