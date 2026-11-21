import { translateError } from "./app-i18n.js";
export function createToastModule(state, elements) {
  function showToast(message, kind = "info") {
    elements.toast.textContent = kind === "error" ? translateError(message) : message;
    elements.toast.dataset.kind = kind;
    elements.toast.hidden = false;
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  return { showToast };
}
