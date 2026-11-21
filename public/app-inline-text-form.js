export function createInlineTextForm({
  className,
  html,
  inputSelector,
  onSubmit,
  onCancel,
  cancelOnFocusOut = "empty",
}) {
  const form = document.createElement("form");
  form.className = className;
  form.innerHTML = html;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await onSubmit(form.querySelector(inputSelector));
  });
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    onCancel();
  });
  form.addEventListener("focusout", (event) => {
    // Language selection may open a discard confirmation. Keep this draft until
    // that choice is made, rather than cancelling it as the selector takes focus.
    if (event.relatedTarget === document.querySelector("#language-select")) return;
    window.setTimeout(() => {
      const input = form.querySelector(inputSelector);
      if (
        !form.contains(document.activeElement)
        && (cancelOnFocusOut === "always" || !input?.value.trim())
      ) {
        onCancel();
      }
    });
  });

  requestAnimationFrame(() => {
    form.querySelector(inputSelector)?.focus();
  });

  return form;
}
