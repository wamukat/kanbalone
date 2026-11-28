import { t, getLocale } from "./app-i18n.js";
import { icon } from "./icons.js";

export function createTicketCommentRenderers(ctx, options) {
  const { state } = ctx;

  function renderComments(comments) {
    if (comments.length === 0) {
      return `<p class="muted">${t("No comments yet.")}</p>`;
    }
    return comments
      .map(
        (comment) => {
          const canPushRemote = Boolean(state.dialogTicket?.remote);
          const isPushed = comment.sync?.status === "pushed";
          const isPushing = comment.sync?.status === "pushing";
          const localActions = !isPushed && !isPushing;
          const remoteSync = canPushRemote ? renderRemoteSync(comment) : "";
          return `
          <article class="comment-item" data-comment-id="${comment.id}" tabindex="-1">
            <div class="comment-meta muted">
              <span class="comment-meta-main">
                <time datetime="${ctx.escapeHtml(comment.createdAt)}">${new Date(comment.createdAt).toLocaleString(getLocale())}</time>
                <bdi class="record-updater">${ctx.escapeHtml(comment.updater ?? t("Unrecorded"))}</bdi>
                <span>#${comment.id}</span>
                ${remoteSync}
              </span>
              <span class="comment-actions">
                ${localActions ? `
                  <button type="button" class="ghost icon-button action-menu-toggle" data-toggle-comment-actions title="${t("Comment actions")}" aria-label="${t("Comment actions")}" aria-expanded="false">${icon("ellipsis")}</button>
                  <span class="inline-action-menu" hidden>
                    <button type="button" class="ghost icon-button" data-edit-comment-id="${comment.id}" title="${t("Edit comment")}" aria-label="${t("Edit comment")}">${icon("pencil")}</button>
                    <button type="button" class="ghost icon-button danger" data-delete-comment-id="${comment.id}" title="${t("Delete comment")}" aria-label="${t("Delete comment")}">${icon("trash-2")}</button>
                  </span>
                ` : ""}
                <span class="comment-delete-confirm" data-comment-delete-confirm="${comment.id}" ${localActions && state.confirmingCommentDeleteId === comment.id ? "" : "hidden"}>
                  <span>${t("Delete this comment?")}</span>
                  <button type="button" class="ghost" data-cancel-comment-delete>${t("Cancel")}</button>
                  <button type="button" class="danger action-with-icon danger-confirm-action" aria-keyshortcuts="Control+Enter Meta+Enter" title="${ctx.escapeHtml(t("{action} (Ctrl/Cmd+Enter)", { action: t("Delete") }))}" data-confirm-comment-delete-id="${comment.id}">${icon("trash-2")}<span>${t("Delete")}</span></button>
                </span>
              </span>
            </div>
            <div class="markdown comment-display">${comment.bodyHtml}</div>
            <form class="comment-edit-form" data-comment-edit-form hidden>
              <textarea data-comment-edit-body rows="5" aria-label="${t("Comment")}">${ctx.escapeHtml(comment.bodyMarkdown)}</textarea>
              <div class="comment-edit-actions">
                <button type="button" class="ghost" data-cancel-comment-edit>${t("Cancel")}</button>
                <button type="button" class="primary-action" aria-keyshortcuts="Control+Enter Meta+Enter" title="${t("Save (Ctrl/Cmd+Enter)")}" data-save-comment-id="${comment.id}">${t("Save")}</button>
              </div>
            </form>
          </article>
        `;
        },
      )
      .join("");
  }

  function renderRemoteSync(comment) {
    if (comment.sync?.status === "pushed") {
      return `<span class="comment-sync-pill comment-sync-pill-pushed">${icon("upload")}<span>${t("Pushed")}</span></span>`;
    }
    if (comment.sync?.status === "pushing") {
      return `<span class="comment-sync-pill comment-sync-pill-pushing">${icon("loader-circle")}<span>${t("Pushing")}</span></span>`;
    }
    if (comment.sync?.status === "push_failed") {
      const details = renderRemoteSyncErrorDetails(comment);
      const expanded = options.getExpandedRemoteErrorCommentId() === comment.id;
      return `
        <button
          type="button"
          class="ghost comment-sync-pill comment-sync-pill-failed comment-sync-failed-toggle"
          data-toggle-remote-error-details-id="${comment.id}"
          aria-expanded="${String(expanded)}"
        >${icon("circle-alert")}<span>${t("Push failed")}</span></button>
        <button type="button" class="ghost comment-sync-action" data-push-comment-id="${comment.id}">${t("Retry push")}</button>
        ${details}
      `;
    }
    return `<button type="button" class="ghost comment-sync-action" data-push-comment-id="${comment.id}">${t("Push to remote")}</button>`;
  }

  function renderRemoteSyncErrorDetails(comment) {
    const rawError = comment.sync?.lastError?.trim();
    if (!rawError) {
      return "";
    }
    const expanded = options.getExpandedRemoteErrorCommentId() === comment.id;
    const summary = humanizeRemoteSyncError(rawError);
    return `
      <div class="comment-sync-error-details" ${expanded ? "" : "hidden"}>
        <div class="comment-sync-error-summary">${ctx.escapeHtml(summary)}</div>
        ${summary === rawError ? "" : `<pre class="comment-sync-error-raw">${ctx.escapeHtml(rawError)}</pre>`}
      </div>
    `;
  }

  return {
    humanizeRemoteSyncError,
    renderComments,
  };
}

export function humanizeRemoteSyncError(message) {
  if (/403/i.test(message) && /Resource not accessible by personal access token/i.test(message)) {
    return t("GitHub token does not have permission to post comments to this repository or issue.");
  }
  if (/401/i.test(message) || /Bad credentials/i.test(message)) {
    return t("Remote provider authentication failed. Check the configured token.");
  }
  if (/404/i.test(message) && /GitHub request failed/i.test(message)) {
    return t("The remote issue or repository could not be found with the current token.");
  }
  return message;
}
