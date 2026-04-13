import { icon } from "./icons.js";
import { createToastModule } from "./app-toast.js";
import {
  bindUxColorFieldInteractions,
  getUxColorFieldValue,
  isHexColor,
  isUxColorNoneSelected,
  renderUxColorField,
} from "./app-ux-color-field.js";

export function createUxModule(ctx) {
  const { state, elements } = ctx;
  const { showToast } = createToastModule(state, elements);

  function handleUxSubmit(event) {
    event.preventDefault();
    if (state.uxMode === "confirm") {
      finishUxDialog(true);
      return;
    }
    const fields = [...elements.uxFields.querySelectorAll("[data-field-id]")];
    const missing = fields.find((input) => input.required && !isUxColorNoneSelected(input, elements.uxFields) && !input.value.trim());
    if (missing) {
      const label = getUxFieldLabel(missing);
      elements.uxError.hidden = false;
      elements.uxError.textContent = `${label} is required`;
      return;
    }
    const invalidColor = fields.find((input) => input.dataset.fieldType === "color" && !isUxColorNoneSelected(input, elements.uxFields) && !isHexColor(input.value.trim()));
    if (invalidColor) {
      const label = getUxFieldLabel(invalidColor);
      elements.uxError.hidden = false;
      elements.uxError.textContent = `${label} must be a HEX color like #1f6f5f`;
      return;
    }
    const values = Object.fromEntries(
      fields.map((input) => [
        input.dataset.fieldId,
        input.dataset.fieldType === "color" ? getUxColorFieldValue(input, elements.uxFields) : input.value.trim(),
      ]),
    );
    finishUxDialog({ action: "submit", values });
  }

  function handleUxDanger() {
    finishUxDialog({ action: "danger" });
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

  function openUxDialog({ title, message = "", submitLabel, fields, dangerLabel = "" }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      state.uxMode = "form";
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = !message;
      elements.uxMessage.textContent = message;
      elements.uxSubmitButton.textContent = submitLabel;
      elements.uxDangerButton.hidden = !dangerLabel;
      elements.uxDangerButton.innerHTML = `${icon("trash-2")}<span>${ctx.escapeHtml(dangerLabel || "Delete")}</span>`;
      elements.uxSubmitButton.classList.remove("danger");
      elements.uxSubmitButton.classList.add("primary-action");
      elements.uxSubmitButton.classList.remove("action-with-icon");
      elements.uxSubmitButton.classList.remove("danger-confirm-action");
      elements.uxError.hidden = true;
      elements.uxError.textContent = "";
      elements.uxFields.innerHTML = fields.map(renderUxField).join("");
      bindUxFieldInteractions();

      elements.uxDialog.showModal();
      ctx.syncDialogScrollLock?.();
      const firstInput = elements.uxFields.querySelector("input, textarea");
      firstInput?.focus();
    });
  }

  function renderUxField(field) {
    if (field.type === "textarea") {
      return `
        <label>
          ${ctx.escapeHtml(field.label)}
          <textarea
            data-field-id="${ctx.escapeHtml(field.id)}"
            rows="${ctx.escapeHtml(field.rows ?? 6)}"
            ${field.required ? "required" : ""}
          >${ctx.escapeHtml(field.value ?? "")}</textarea>
        </label>
      `;
    }
    if (field.type === "color") {
      return renderUxColorField(field, ctx.escapeHtml);
    }
    return `
      <label>
        ${ctx.escapeHtml(field.label)}
        <input
          data-field-id="${ctx.escapeHtml(field.id)}"
          type="${ctx.escapeHtml(field.type ?? "text")}"
          value="${ctx.escapeHtml(field.value ?? "")}"
          ${field.required ? "required" : ""}
        />
      </label>
    `;
  }

  function bindUxFieldInteractions() {
    bindUxColorFieldInteractions(elements.uxFields);
  }

  function getUxFieldLabel(input) {
    return input.dataset.fieldLabel
      ?? input.closest("label")?.childNodes?.[0]?.textContent?.trim()
      ?? "Field";
  }

  function requestFields(config) {
    return openUxDialog(config).then((result) => (result?.action === "submit" ? result.values : null));
  }

  function requestFieldsAction(config) {
    return openUxDialog(config);
  }

  function openConfirmDialog({ title, message, submitLabel }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      state.uxMode = "confirm";
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = false;
      elements.uxMessage.textContent = message;
      elements.uxSubmitButton.innerHTML = `${icon("trash-2")}<span>${ctx.escapeHtml(submitLabel)}</span>`;
      elements.uxSubmitButton.classList.add("danger");
      elements.uxSubmitButton.classList.add("action-with-icon");
      elements.uxSubmitButton.classList.add("danger-confirm-action");
      elements.uxSubmitButton.classList.remove("primary-action");
      elements.uxDangerButton.hidden = true;
      elements.uxError.hidden = true;
      elements.uxFields.innerHTML = "";
      elements.uxDialog.showModal();
      ctx.syncDialogScrollLock?.();
    });
  }

  async function confirmAndRun({ title, message, submitLabel, run }) {
    const confirmed = await openConfirmDialog({ title, message, submitLabel });
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
    handleUxDanger,
    handleUxSubmit,
    requestFields,
    requestFieldsAction,
    showToast,
  };
}
