export function renderUxColorField(field, escapeHtml) {
  const fieldId = escapeHtml(field.id);
  const inputId = `ux-field-${fieldId}`;
  const hexValue = normalizeHexColor(field.value);
  const pickerValue = hexValue.toLowerCase() || "#000000";
  const colorEnabled = !field.allowNone || (field.enabled ?? Boolean(hexValue));
  const noColorClass = colorEnabled ? "" : " is-color-none";
  return `
    <div class="ux-field ux-color-field">
      <label for="${inputId}">${escapeHtml(field.label)}</label>
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
          data-field-label="${escapeHtml(field.label)}"
          data-field-type="color"
          type="text"
          value="${escapeHtml(hexValue)}"
          placeholder="#1F6F5F"
          spellcheck="false"
          ${colorEnabled ? "" : "disabled"}
          ${field.required ? "required" : ""}
        />
        <span class="ux-color-picker-cell${noColorClass}">
          <input
            data-color-picker-for="${fieldId}"
            type="color"
            value="${escapeHtml(pickerValue)}"
            aria-label="${escapeHtml(field.label)} picker"
            ${colorEnabled ? "" : "disabled"}
          />
          <span class="ux-color-none-preview" aria-hidden="true"></span>
        </span>
      </span>
    </div>
  `;
}

export function bindUxColorFieldInteractions(container) {
  container.querySelectorAll("[data-color-picker-for]").forEach((picker) => {
    const fieldId = picker.dataset.colorPickerFor;
    const hexInput = container.querySelector(`[data-field-id="${CSS.escape(fieldId)}"][data-field-type="color"]`);
    if (!hexInput) {
      return;
    }
    hexInput.addEventListener("input", () => {
      const value = normalizeHexColor(hexInput.value);
      if (value) {
        picker.value = value.toLowerCase();
      }
    });
    hexInput.addEventListener("blur", () => {
      const value = normalizeHexColor(hexInput.value);
      if (value) {
        hexInput.value = value;
        picker.value = value.toLowerCase();
      }
    });
    picker.addEventListener("input", () => {
      hexInput.value = normalizeHexColor(picker.value) || picker.value;
    });
    const colorToggle = container.querySelector(`[data-color-enabled-for="${CSS.escape(fieldId)}"]`);
    colorToggle?.addEventListener("change", () => {
      syncColorEnabledState(hexInput, picker, colorToggle);
    });
    if (colorToggle) {
      syncColorEnabledState(hexInput, picker, colorToggle);
    }
  });
}

export function getUxColorFieldValue(input, container) {
  return isUxColorEnabled(input, container) ? normalizeHexColor(input.value) : "";
}

export function isUxColorNoneSelected(input, container) {
  return input.dataset.fieldType === "color" && !isUxColorEnabled(input, container);
}

export function normalizeHexColor(value) {
  const trimmed = String(value ?? "").trim();
  return isHexColor(trimmed) ? `#${trimmed.slice(1).toUpperCase()}` : "";
}

export function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "").trim());
}

function isUxColorEnabled(input, container) {
  if (input.dataset.fieldType !== "color") {
    return true;
  }
  const colorToggle = container.querySelector(`[data-color-enabled-for="${CSS.escape(input.dataset.fieldId)}"]`);
  return colorToggle ? colorToggle.checked : true;
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
  picker.value = value.toLowerCase();
}
