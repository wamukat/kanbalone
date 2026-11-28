import { t } from "./app-i18n.js";
import { createToastModule } from "./app-toast.js";
import { icon } from "./icons.js";

export function createUxModule(ctx) {
  const { state, elements } = ctx;
  const { showToast } = createToastModule(state, elements);

  let onSubmit = null;
  let submitting = false;
  let compositionTarget = null;
  elements.uxDialog.addEventListener("compositionstart", event => { compositionTarget = event.target; });
  const clearComposition = event => { if (event.target === compositionTarget) compositionTarget = null; };
  elements.uxDialog.addEventListener("compositionend", clearComposition);
  elements.uxDialog.addEventListener("focusout", clearComposition);
  elements.uxDialog.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.target === compositionTarget
        || event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || submitting || elements.uxSubmitButton.hidden || elements.uxSubmitButton.disabled) return;
    elements.uxForm.requestSubmit(elements.uxSubmitButton);
  });

  function describeSubmitShortcut() {
    elements.uxSubmitButton.setAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    elements.uxSubmitButton.title = t("{action} (Ctrl/Cmd+Enter)", { action: elements.uxSubmitButton.textContent.trim() });
  }

  elements.uxDialog.addEventListener("cancel", (event) => {
    if (submitting) event.preventDefault();
  });

  async function handleUxSubmit(event) {
    event.preventDefault();
    if (submitting || elements.uxSubmitButton.disabled) return;
    if (!onSubmit) {
      finishUxDialog(true);
      return;
    }

    elements.uxError.hidden = true;
    setSubmitting(true);
    let result;
    try {
      result = await onSubmit();
    } catch (error) {
      elements.uxError.setAttribute("role", "alert");
      elements.uxError.textContent = error.message;
      elements.uxError.hidden = false;
      return;
    } finally {
      setSubmitting(false);
    }

    if (result && typeof result === "object") {
      // A rejected confirmation can become a notice without leaving the dialog.
      onSubmit = null;
      renderConfirmation(result);
      elements.uxDismissButton.focus();
    } else if (result !== false) {
      finishUxDialog(true);
    }
  }

  function setSubmitting(pending) {
    submitting = pending;
    elements.uxSubmitButton.disabled = pending;
    elements.uxDismissButton.disabled = pending;
    elements.uxCancelButton.disabled = pending;
  }

  function finishUxDialog(value) {
    const resolver = state.uxResolver;
    if (!resolver || submitting) return;
    state.uxResolver = null;
    onSubmit = null;
    if (elements.uxDialog.open) {
      elements.uxDialog.close();
    }
    resolver(value);
  }

  function renderConfirmation({ title, message, details = [], warning = "", help = [], submitLabel, cancelLabel, fields = "" }) {
    elements.uxTitle.textContent = title;
    elements.uxMessage.hidden = !message && details.length === 0 && !warning && help.length === 0;
    elements.uxMessage.innerHTML = renderConfirmMessage(message, details, warning, help);
    elements.uxDismissButton.textContent = cancelLabel ?? t(submitLabel ? "Cancel" : "Close");
    elements.uxSubmitButton.hidden = !submitLabel;
    elements.uxSubmitButton.disabled = !submitLabel;
    if (submitLabel) {
      elements.uxSubmitButton.innerHTML = `${icon("trash-2")}<span>${ctx.escapeHtml(submitLabel)}</span>`;
    }
    elements.uxSubmitButton.classList.add("danger", "action-with-icon", "danger-confirm-action");
    elements.uxSubmitButton.classList.remove("primary-action");
    elements.uxError.hidden = true;
    elements.uxFields.innerHTML = fields;
    describeSubmitShortcut();
  }

  function openConfirmDialog({ onSubmit: handler = null, ...content }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      onSubmit = handler;
      setSubmitting(false);
      renderConfirmation(content);
      elements.uxDialog.showModal();
      ctx.prepareUxDialogPosition?.();
      ctx.syncDialogScrollLock?.();
      elements.uxDismissButton.focus();
    });
  }

  function openFormDialog({ title, message = "", fields = "", submitLabel = t("Save"), onSubmit: handler = null }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      onSubmit = handler;
      setSubmitting(false);
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = !message;
      elements.uxMessage.textContent = message;
      elements.uxDismissButton.textContent = t("Cancel");
      elements.uxSubmitButton.hidden = false;
      elements.uxSubmitButton.textContent = submitLabel;
      elements.uxSubmitButton.classList.remove("danger");
      elements.uxSubmitButton.classList.remove("action-with-icon");
      elements.uxSubmitButton.classList.remove("danger-confirm-action");
      elements.uxSubmitButton.classList.add("primary-action");
      elements.uxError.hidden = true;
      elements.uxFields.innerHTML = fields;
      describeSubmitShortcut();
      elements.uxDialog.showModal();
      ctx.prepareUxDialogPosition?.();
      ctx.syncDialogScrollLock?.();
      const first = [...elements.uxFields.querySelectorAll("input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)")].find(element => !element.closest("[hidden], [inert]") && element.getClientRects().length);
      (first ?? elements.uxDismissButton).focus();
    });
  }

  function renderConfirmMessage(message, details, warning, help) {
    return [
      message ? `<span>${ctx.escapeHtml(message)}</span>` : "",
      details.length
        ? `<span class="ux-confirm-section-label">${t("This will delete:")}</span><ul class="ux-confirm-detail-list">${details.map((item) => `<li>${ctx.escapeHtml(item)}</li>`).join("")}</ul>`
        : "",
      warning ? `<strong class="ux-confirm-warning" role="alert">${ctx.escapeHtml(warning)}</strong>` : "",
      ...help.map((text) => `<span class="ux-confirm-help">${ctx.escapeHtml(text)}</span>`),
    ].filter(Boolean).join("");
  }

  async function confirmAndRun({ title, message, details = [], warning = "", submitLabel, cancelLabel, run }) {
    const confirmed = await openConfirmDialog({ title, message, details, warning, submitLabel, cancelLabel });
    if (!confirmed) {
      return false;
    }
    try {
      await run();
      return true;
    } catch (error) {
      showToast(error.message, "error");
      return false;
    }
  }

  return {
    confirmAndRun,
    finishUxDialog,
    handleUxSubmit,
    openFormDialog,
    openConfirmDialog,
    showToast,
  };
}
