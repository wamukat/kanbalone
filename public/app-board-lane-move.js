import { t } from "./app-i18n.js";

// One focused ticket, within its current board. The guarded positioning API also
// derives completion and prevents a stale dialog from moving a relocated ticket.
export async function changeFocusedTicketLane(ctx, ticketId, isCurrent, restoreFocus) {
  const { state, elements } = ctx;
  const ticket = state.boardDetail?.tickets.find(ticket => ticket.id === ticketId);
  if (!ticket || !isCurrent() || elements.uxDialog.open) return;
  const { laneId: sourceLaneId, position: sourcePosition } = ticket;
  const boardId = state.activeBoardId;
  const lanes = [...state.boardDetail.lanes];
  let moved = false;
  let releaseUpdates;
  let select;
  try {
    const result = ctx.openFormDialog({
      title: t("Change lane"),
      message: `#${ticketId} ${ticket.title}`,
      fields: `<label>${t("Lane")}<select data-keyboard-move-lane>${lanes.map(lane => `<option value="${lane.id}"${lane.id === sourceLaneId ? " selected" : ""}>${ctx.escapeHtml(lane.name)}${lane.id === sourceLaneId ? ` (${t("Current")})` : ""}</option>`).join("")}</select></label>`,
      submitLabel: t("Move"),
      onSubmit: async () => {
        if (!isCurrent()) throw new Error(t("The board changed. Close this dialog and try again."));
        const laneId = Number(select.value);
        const lane = lanes.find(lane => lane.id === laneId);
        if (!lane || laneId === sourceLaneId || moved) return false;
        select.disabled = true;
        releaseUpdates = ctx.deferBoardUpdatesDuringCreationRefresh?.(boardId);
        try {
          await ctx.sendJson(`/api/tickets/${ticketId}/position`, {
            method: "PATCH",
            body: { laneId, ...(lane.isCompletionLane ? { position: 0 } : {}),
              expectedSourceLaneId: sourceLaneId, expectedSourcePosition: sourcePosition },
          });
          moved = true;
        } catch (error) {
          releaseUpdates?.();
          releaseUpdates = undefined;
          select.disabled = false;
          throw error;
        }
      },
    });
    select = elements.uxFields.querySelector("[data-keyboard-move-lane]");
    elements.uxSubmitButton.disabled = true;
    select.addEventListener("change", () => {
      elements.uxSubmitButton.disabled = Number(select.value) === sourceLaneId;
      elements.uxError.hidden = true;
    });
    select.focus();
    await result;
    if (moved && isCurrent()) {
      try {
        await ctx.refreshBoardDetail();
        if (isCurrent()) ctx.showToast(t("Ticket moved"));
      } catch {
        if (isCurrent()) ctx.showToast(t("Ticket moved, but the view could not refresh. Reload to continue."), "error");
      }
    }
  } finally {
    if (isCurrent()) restoreFocus(ticketId);
    releaseUpdates?.();
  }
}
