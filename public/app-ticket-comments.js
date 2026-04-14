import { icon } from "./icons.js";

export function createTicketCommentsModule(ctx) {
  const { state, elements } = ctx;
  let commentStateTimer = null;

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

  function renderComments(comments) {
    if (comments.length === 0) {
      return '<p class="muted">No comments yet.</p>';
    }
    return comments
      .map(
        (comment) => `
          <article class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-meta muted">
              <span>#${comment.id} ${new Date(comment.createdAt).toLocaleString()}</span>
              <span class="comment-actions">
                <button type="button" class="ghost icon-button action-menu-toggle" data-toggle-comment-actions title="Comment actions" aria-label="Comment actions" aria-expanded="false">${icon("ellipsis")}</button>
                <span class="inline-action-menu" hidden>
                  <button type="button" class="ghost icon-button" data-edit-comment-id="${comment.id}" title="Edit comment" aria-label="Edit comment">${icon("pencil")}</button>
                  <button type="button" class="ghost icon-button danger" data-delete-comment-id="${comment.id}" title="Delete comment" aria-label="Delete comment">${icon("trash-2")}</button>
                </span>
                <span class="comment-delete-confirm" data-comment-delete-confirm="${comment.id}" ${state.confirmingCommentDeleteId === comment.id ? "" : "hidden"}>
                  <span>Delete this comment?</span>
                  <button type="button" class="ghost" data-cancel-comment-delete>Cancel</button>
                  <button type="button" class="danger action-with-icon danger-confirm-action" data-confirm-comment-delete-id="${comment.id}">${icon("trash-2")}<span>Delete</span></button>
                </span>
              </span>
            </div>
            <div class="markdown comment-display">${comment.bodyHtml}</div>
            <form class="comment-edit-form" data-comment-edit-form hidden>
              <textarea data-comment-edit-body rows="5" aria-label="Comment">${ctx.escapeHtml(comment.bodyMarkdown)}</textarea>
              <div class="comment-edit-actions">
                <button type="button" class="ghost" data-cancel-comment-edit>Cancel</button>
                <button type="button" class="primary-action" data-save-comment-id="${comment.id}">Save</button>
              </div>
            </form>
          </article>
        `,
      )
      .join("");
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

  return {
    addComment,
    clearCommentState,
    handleCommentAction,
    renderComments,
  };
}
