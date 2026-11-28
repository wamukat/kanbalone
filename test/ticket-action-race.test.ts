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
  test(`move abandons the picker when the editor changes during discard confirmation: ${change}`, async () => {
    let confirmDiscard!: (confirmed: boolean) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const confirmation = new Promise<boolean>((resolve) => { confirmDiscard = resolve; });
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
      openFormDialog: () => { dialogs++; },
      sendJson: async () => { writes++; },
    }, {
      captureDialogScope: () => () => editorDialog.open && state.editingTicketId === 1,
      confirmDiscardChanges: () => { markStarted(); return confirmation; },
    });
    const pending = actions.moveTicketToBoard();
    await started;
    if (change === "ticket") state.editingTicketId = 2;
    else editorDialog.open = false;
    confirmDiscard(true);
    await pending;
    assert.equal(dialogs, 0);
    assert.equal(writes, 0);
  });
}

test("move rechecks the initiating editor before writing the chosen destination", async () => {
  let confirm!: (value: boolean) => void;
  let submitMove!: () => Promise<boolean | undefined>;
  let markOpened!: () => void;
  const opened = new Promise<void>((resolve) => { markOpened = resolve; });
  const confirmation = new Promise<boolean>((resolve) => { confirm = resolve; });
  const state = {
    editingTicketId: 1, editorSaving: false,
    dialogTicket: { id: 1, boardId: 10, laneId: 100 },
    boardDetail: { lanes: [{ id: 100, name: "Todo" }] },
    boards: [{ id: 10, name: "Source" }, { id: 20, name: "Destination" }],
  };
  let changeBoard!: () => Promise<void>;
  const boardSelect = {
    value: "10", focus: () => {},
    addEventListener: (_type: string, handler: () => Promise<void>) => { changeBoard = handler; },
  };
  const laneSelect = { value: "100", disabled: true, addEventListener: () => {} };
  const submit = { disabled: false };
  const uxDialog = { open: false };
  const hint = { textContent: "" };
  let writes = 0;
  const actions = createTicketActionsModule({
    state,
    elements: {
      uxDialog, uxSubmitButton: submit, uxError: { hidden: true }, editorForm: { inert: false },
      uxFields: { querySelector: (selector: string) => ({ "[data-move-board]": boardSelect, "[data-move-lane]": laneSelect, "[data-move-hint]": hint })[selector] },
    },
    escapeHtml: String,
    api: async () => ({ lanes: [{ id: 200, name: "Todo" }] }),
    openFormDialog: ({ onSubmit }: { onSubmit: typeof submitMove }) => {
      submitMove = onSubmit;
      uxDialog.open = true;
      markOpened();
      return confirmation;
    },
    sendJson: async () => { writes++; },
  }, { confirmDiscardChanges: async () => true, captureDialogScope: () => () => state.editingTicketId === 1 });
  const pending = actions.moveTicketToBoard();
  await opened;
  boardSelect.value = "20";
  await changeBoard();
  laneSelect.value = "200";
  state.editingTicketId = 2;
  assert.equal(await submitMove(), false);
  confirm(false);
  await pending;
  assert.equal(writes, 0);
});
