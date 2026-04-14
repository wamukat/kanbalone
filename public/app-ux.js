import { createToastModule } from "./app-toast.js";
import { icon } from "./icons.js";

export function createUxModule(ctx) {
  const { state, elements } = ctx;
  const { showToast } = createToastModule(state, elements);

  function handleUxSubmit(event) {
    event.preventDefault();
    finishUxDialog(true);
  }

  function finishUxDialog(value) {
    const resolver = state.uxResolver;
    if (!resolver) {
      return;
    }
    state.uxResolver = null;
    if (elements.uxDialog.open) {
      elements.uxDialog.close();
    }
    resolver(value);
  }

  function openConfirmDialog({ title, message, details = [], warning = "", submitLabel }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = !message && details.length === 0 && !warning;
      elements.uxMessage.innerHTML = renderConfirmMessage(message, details, warning);
      elements.uxSubmitButton.innerHTML = `${icon("trash-2")}<span>${ctx.escapeHtml(submitLabel)}</span>`;
      elements.uxSubmitButton.classList.add("danger");
      elements.uxSubmitButton.classList.add("action-with-icon");
      elements.uxSubmitButton.classList.add("danger-confirm-action");
      elements.uxSubmitButton.classList.remove("primary-action");
      elements.uxError.hidden = true;
      elements.uxFields.innerHTML = "";
      elements.uxDialog.showModal();
      ctx.syncDialogScrollLock?.();
    });
  }

  function renderConfirmMessage(message, details, warning) {
    return [
      message ? `<span>${ctx.escapeHtml(message)}</span>` : "",
      details.length
        ? `<span class="ux-confirm-section-label">This will delete:</span><ul class="ux-confirm-detail-list">${details.map((item) => `<li>${ctx.escapeHtml(item)}</li>`).join("")}</ul>`
        : "",
      warning ? `<strong class="ux-confirm-warning">${ctx.escapeHtml(warning)}</strong>` : "",
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
    showToast,
  };
}
