import test from "node:test";
import assert from "node:assert/strict";

const actionModulePath = "../public/app-ticket-actions.js";
const { createTicketActionsModule } = await import(actionModulePath);

test("archive captures its ticket before the async read and releases the saving lock", async () => {
  let releaseRead!: (ticket: { isArchived: boolean }) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const reading = new Promise<{ isArchived: boolean }>((resolve) => { releaseRead = resolve; });
  const state = { editingTicketId: 1, editorSaving: false, filters: { status: ["open"] } };
  const writes: string[] = [];
  const ctx = {
    state,
    elements: { editorForm: { inert: false }, editorSaveState: { hidden: true, textContent: "", dataset: { kind: "" } } },
    api: async (url: string) => { assert.equal(url, "/api/tickets/1"); markStarted(); return reading; },
    sendJson: async (url: string) => { writes.push(url); },
    refreshBoardDetail: async () => {},
    showToast: () => {},
  };
  const actions = createTicketActionsModule(ctx, {
    confirmDiscardChanges: async () => true,
    closeEditor: () => {},
  });
  const pending = actions.toggleTicketArchive();
  await started;
  assert.equal(state.editorSaving, true);
  assert.equal(ctx.elements.editorForm.inert, true);
  state.editingTicketId = 2;
  releaseRead({ isArchived: false });
  await pending;
  assert.deepEqual(writes, ["/api/tickets/1"]);
  assert.equal(state.editorSaving, false);
  assert.equal(ctx.elements.editorForm.inert, false);
});

test("archive releases the saving lock after a failed read without writing", async () => {
  const state = { editingTicketId: 1, editorSaving: false, filters: { status: ["open"] } };
  let writes = 0;
  const actions = createTicketActionsModule({
    state,
    elements: { editorForm: { inert: false }, editorSaveState: { hidden: true, textContent: "", dataset: { kind: "" } } },
    api: async () => { throw new Error("offline"); },
    sendJson: async () => { writes++; },
    showToast: () => {},
  }, { confirmDiscardChanges: async () => true });
  await actions.toggleTicketArchive();
  assert.equal(writes, 0);
  assert.equal(state.editorSaving, false);
});

for (const change of ["ticket", "close"] as const) {
  test(`move abandons preflight when the editor changes: ${change}`, async () => {
    let releaseRead!: (board: { lanes: { id: number; name: string }[] }) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const reading = new Promise((resolve) => { releaseRead = resolve; });
    const state = {
      editingTicketId: 1, editorSaving: false,
      dialogTicket: { id: 1, boardId: 10, laneId: 100 },
      boardDetail: { lanes: [{ id: 100, name: "Todo" }] },
      boards: [{ id: 10 }, { id: 20 }],
    };
    const editorDialog = { open: true };
    let dialogs = 0;
    let writes = 0;
    const actions = createTicketActionsModule({
      state, elements: { editorDialog },
      api: async () => { markStarted(); return reading; },
      openFormDialog: () => { dialogs++; },
      sendJson: async () => { writes++; },
    }, { confirmDiscardChanges: async () => true });
    const pending = actions.moveTicketToBoard();
    await started;
    if (change === "ticket") state.editingTicketId = 2;
    else editorDialog.open = false;
    releaseRead({ lanes: [{ id: 200, name: "Todo" }] });
    await pending;
    assert.equal(dialogs, 0);
    assert.equal(writes, 0);
  });
}

test("move rechecks the initiating editor after destination confirmation", async () => {
  let confirm!: (value: boolean) => void;
  let markOpened!: () => void;
  const opened = new Promise<void>((resolve) => { markOpened = resolve; });
  const confirmation = new Promise<boolean>((resolve) => { confirm = resolve; });
  const state = {
    editingTicketId: 1, editorSaving: false,
    dialogTicket: { id: 1, boardId: 10, laneId: 100 },
    boardDetail: { lanes: [{ id: 100, name: "Todo" }] },
    boards: [{ id: 10, name: "Source" }, { id: 20, name: "Destination" }],
  };
  const boardSelect = { value: "20", addEventListener: () => {} };
  const laneSelect = { value: "200", disabled: false };
  const submit = { disabled: false };
  let writes = 0;
  const actions = createTicketActionsModule({
    state,
    elements: {
      editorDialog: { open: true }, uxSubmitButton: submit,
      uxFields: { querySelector: (selector: string) => selector === "[data-move-board]" ? boardSelect : laneSelect },
    },
    escapeHtml: String,
    api: async () => ({ lanes: [{ id: 200, name: "Todo" }] }),
    openFormDialog: () => { markOpened(); return confirmation; },
    sendJson: async () => { writes++; },
  }, { confirmDiscardChanges: async () => true });
  const pending = actions.moveTicketToBoard();
  await opened;
  state.editingTicketId = 2;
  confirm(true);
  await pending;
  assert.equal(writes, 0);
  assert.equal(submit.disabled, false);
});
