import { t } from "./app-i18n.js";

export function createBoardFilterPickers(configurations) {
  let openPicker = null;
  const pickers = configurations.map((config) => {
    const { root, label, emptyLabel, onChange } = config;
    const trigger = root.querySelector("button");
    const summary = root.querySelector(".board-filter-names");
    const more = root.querySelector(".board-filter-more");
    const panel = root.querySelector(".board-filter-options");
    const choices = panel.querySelector(".board-filter-choices");
    const clear = panel.querySelector("button");
    let signature = "";
    let inputs = [];

    const picker = { trigger, panel, root, update };
    trigger.addEventListener("click", () => {
      if (openPicker === picker) {
        close();
        return;
      }
      close();
      openPicker = picker;
      panel.hidden = false;
      panel.showPopover?.();
      trigger.setAttribute("aria-expanded", "true");
      position();
      (inputs[0] ?? panel).focus({ preventScroll: true });
    });
    choices.addEventListener("change", () => {
      onChange(inputs.filter(input => input.checked).map(input => Number(input.value)));
    });
    clear.addEventListener("click", () => {
      (inputs[0] ?? panel).focus({ preventScroll: true });
      onChange([]);
    });

    function update(items, selectedIds) {
      const nextSignature = JSON.stringify(items.map(({ id, name }) => [id, name]));
      if (nextSignature !== signature) {
        signature = nextSignature;
        const focusedIndex = inputs.indexOf(document.activeElement);
        const focusedId = inputs[focusedIndex]?.value;
        inputs = [];
        choices.replaceChildren(...items.map(({ id, name }) => {
          const row = document.createElement("label");
          const control = document.createElement("input");
          control.type = "checkbox";
          control.value = String(id);
          const text = document.createElement("span");
          text.textContent = name;
          row.append(control, text);
          inputs.push(control);
          return row;
        }));
        if (!items.length) {
          const empty = document.createElement("span");
          empty.className = "tag-picker-empty";
          empty.textContent = emptyLabel;
          choices.append(empty);
        }
        if (openPicker === picker && focusedIndex >= 0) {
          const nextFocus = inputs.find(input => input.value === focusedId)
            ?? inputs[Math.min(focusedIndex, inputs.length - 1)] ?? panel;
          nextFocus.focus({ preventScroll: true });
        }
      }
      const selected = new Set(selectedIds);
      const names = items.filter(item => selected.has(item.id)).map(item => item.name);
      for (const input of inputs) input.checked = selected.has(Number(input.value));
      const separator = t(", ");
      const title = t(label, { value: names.join(separator) || t("All") });
      summary.textContent = names.slice(0, 2).join(separator) || t("All");
      more.hidden = names.length <= 2;
      more.textContent = more.hidden ? "" : t("+{count}", { count: names.length - 2 });
      trigger.setAttribute("aria-label", title);
      if (names.length) trigger.title = title;
      else trigger.removeAttribute("title");
      trigger.classList.toggle("is-filter-active", !root.hidden && names.length > 0);
      clear.disabled = names.length === 0;
      if (openPicker === picker && document.activeElement === clear && clear.disabled) {
        (inputs[0] ?? panel).focus({ preventScroll: true });
      }
    }
    return picker;
  });

  function close(restoreFocus = false) {
    if (!openPicker) return;
    const { trigger, panel } = openPicker;
    openPicker = null;
    panel.hidePopover?.();
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function position() {
    if (!openPicker) return;
    const { trigger, panel } = openPicker;
    const anchor = trigger.getBoundingClientRect();
    if (anchor.width === 0) {
      close();
      return;
    }
    const viewport = document.documentElement;
    const gutter = 8;
    const gap = 4;
    const width = Math.min(Math.max(anchor.width, 172), viewport.clientWidth - gutter * 2);
    const below = viewport.clientHeight - anchor.bottom - gap - gutter;
    const above = anchor.top - gap - gutter;
    const opensUp = below < 220 && above > below;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(320, Math.max(0, opensUp ? above : below))}px`;
    panel.style.left = `${Math.max(gutter, Math.min(anchor.left, viewport.clientWidth - width - gutter))}px`;
    panel.style.top = opensUp ? "auto" : `${anchor.bottom + gap}px`;
    panel.style.bottom = opensUp ? `${viewport.clientHeight - anchor.top + gap}px` : "auto";
  }

  function dismissOutside(event) {
    if (openPicker && !openPicker.root.contains(event.target)) close();
  }
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("focusin", dismissOutside);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && openPicker) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener("scroll", event => {
    if (openPicker && !openPicker.panel.contains(event.target)) position();
  }, true);
  window.addEventListener("resize", position);

  return { pickers, close, position };
}
