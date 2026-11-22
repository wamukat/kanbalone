import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "@playwright/test";
import { buildApp, createDbFile, getFreePort, closeTestApp } from "../../test/e2e/helpers.ts";

async function serve(staticDir) {
  const app = buildApp({ dbFile: createDbFile(), staticDir: path.resolve(staticDir) });
  await app.listen({ host: "127.0.0.1", port: await getFreePort() });
  const origin = "http://127.0.0.1:" + app.server.address().port;
  const seed = async (url, body) => {
    const response = await fetch(origin + url, { method:"POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 201);
    return response.json();
  };
  const {board, lanes} = await seed("/api/boards", {name:"Geometry fixture", laneNames:["Todo"]});
  const ticket = await seed("/api/boards/" + board.id + "/tickets", {laneId:lanes[0].id,title:"Geometry ticket",bodyMarkdown:"Same starting draft."});
  await seed("/api/tickets/" + ticket.id + "/comments", {bodyMarkdown:"Same starting comment."});
  return { app, url: origin + "/tickets/" + ticket.id, board: origin + "/boards/" + board.id };
}

async function compare(page, scene) {
  const geometry = () => page.evaluate(({input, save}) => {
    const field = document.querySelector(input);
    const button = document.querySelector(save);
    const feedback = field.nextElementSibling.getBoundingClientRect();
    return {
      height:feedback.height,
      relativeSaveY: button.getBoundingClientRect().y - field.getBoundingClientRect().y,
    };
  }, {input:scene.input, save:scene.save});
  await page.locator(scene.input).focus();
  const idle = await geometry();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let done;
  const finished = new Promise(resolve => { done = resolve; });
  await page.route("**/api/attachments", async route => {
    try {
      await gate;
      await route.fulfill({status:500,json:{error:"Injected upload response"}});
    } finally {
      done();
    }
  });
  await page.locator(scene.input).evaluate(el => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["fake image payload"], "example-with-a-very-long-filename-to-demonstrate-wrapping-in-the-error-state.png", {type:"image/png"}));
    return el.dispatchEvent(new ClipboardEvent("paste", {bubbles:true,cancelable:true,clipboardData:transfer}));
  });
  const live = page.locator(scene.input + " + .image-attachment-feedback [data-kind=saving]");
  await live.waitFor();
  const loading = await geometry();
  assert.deepEqual(loading, idle);
  assert.equal(await live.evaluate(el => getComputedStyle(el.previousElementSibling).visibility), "hidden");
  release();
  await finished;
  await page.locator(scene.input + " + .image-attachment-feedback [data-kind=error]").waitFor();
  const error = await geometry();
  assert.ok(error.height >= idle.height);
  return { idle, loading, error };
}

const baseline = await serve("coverage/image-attachments/frontend-baseline/public");
const candidate = await serve("public");
const browser = await chromium.launch();
try {
  const scenes = [
    {name:"create", input:"#ticket-body", save:"#save-ticket-button", open:async page => {
      await page.goto(candidate.board); await page.locator(".add-ticket-button").click();
    }},
    {name:"full edit", input:"#ticket-body", save:"#save-ticket-button", open:async page => {
      await page.goto(candidate.url); await page.locator("#header-edit-button").click();
    }},
    {name:"inline body", input:"[data-detail-body-input]", save:"[data-detail-save-body]", open:async page => {
      await page.goto(candidate.url); await page.locator("[data-detail-edit=body]").click();
    }},
    {name:"comment composer", input:"#comment-body", save:"#save-comment-button", open:async page => {
      await page.goto(candidate.url); await page.locator("#comment-compose-toggle").click();
    }},
    {name:"inline comment", input:"[data-comment-edit-body]", save:"[data-save-comment-id]", open:async page => {
      await page.goto(candidate.url); await page.locator("[data-toggle-comment-actions]").click();
      await page.locator("[data-edit-comment-id]").click();
    }},
  ];
  const result = [];
  for (const locale of ["en-US","ja-JP"]) {
    for (const width of [390,1440]) {
      const context = await browser.newContext({ locale,viewport:{width,height:900},colorScheme:width === 390 ? "dark" : "light" });
      for (const scene of scenes) {
        const page = await context.newPage();
        try {
          await scene.open(page);
          result.push({ locale,width,scene:scene.name,...await compare(page,scene) });
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  }
  const measurements = {};
  for (const [revision, env] of [["baseline",baseline],["candidate",candidate]]) {
    const context = await browser.newContext({ locale:"en-US",viewport:{width:390,height:844},colorScheme:"dark" });
    const page = await context.newPage();
    await page.goto(env.url);
    await page.locator("#comment-compose-toggle").click();
    await page.locator("[data-detail-edit=body]").click();
    await page.locator("[data-detail-body-input]").fill("Unsaved to trigger the same dialog.");
    await page.locator("[data-detail-body-input]").press("Escape");
    await page.locator("#ux-title").waitFor();
    measurements[revision] = await page.evaluate(() => ({
      bodyHeading: getComputedStyle(document.querySelector("#ux-title")).color,
      promptBackground: getComputedStyle(document.querySelector("#ux-dialog")).backgroundColor,
      commentLabel: getComputedStyle(document.querySelector("#comment-form label > span")).color,
      darkTheme: getComputedStyle(document.documentElement).getPropertyValue("--panel"),
    }));
    await context.close();
  }
  assert.deepEqual(measurements.baseline, measurements.candidate);
  console.log(JSON.stringify({result, measurements},null,2));
} finally {
  await browser.close();
  await closeTestApp(baseline.app);
  await closeTestApp(candidate.app);
}
