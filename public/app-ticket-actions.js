export function createTicketActionsModule(ctx, options) {
  const { state, elements } = ctx;
  let saveStateTimer = null;

  function clearSaveState() {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
      saveStateTimer = null;
    }
    elements.editorSaveState.hidden = true;
    elements.editorSaveState.textContent = "";
    elements.editorSaveState.dataset.kind = "";
  }

  function setSaveState(kind, message) {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
      saveStateTimer = null;
    }
    elements.editorSaveState.hidden = false;
    elements.editorSaveState.dataset.kind = kind;
    elements.editorSaveState.textContent = message;
    if (kind === "saved") {
      saveStateTimer = window.setTimeout(() => {
        if (elements.editorSaveState.dataset.kind === "saved") {
          clearSaveState();
        }
      }, 1400);
    }
  }

  async function saveTicket(event) {
    event.preventDefault();
    if (!state.activeBoardId) {
      return;
    }
    const tagIds = options.getSelectedTagIds();
    const blockerIds = [...state.editorBlockerIds];
    const nextParentTicketId = elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
    const payload = {
      title: elements.ticketTitle.value.trim(),
      laneId: Number(elements.ticketLane.value),
      parentTicketId: nextParentTicketId,
      priority: Number(elements.ticketPriority.value || 0),
      isResolved: elements.ticketResolved.checked,
      bodyMarkdown: elements.ticketBody.value,
      tagIds,
      blockerIds,
    };
    const endpoint = state.editingTicketId
      ? `/api/tickets/${state.editingTicketId}`
      : `/api/boards/${state.activeBoardId}/tickets`;
    const method = state.editingTicketId ? "PATCH" : "POST";
    const editingTicketId = state.editingTicketId;
    try {
      if (editingTicketId && nextParentTicketId != null && state.editorOriginalChildIds.length > 0) {
        for (const childId of state.editorOriginalChildIds) {
          await ctx.sendJson(`/api/tickets/${childId}`, {
            method: "PATCH",
            body: { parentTicketId: null },
          });
        }
      }
      setSaveState("saving", "Saving...");
      const savedTicket = await ctx.api(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (editingTicketId) {
        if (nextParentTicketId == null) {
          const originalChildIds = new Set(state.editorOriginalChildIds);
          const nextChildIds = new Set(state.editorChildIds);
          for (const childId of state.editorOriginalChildIds) {
            if (!nextChildIds.has(childId)) {
              await ctx.sendJson(`/api/tickets/${childId}`, {
                method: "PATCH",
                body: { parentTicketId: null },
              });
            }
          }
          for (const childId of state.editorChildIds) {
            if (!originalChildIds.has(childId)) {
              await ctx.sendJson(`/api/tickets/${childId}`, {
                method: "PATCH",
                body: { parentTicketId: editingTicketId },
              });
            }
          }
        }
        await options.refreshDialogTicket(editingTicketId);
        state.editorOriginalChildIds = [...state.editorChildIds];
        options.setDialogMode("view");
        setSaveState("saved", "Saved");
      } else {
        options.closeEditor();
        ctx.showToast("Ticket created");
      }
      await ctx.refreshBoardDetail();
      return savedTicket;
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
      return null;
    }
  }

  async function toggleTicketArchive() {
    if (!state.editingTicketId) {
      return;
    }
    try {
      const current = await ctx.api(`/api/tickets/${state.editingTicketId}`);
      setSaveState("saving", current.isArchived ? "Restoring..." : "Archiving...");
      await ctx.sendJson(`/api/tickets/${state.editingTicketId}`, {
        method: "PATCH",
        body: { isArchived: !current.isArchived },
      });
      await ctx.refreshBoardDetail();
      if (!current.isArchived && !state.filters.status.includes("archived")) {
        options.closeEditor();
        ctx.showToast("Archived");
        return;
      }
      await options.refreshDialogTicket(state.editingTicketId);
      setSaveState("saved", current.isArchived ? "Restored" : "Archived");
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
    }
  }

  async function deleteTicket() {
    if (!state.editingTicketId) {
      return;
    }
    const ticketId = state.editingTicketId;
    await ctx.confirmAndRun({
      title: "Delete Ticket",
      message: "Delete this ticket?",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        options.closeEditor();
        await ctx.refreshBoardDetail();
      },
    });
  }

  return {
    clearSaveState,
    deleteTicket,
    saveTicket,
    setSaveState,
    toggleTicketArchive,
  };
}
