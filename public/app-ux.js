import { t } from "./app-i18n.js";
import { createToastModule } from "./app-toast.js";
import { icon } from "./icons.js";

export function createUxModule(ctx) {
  const { state, elements } = ctx;
  const { showToast } = createToastModule(state, elements);

  let onSubmit = null;
  let submitting = false;

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

  function renderConfirmation({ title, message, details = [], warning = "", help = [], submitLabel }) {
    elements.uxTitle.textContent = title;
    elements.uxMessage.hidden = !message && details.length === 0 && !warning && help.length === 0;
    elements.uxMessage.innerHTML = renderConfirmMessage(message, details, warning, help);
    elements.uxDismissButton.textContent = t(submitLabel ? "Cancel" : "Close");
    elements.uxSubmitButton.hidden = !submitLabel;
    elements.uxSubmitButton.disabled = !submitLabel;
    if (submitLabel) {
      elements.uxSubmitButton.innerHTML = `${icon("trash-2")}<span>${ctx.escapeHtml(submitLabel)}</span>`;
    }
    elements.uxSubmitButton.classList.add("danger", "action-with-icon", "danger-confirm-action");
    elements.uxSubmitButton.classList.remove("primary-action");
    elements.uxError.hidden = true;
    elements.uxFields.innerHTML = "";
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
      if (!content.submitLabel || handler) elements.uxDismissButton.focus();
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
      elements.uxDialog.showModal();
      ctx.prepareUxDialogPosition?.();
      ctx.syncDialogScrollLock?.();
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

  async function confirmAndRun({ title, message, details = [], warning = "", submitLabel, run }) {
    const confirmed = await openConfirmDialog({ title, message, details, warning, submitLabel });
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
