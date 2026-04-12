import { icon } from "./icons.js";

export function createUxModule(ctx) {
  const { state, elements } = ctx;

  function handleUxSubmit(event) {
    event.preventDefault();
    if (state.uxMode === "confirm") {
      finishUxDialog(true);
      return;
    }
    const fields = [...elements.uxFields.querySelectorAll("[data-field-id]")];
    const missing = fields.find((input) => input.required && !isColorNoneSelected(input) && !input.value.trim());
    if (missing) {
      const label = getUxFieldLabel(missing);
      elements.uxError.hidden = false;
      elements.uxError.textContent = `${label} is required`;
      return;
    }
    const invalidColor = fields.find((input) => input.dataset.fieldType === "color" && !isColorNoneSelected(input) && !isHexColor(input.value.trim()));
    if (invalidColor) {
      const label = getUxFieldLabel(invalidColor);
      elements.uxError.hidden = false;
      elements.uxError.textContent = `${label} must be a HEX color like #1f6f5f`;
      return;
    }
    const values = Object.fromEntries(
      fields.map((input) => [
        input.dataset.fieldId,
        input.dataset.fieldType === "color" ? getColorFieldValue(input) : input.value.trim(),
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
      const fieldId = ctx.escapeHtml(field.id);
      const inputId = `ux-field-${fieldId}`;
      const hexValue = normalizeHexColor(field.value);
      const pickerValue = hexValue || "#000000";
      const colorEnabled = !field.allowNone || (field.enabled ?? Boolean(hexValue));
      const noColorClass = colorEnabled ? "" : " is-color-none";
      return `
        <div class="ux-field ux-color-field">
          <label for="${inputId}">${ctx.escapeHtml(field.label)}</label>
          <span class="ux-color-row">
            ${field.allowNone ? `
              <label class="ux-color-enable-switch" title="Use color">
                <input
                  class="toggle-switch-input"
                  data-color-enabled-for="${fieldId}"
                  type="checkbox"
                  aria-label="Use color"
                  ${colorEnabled ? "checked" : ""}
                />
                <span class="toggle-switch-control" aria-hidden="true">
                  <span class="toggle-switch-knob"></span>
                </span>
              </label>
            ` : "<span></span>"}
            <input
              id="${inputId}"
              data-field-id="${fieldId}"
              data-field-label="${ctx.escapeHtml(field.label)}"
              data-field-type="color"
              type="text"
              value="${ctx.escapeHtml(hexValue)}"
              placeholder="#1f6f5f"
              spellcheck="false"
              ${colorEnabled ? "" : "disabled"}
              ${field.required ? "required" : ""}
            />
            <span class="ux-color-picker-cell${noColorClass}">
              <input
                data-color-picker-for="${fieldId}"
                type="color"
                value="${ctx.escapeHtml(pickerValue)}"
                aria-label="${ctx.escapeHtml(field.label)} picker"
                ${colorEnabled ? "" : "disabled"}
              />
              <span class="ux-color-none-preview" aria-hidden="true"></span>
            </span>
          </span>
        </div>
      `;
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
    elements.uxFields.querySelectorAll("[data-color-picker-for]").forEach((picker) => {
      const fieldId = picker.dataset.colorPickerFor;
      const hexInput = elements.uxFields.querySelector(`[data-field-id="${CSS.escape(fieldId)}"][data-field-type="color"]`);
      if (!hexInput) {
        return;
      }
      hexInput.addEventListener("input", () => {
        const value = normalizeHexColor(hexInput.value);
        if (value) {
          picker.value = value;
        }
      });
      hexInput.addEventListener("blur", () => {
        const value = normalizeHexColor(hexInput.value);
        if (value) {
          hexInput.value = value;
          picker.value = value;
        }
      });
      picker.addEventListener("input", () => {
        hexInput.value = normalizeHexColor(picker.value) || picker.value;
      });
      const colorToggle = elements.uxFields.querySelector(`[data-color-enabled-for="${CSS.escape(fieldId)}"]`);
      colorToggle?.addEventListener("change", () => {
        syncColorEnabledState(hexInput, picker, colorToggle);
      });
      if (colorToggle) {
        syncColorEnabledState(hexInput, picker, colorToggle);
      }
    });
  }

  function syncColorEnabledState(hexInput, picker, colorToggle) {
    const isEnabled = colorToggle.checked;
    const pickerCell = picker.closest(".ux-color-picker-cell");
    hexInput.disabled = !isEnabled;
    picker.disabled = !isEnabled;
    pickerCell?.classList.toggle("is-color-none", !isEnabled);
    if (!isEnabled) {
      return;
    }
    const value = normalizeHexColor(hexInput.value) || normalizeHexColor(picker.value) || "#000000";
    picker.value = value;
  }

  function getColorFieldValue(input) {
    return isColorEnabled(input) ? normalizeHexColor(input.value) : "";
  }

  function getUxFieldLabel(input) {
    return input.dataset.fieldLabel
      ?? input.closest("label")?.childNodes?.[0]?.textContent?.trim()
      ?? "Field";
  }

  function isColorNoneSelected(input) {
    return input.dataset.fieldType === "color" && !isColorEnabled(input);
  }

  function isColorEnabled(input) {
    if (input.dataset.fieldType !== "color") {
      return true;
    }
    const colorToggle = elements.uxFields.querySelector(`[data-color-enabled-for="${CSS.escape(input.dataset.fieldId)}"]`);
    return colorToggle ? colorToggle.checked : true;
  }

  function normalizeHexColor(value) {
    const trimmed = String(value ?? "").trim();
    return isHexColor(trimmed) ? trimmed.toLowerCase() : "";
  }

  function isHexColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "").trim());
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

  function showToast(message, kind = "info") {
    elements.toast.textContent = message;
    elements.toast.dataset.kind = kind;
    elements.toast.hidden = false;
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
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
