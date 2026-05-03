import { icon } from "./icons.js";
import { createTicketCommentRenderers } from "./app-ticket-comment-renderers.js";

export function createTicketCommentsModule(ctx) {
  const { state, elements } = ctx;
  let commentStateTimer = null;
  let isCommentComposerOpen = false;
  let expandedRemoteErrorCommentId = null;
  const commentRenderers = createTicketCommentRenderers(ctx, {
    getExpandedRemoteErrorCommentId: () => expandedRemoteErrorCommentId,
  });
  const { humanizeRemoteSyncError, renderComments } = commentRenderers;

  function syncCommentComposer() {
    if (!elements.commentForm || !elements.commentComposeToggle) {
      return;
    }
    elements.commentForm.hidden = !isCommentComposerOpen;
    elements.commentComposeToggle.setAttribute("aria-expanded", String(isCommentComposerOpen));
    elements.commentComposeToggle.innerHTML = isCommentComposerOpen
      ? `${icon("x")}<span>Hide Comment Form</span>`
      : `${icon("plus")}<span>Add Comment</span>`;
    ctx.syncDialogScrollLock?.();
  }

  function toggleCommentComposer() {
    isCommentComposerOpen = !isCommentComposerOpen;
    if (!isCommentComposerOpen) {
      clearCommentState();
    }
    syncCommentComposer();
    if (isCommentComposerOpen) {
      queueMicrotask(() => elements.commentBody?.focus());
    }
  }

  function resetCommentComposer() {
    isCommentComposerOpen = false;
    elements.commentBody.value = "";
    clearCommentState();
    syncCommentComposer();
  }

  function clearCommentState() {
    if (commentStateTimer) {
      window.clearTimeout(commentStateTimer);
      commentStateTimer = null;
    }
    if (!elements.commentSaveState) {
      return;
    }
    elements.commentSaveState.hidden = true;
    elements.commentSaveState.textContent = "";
    elements.commentSaveState.dataset.kind = "";
  }

  function setCommentState(kind, message) {
    if (!elements.commentSaveState) {
      return;
    }
    if (commentStateTimer) {
      window.clearTimeout(commentStateTimer);
      commentStateTimer = null;
    }
    elements.commentSaveState.hidden = false;
    elements.commentSaveState.dataset.kind = kind;
    elements.commentSaveState.textContent = message;
    if (kind === "saved") {
      commentStateTimer = window.setTimeout(() => {
        if (elements.commentSaveState.dataset.kind === "saved") {
          clearCommentState();
        }
      }, 1400);
    }
  }

  async function addComment(event) {
    event?.preventDefault?.();
    if (!state.editingTicketId) {
      return;
    }
    const bodyMarkdown = elements.commentBody.value.trim();
    if (!bodyMarkdown) {
      ctx.showToast("Comment is required", "error");
      return;
    }
    try {
      elements.saveCommentButton.disabled = true;
      await ctx.sendJson(`/api/tickets/${state.editingTicketId}/comments`, {
        method: "POST",
        body: { bodyMarkdown },
      });
      const ticket = await ctx.api(`/api/tickets/${state.editingTicketId}`);
      await ctx.refreshDialogTicket(ticket.id);
      elements.commentBody.value = "";
      await ctx.refreshBoardDetail();
      setCommentState("saved", "Comment saved");
    } catch (error) {
      setCommentState("error", "Save failed");
      ctx.showToast(error.message, "error");
    } finally {
      elements.saveCommentButton.disabled = false;
    }
  }

  async function handleCommentAction(event) {
    const toggleButton = event.target.closest("[data-toggle-comment-actions]");
    if (toggleButton) {
      toggleCommentActions(toggleButton);
      return;
    }

    const editButton = event.target.closest("[data-edit-comment-id]");
    if (editButton) {
      editCommentInline(editButton);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-comment-edit]");
    if (cancelButton) {
      cancelCommentInlineEdit(cancelButton);
      return;
    }

    const saveButton = event.target.closest("[data-save-comment-id]");
    if (saveButton) {
      await saveCommentInline(saveButton);
      return;
    }

    const pushButton = event.target.closest("[data-push-comment-id]");
    if (pushButton) {
      await pushCommentRemote(pushButton);
      return;
    }

    const toggleRemoteErrorButton = event.target.closest("[data-toggle-remote-error-details-id]");
    if (toggleRemoteErrorButton) {
      toggleRemoteErrorDetails(Number(toggleRemoteErrorButton.dataset.toggleRemoteErrorDetailsId));
      return;
    }

    const deleteButton = event.target.closest("[data-delete-comment-id]");
    if (deleteButton) {
      startCommentDeleteConfirm(deleteButton);
      return;
    }

    const cancelDeleteButton = event.target.closest("[data-cancel-comment-delete]");
    if (cancelDeleteButton) {
      cancelCommentDeleteConfirm();
      return;
    }

    const confirmDeleteButton = event.target.closest("[data-confirm-comment-delete-id]");
    if (confirmDeleteButton) {
      await deleteComment(Number(confirmDeleteButton.dataset.confirmCommentDeleteId), confirmDeleteButton);
    }
  }

  function toggleCommentActions(toggleButton) {
    const menu = toggleButton.parentElement?.querySelector(".inline-action-menu");
    if (!menu) {
      return;
    }
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
    toggleButton.setAttribute("aria-expanded", String(!isExpanded));
    menu.hidden = false;
    menu.classList.toggle("expanded", !isExpanded);
    menu.toggleAttribute("inert", isExpanded);
    if (isExpanded) {
      window.setTimeout(() => {
        if (!menu.classList.contains("expanded")) {
          menu.hidden = true;
        }
      }, 180);
    }
  }

  function editCommentInline(editButton) {
    const item = editButton.closest(".comment-item");
    if (!item) {
      return;
    }
    const toggleButton = item.querySelector("[data-toggle-comment-actions]");
    const menu = item.querySelector(".inline-action-menu");
    toggleButton?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("expanded");
    menu?.toggleAttribute("inert", true);
    if (menu) {
      menu.hidden = true;
    }
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
    item.querySelector(".comment-display").hidden = true;
    const form = item.querySelector("[data-comment-edit-form]");
    form.hidden = false;
    form.querySelector("[data-comment-edit-body]")?.focus();
    ctx.syncDialogScrollLock?.();
  }

  function cancelCommentInlineEdit(cancelButton) {
    const item = cancelButton.closest(".comment-item");
    if (!item) {
      return;
    }
    const form = item.querySelector("[data-comment-edit-form]");
    const textarea = item.querySelector("[data-comment-edit-body]");
    if (textarea) {
      textarea.value = textarea.defaultValue;
    }
    form.hidden = true;
    item.querySelector(".comment-display").hidden = false;
    ctx.syncDialogScrollLock?.();
  }

  async function saveCommentInline(saveButton) {
    const item = saveButton.closest(".comment-item");
    const textarea = item?.querySelector("[data-comment-edit-body]");
    const bodyMarkdown = textarea?.value.trim() ?? "";
    if (!bodyMarkdown) {
      ctx.showToast("Comment is required", "error");
      return;
    }
    try {
      saveButton.disabled = true;
      setCommentState("saving", "Saving...");
      await ctx.sendJson(`/api/comments/${saveButton.dataset.saveCommentId}`, {
        method: "PATCH",
        body: { bodyMarkdown },
      });
      await ctx.refreshDialogTicket();
      await ctx.refreshBoardDetail();
      setCommentState("saved", "Saved");
    } catch (error) {
      setCommentState("error", "Save failed");
      ctx.showToast(error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  }

  function startCommentDeleteConfirm(deleteButton) {
    const item = deleteButton.closest(".comment-item");
    if (!item) {
      return;
    }
    state.confirmingCommentDeleteId = Number(deleteButton.dataset.deleteCommentId);
    const toggleButton = item.querySelector("[data-toggle-comment-actions]");
    const menu = item.querySelector(".inline-action-menu");
    toggleButton?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("expanded");
    menu?.toggleAttribute("inert", true);
    if (menu) {
      menu.hidden = true;
    }
    syncCommentDeleteConfirms();
  }

  function cancelCommentDeleteConfirm() {
    state.confirmingCommentDeleteId = null;
    hideCommentDeleteConfirms();
  }

  function syncCommentDeleteConfirms() {
    for (const confirm of elements.ticketComments.querySelectorAll("[data-comment-delete-confirm]")) {
      confirm.hidden = Number(confirm.dataset.commentDeleteConfirm) !== state.confirmingCommentDeleteId;
    }
  }

  function hideCommentDeleteConfirms() {
    for (const confirm of elements.ticketComments.querySelectorAll("[data-comment-delete-confirm]")) {
      confirm.hidden = true;
    }
  }

  async function deleteComment(commentId, deleteButton) {
    try {
      deleteButton.disabled = true;
      setCommentState("saving", "Deleting...");
      await ctx.api(`/api/comments/${commentId}`, { method: "DELETE" });
      state.confirmingCommentDeleteId = null;
      await ctx.refreshDialogTicket();
      await ctx.refreshBoardDetail();
      setCommentState("saved", "Deleted");
    } catch (error) {
      setCommentState("error", "Delete failed");
      ctx.showToast(error.message, "error");
    } finally {
      deleteButton.disabled = false;
    }
  }

  async function pushCommentRemote(pushButton) {
    const commentId = Number(pushButton.dataset.pushCommentId);
    if (!Number.isInteger(commentId)) {
      return;
    }
    try {
      pushButton.disabled = true;
      setCommentState("saving", "Pushing to remote...");
      await ctx.api(`/api/comments/${commentId}/push-remote`, { method: "POST" });
      await ctx.refreshDialogTicket();
      await ctx.refreshBoardDetail();
      expandedRemoteErrorCommentId = null;
      setCommentState("saved", "Pushed to remote");
    } catch (error) {
      await ctx.refreshDialogTicket().catch(() => null);
      await ctx.refreshBoardDetail().catch(() => null);
      setCommentState("error", "Push failed");
      ctx.showToast(humanizeRemoteSyncError(error.message), "error");
    } finally {
      pushButton.disabled = false;
    }
  }

  function toggleRemoteErrorDetails(commentId) {
    if (!Number.isInteger(commentId)) {
      return;
    }
    expandedRemoteErrorCommentId = expandedRemoteErrorCommentId === commentId ? null : commentId;
    elements.ticketComments.innerHTML = renderComments(state.dialogTicket?.comments ?? []);
  }

  return {
    addComment,
    clearCommentState,
    handleCommentAction,
    renderComments,
    resetCommentComposer,
    toggleCommentComposer,
  };
}
