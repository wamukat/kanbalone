import { t } from "./app-i18n.js";

// Session-only shortcuts; the server's persisted generation guards the actual
// mutation. Never reuse a notification's identity for a newer operation.
export function createArchiveRecovery(ctx, options) {
  const { state, elements } = ctx;
  const region = document.createElement("div");
  region.className = "archive-recovery-region";
  region.setAttribute("aria-label", t("Archive notifications"));
  const announcement = document.createElement("span");
  announcement.className = "sr-only";
  announcement.setAttribute("role", "status");
  region.append(announcement);
  document.body.append(region);
  const entries = [];
  const announce = text => { announcement.textContent = text; };
  const fallback = () => {
    if (elements.editorDialog.open) elements.headerEditButton?.focus();
    else {
      const candidates = [elements.searchInput, elements.groupBoard.querySelector('[data-group-action="new-ticket"]'),
        elements.groupBoard.querySelector('[data-select-group][aria-current="true"]'), elements.sidebarToggleButton];
      candidates.find(element => element?.getClientRects().length && !element.closest("[hidden], [inert]"))?.focus();
    }
  };
  function remove(entry, restore = false) {
    const index = entries.indexOf(entry);
    if (index < 0) return;
    entries.splice(index, 1);
    entry.node.remove();
    if (restore) fallback();
    syncHost();
  }
  function syncHost() {
    // Only the ticket editor gets actionable notices inside its top layer.
    // A nested confirmation/import dialog pauses and hides these actions.
    const modal = [...document.querySelectorAll("dialog[open]")].some(dialog => dialog !== elements.editorDialog);
    const blocked = modal || state.editorSaving || elements.editorForm.inert;
    const host = elements.editorDialog.open ? elements.editorDialog : document.body;
    if (region.parentElement !== host) host.append(region);
    region.hidden = blocked || entries.length === 0;
    document.body.classList.toggle("has-archive-recovery", entries.length > 0 && !blocked);
    return blocked;
  }
  function paint(entry) {
    entry.node.dataset.kind = ["error", "conflict", "refresh"].includes(entry.kind) ? "error" : "info";
    entry.status.textContent = entry.busy ? t("Restoring...") : {
      undo: t("Archived"), restored: t("Restored"), error: t("Could not restore this ticket."),
      conflict: t("This ticket changed. Review it before restoring."),
      refresh: t("Ticket restored, but the view could not refresh. Reload to continue."),
      missing: t("This ticket no longer exists."),
    }[entry.kind];
    entry.action.hidden = ["restored", "refresh", "missing"].includes(entry.kind);
    entry.action.textContent = entry.kind === "error" ? t("Retry") : entry.kind === "conflict" ? t("Review") : t("Undo");
    entry.action.setAttribute("aria-label", `${entry.action.textContent}: ${entry.ref} ${entry.title}`);
    entry.action.disabled = entry.busy;
    entry.dismiss.disabled = entry.busy;
    syncHost();
  }
  async function run(entry) {
    if (entry.busy || !entries.includes(entry)) return;
    if (entry.kind === "conflict") {
      try { await options.review(entry.id); }
      catch (error) { ctx.showToast(error.message, "error"); }
      return;
    }
    const startedWithFocus = entry.node.contains(document.activeElement);
    entry.busy = true;
    paint(entry);
    const boardId = state.activeBoardId;
    const context = () => JSON.stringify([state.activeBoardId, state.viewMode, state.filters,
      window.location.pathname, elements.groupBoard.querySelector('[data-select-group][aria-current="true"]')?.dataset.selectGroup]);
    const origin = context();
    const sameView = () => context() === origin;
    const release = ctx.deferBoardUpdatesDuringCreationRefresh?.(boardId);
    let restored = false;
    try {
      await ctx.sendJson(`/api/tickets/${entry.id}/archive`, { method: "PATCH", body: {
        isArchived: false, expectedArchiveVersion: entry.version, expectedBoardId: entry.boardId,
      } });
      restored = true;
    } catch (error) {
      // A lost response can mean the write succeeded. Read the authoritative
      // state, but never retry by toggling what a later GET happens to return.
      if (error.status === 404) entry.kind = "missing";
      else {
        try {
          const latest = await ctx.api(`/api/tickets/${entry.id}`);
          if (!latest.isArchived) restored = true;
          else if (latest.archiveVersion !== entry.version || latest.boardId !== entry.boardId) entry.kind = "conflict";
          else entry.kind = "error";
        } catch (readError) { entry.kind = readError.status === 404 ? "missing" : "error"; }
      }
      entry.remaining = Infinity;
    }
    if (restored) {
      entry.kind = "restored";
      entry.remaining = 3500;
      try {
        if (sameView() && boardId === entry.boardId) {
          await ctx.refreshBoardDetail();
          if (sameView() && elements.editorDialog.open && state.editingTicketId === entry.id) {
            await options.refresh(entry.id);
          }
        }
      } catch {
        entry.kind = "refresh";
        entry.remaining = Infinity;
      }
    }
    entry.busy = false;
    if (!entries.includes(entry)) { release?.(); return; }
    const actionHadFocus = startedWithFocus && (document.activeElement === document.body || entry.node.contains(document.activeElement));
    paint(entry);
    announce(`${entry.ref} ${entry.title}: ${entry.status.textContent}`);
    if (restored && sameView() && actionHadFocus) {
      if (elements.editorDialog.open) fallback();
      else if (boardId === entry.boardId) ctx.focusRecoveredTicket?.(entry.id);
      else fallback();
    }
    release?.();
  }
  function offer(ticket) {
    // A newer archive of the same ticket replaces the obsolete shortcut.
    for (const old of [...entries]) if (old.id === ticket.id) remove(old);
    if (entries.length === 3) {
      const victim = entries.find(entry => !entry.busy && !entry.node.contains(document.activeElement));
      // Do not evict an in-flight action or a keyboard user. If all slots are
      // protected, the existing archived-ticket restore path remains available.
      if (!victim) return;
      remove(victim);
    }
    const node = document.createElement("section");
    node.className = "archive-recovery";
    node.dataset.ticketId = String(ticket.id);
    const copy = document.createElement("div");
    copy.className = "archive-recovery-copy";
    const status = document.createElement("div"); status.className = "archive-recovery-status";
    const title = document.createElement("div"); title.className = "archive-recovery-title";
    title.textContent = `${ticket.shortRef} ${ticket.title}`; title.title = title.textContent;
    const action = document.createElement("button"); action.type = "button"; action.className = "archive-recovery-action";
    const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.className = "archive-recovery-dismiss";
    dismiss.textContent = "×"; dismiss.setAttribute("aria-label", `${t("Dismiss notification")}: ${ticket.shortRef}`);
    copy.append(status, title); node.append(copy, action, dismiss); region.append(node);
    const entry = { id: ticket.id, boardId: ticket.boardId, version: ticket.archiveVersion, ref: ticket.shortRef,
      title: ticket.title, node, status, action, dismiss, kind: "undo", busy: false, remaining: 20000, hover: false };
    entries.push(entry);
    node.addEventListener("pointerenter", () => { entry.hover = true; });
    node.addEventListener("pointerleave", () => { entry.hover = false; });
    action.addEventListener("click", () => { void run(entry); });
    dismiss.addEventListener("click", () => remove(entry, true));
    node.addEventListener("keydown", event => {
      if (event.key === "Escape" && !entry.busy) { event.preventDefault(); event.stopPropagation(); remove(entry, true); }
    });
    paint(entry);
    announce(`${entry.ref} ${entry.title}: ${t("Archived")}. ${t("Undo")}`);
  }
  let previous = performance.now();
  document.addEventListener("visibilitychange", () => { previous = performance.now(); });
  window.setInterval(() => {
    const now = performance.now(); const elapsed = now - previous; previous = now;
    const blocked = syncHost();
    for (const entry of [...entries]) {
      if (blocked || document.hidden || entry.busy || entry.hover || entry.node.contains(document.activeElement)) continue;
      entry.remaining -= elapsed;
      if (entry.remaining <= 0) remove(entry);
    }
  }, 250);
  return { offer };
}
