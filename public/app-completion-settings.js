export function createCompletionSettingsModule(ctx) {
  const { state, elements } = ctx;
  let edit = null;
  const signature = (lanes) => JSON.stringify(lanes.map((lane) => [lane.id, lane.isCompletionLane]).sort((a, b) => a[0] - b[0]));

  function start() {
    if (!state.boardDetail) return;
    edit = { boardId: state.activeBoardId, baseline: signature(state.boardDetail.lanes), selected: new Set(state.boardDetail.lanes.filter((lane) => lane.isCompletionLane).map((lane) => lane.id)), review: null, busy: false, error: "" };
    render();
    elements.sidebarLaneSettings.querySelector("input")?.focus();
  }
  function cancel() { edit = null; render(); }
  function render() {
    const host = elements.sidebarLaneSettings;
    const lanes = state.boardDetail?.lanes ?? [];
    if (edit && edit.boardId !== state.activeBoardId) edit = null;
    if (!state.boardDetail) { host.innerHTML = ""; return; }
    const heading = '<h3 class="sidebar-setting-label">Completion lanes</h3>';
    if (!edit) {
      const names = lanes.filter((lane) => lane.isCompletionLane).map((lane) => lane.name);
      host.innerHTML = `${heading}<div class="completion-summary"><span>${ctx.escapeHtml(names.join(", ") || "Not configured")}</span><button type="button" class="ghost" data-completion-edit>${names.length ? "Change" : "Set up"}</button></div>`;
      host.querySelector("[data-completion-edit]").addEventListener("click", start);
      return;
    }
    const current = edit;
    const changed = lanes.some((lane) => lane.isCompletionLane !== current.selected.has(lane.id));
    const review = current.review;
    host.innerHTML = `${heading}<p class="completion-help">Tickets in the selected lanes are treated as resolved.</p>
      <div class="completion-options">${lanes.map((lane) => `<label><input type="checkbox" data-completion-lane="${lane.id}" ${current.selected.has(lane.id) ? "checked" : ""} ${current.busy || review ? "disabled" : ""}><span>${ctx.escapeHtml(lane.name)}</span></label>`).join("")}</div>
      ${current.error ? `<p class="completion-error" role="alert">${ctx.escapeHtml(current.error)}</p>` : ""}
      ${review ? `<div class="completion-review" role="status"><strong>Effect on tickets</strong>
        ${review.changes.map((lane) => `<p>${ctx.escapeHtml(lane.name)} → ${lane.next ? "Completion lane" : "Normal lane"}</p>`).join("")}
        ${review.reopened ? `<p class="completion-impact">${review.reopened} resolved tickets will be reopened.</p>` : ""}
        ${review.resolved ? `<p>${review.resolved} tickets will be resolved.</p>` : ""}
        <p>Includes archived tickets. Archived status will not change.</p></div>` : ""}
      <div class="completion-actions">
        <button type="button" class="primary-action" data-completion-save ${current.busy || !changed ? "disabled" : ""}>${current.busy ? "Saving…" : review ? review.reopened && review.resolved ? "Apply both changes" : review.reopened ? `Reopen ${review.reopened} tickets and apply` : `Resolve ${review.resolved} tickets and apply` : "Save"}</button>
        ${review ? '<button type="button" class="ghost" data-completion-back>Back</button>' : ""}
        <button type="button" class="ghost" data-completion-cancel>Cancel</button>
      </div>`;
    host.querySelectorAll("[data-completion-lane]").forEach((input) => input.addEventListener("change", () => {
      const id = Number(input.dataset.completionLane);
      input.checked ? current.selected.add(id) : current.selected.delete(id);
      current.error = "";
      render();
      host.querySelector(`[data-completion-lane="${id}"]`)?.focus();
    }));
    host.querySelector("[data-completion-cancel]").disabled = current.busy;
    host.querySelector("[data-completion-cancel]").addEventListener("click", cancel);
    host.querySelector("[data-completion-back]")?.addEventListener("click", () => { current.review = null; render(); });
    if (host.querySelector("[data-completion-back]")) host.querySelector("[data-completion-back]").disabled = current.busy;
    host.querySelector("[data-completion-save]").addEventListener("click", () => save(current));
  }

  async function save(current) {
    if (current.busy) return;
    current.busy = true; current.error = ""; render();
    try {
      if (!current.review) {
        const [board, result] = await Promise.all([
          ctx.api(`/api/boards/${current.boardId}`),
          ctx.api(`/api/boards/${current.boardId}/tickets?archived=all`),
        ]);
        if (edit !== current) return;
        if (signature(board.lanes) !== current.baseline) throw new Error("Lane settings changed. Cancel and open Change again to review the latest settings.");
        const expectedLanes = board.lanes.map((lane) => ({ id: lane.id, isCompletionLane: lane.isCompletionLane, ticketCount: result.tickets.filter((ticket) => ticket.laneId === lane.id).length }));
        const changes = board.lanes.filter((lane) => lane.isCompletionLane !== current.selected.has(lane.id)).map((lane) => ({ ...lane, next: current.selected.has(lane.id), count: expectedLanes.find((item) => item.id === lane.id).ticketCount }));
        current.review = { expectedLanes, changes, reopened: changes.filter((lane) => !lane.next).reduce((n, lane) => n + lane.count, 0), resolved: changes.filter((lane) => lane.next).reduce((n, lane) => n + lane.count, 0) };
        if (current.review.reopened || current.review.resolved) return;
      }
      await ctx.sendJson(`/api/boards/${current.boardId}/completion-lanes`, { method: "PUT", body: { laneIds: [...current.selected], expectedLanes: current.review.expectedLanes } });
      if (edit !== current) return;
      edit = null;
      await ctx.refreshBoardDetail();
      ctx.showToast("Completion lanes saved");
    } catch (error) {
      if (edit === current) { current.error = error.message; current.review = null; }
    } finally {
      current.busy = false;
      render();
    }
  }
  return { start, cancel, render };
}
