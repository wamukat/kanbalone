// @ts-check

const EDITOR_DIALOG_WIDTH = 720;
const EDITOR_DIALOG_MIN_WIDTH = 520;
const EDITOR_DIALOG_MIN_HEIGHT = 360;
const EDITOR_DIALOG_EDGE = 12;
const EDITOR_DIALOG_TOP = 48;

/**
 * @typedef {{ left: number; top: number }} DialogPosition
 * @typedef {{ width: number; height: number }} DialogSize
 * @typedef {{ pointerId: number; startX: number; startY: number; left: number; top: number }} DialogDragState
 * @typedef {{ pointerId: number; startX: number; startY: number; width: number; height: number }} DialogResizeState
 * @typedef {{
 *   editorDialogSize: DialogSize | null;
 *   editorDialogPosition: DialogPosition | null;
 *   editorDialogDrag: DialogDragState | null;
 *   editorDialogResize: DialogResizeState | null;
 *   uxDialogPosition: DialogPosition | null;
 *   uxDialogDrag: DialogDragState | null;
 * }} DialogState
 * @typedef {{
 *   editorDialog: HTMLDialogElement;
 *   editorDialogResizeHandle: HTMLElement;
 *   uxDialog: HTMLDialogElement;
 *   toast: HTMLElement;
 * }} DialogElements
 * @typedef {{
 *   state: DialogState;
 *   elements: DialogElements;
 * }} DialogContext
 * @typedef {{
 *   saveEditorDialogSize(size: DialogSize): void;
 * }} DialogOptions
 */

/**
 * @param {DialogContext} ctx
 * @param {DialogOptions} options
 */
export function createDialogModule(ctx, options) {
  const { state, elements } = ctx;

  /** @param {number} left @param {number} top @returns {DialogPosition} */
  function clampEditorDialogPosition(left, top) {
    const rect = elements.editorDialog.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - EDITOR_DIALOG_EDGE;
    const maxTop = window.innerHeight - rect.height - EDITOR_DIALOG_EDGE;
    return {
      left: Math.max(EDITOR_DIALOG_EDGE, Math.min(left, maxLeft)),
      top: Math.max(EDITOR_DIALOG_EDGE, Math.min(top, maxTop)),
    };
  }

  /** @param {DialogSize} size @param {{ persist?: boolean }} [settings] */
  function applyEditorDialogSize({ width, height }, { persist = false } = {}) {
    const { left, top } = state.editorDialogPosition ?? { left: EDITOR_DIALOG_EDGE, top: EDITOR_DIALOG_TOP };
    const maxWidth = window.innerWidth - left - EDITOR_DIALOG_EDGE;
    const maxHeight = window.innerHeight - top - EDITOR_DIALOG_EDGE;
    const clamped = {
      width: Math.min(Math.max(EDITOR_DIALOG_MIN_WIDTH, width), maxWidth),
      height: Math.min(Math.max(EDITOR_DIALOG_MIN_HEIGHT, height), maxHeight),
    };
    elements.editorDialog.style.width = `${clamped.width}px`;
    elements.editorDialog.style.height = `${clamped.height}px`;
    if (persist) {
      state.editorDialogSize = clamped;
      options.saveEditorDialogSize(clamped);
    }
  }

  /** @param {DialogPosition} position */
  function applyEditorDialogPosition({ left, top }) {
    const clamped = clampEditorDialogPosition(left, top);
    state.editorDialogPosition = clamped;
    elements.editorDialog.style.left = `${clamped.left}px`;
    elements.editorDialog.style.top = `${clamped.top}px`;
    elements.editorDialog.style.setProperty("--editor-top", `${clamped.top}px`);
  }

  function prepareEditorDialogPosition() {
    const maxWidth = document.documentElement.clientWidth - 2 * EDITOR_DIALOG_EDGE;
    const width = Math.min(state.editorDialogSize?.width ?? EDITOR_DIALOG_WIDTH, maxWidth);
    const left = (document.documentElement.clientWidth - width) / 2;
    state.editorDialogPosition = { left, top: EDITOR_DIALOG_TOP };
    elements.editorDialog.style.left = `${left}px`;
    elements.editorDialog.style.top = `${EDITOR_DIALOG_TOP}px`;
    elements.editorDialog.style.setProperty("--editor-top", `${EDITOR_DIALOG_TOP}px`);
    elements.editorDialog.style.width = "";
    elements.editorDialog.style.height = "";
    if (state.editorDialogSize) applyEditorDialogSize(state.editorDialogSize);
  }

  function fitEditorDialogToViewport() {
    if (!elements.editorDialog.open) return;
    const { left, top } = elements.editorDialog.getBoundingClientRect();
    applyEditorDialogPosition({ left, top });
  }

  /** @param {PointerEvent} event */
  function handleEditorHeaderPointerDown(event) {
    if (!elements.editorDialog.open) {
      return;
    }
    const target = /** @type {Element | null} */ (event.target instanceof Element ? event.target : null);
    if (event.button !== 0 || target?.closest("button, input, textarea, select")) {
      return;
    }
    const rect = elements.editorDialog.getBoundingClientRect();
    state.editorDialogDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    elements.editorDialog.classList.add("dragging");
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  function handleEditorHeaderPointerMove(event) {
    const drag = state.editorDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    applyEditorDialogPosition({
      left: drag.left + (event.clientX - drag.startX),
      top: drag.top + (event.clientY - drag.startY),
    });
  }

  /** @param {PointerEvent} event */
  function handleEditorHeaderPointerUp(event) {
    const drag = state.editorDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    state.editorDialogDrag = null;
    elements.editorDialog.classList.remove("dragging");
  }

  /** @param {PointerEvent} event */
  function handleEditorDialogResizePointerDown(event) {
    if (!elements.editorDialog.open || event.button !== 0) {
      return;
    }
    const rect = elements.editorDialog.getBoundingClientRect();
    state.editorDialogResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    elements.editorDialog.classList.add("resizing");
    elements.editorDialogResizeHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  function handleEditorDialogResizePointerMove(event) {
    const resize = state.editorDialogResize;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    applyEditorDialogSize({
      width: resize.width + (event.clientX - resize.startX),
      height: resize.height + (event.clientY - resize.startY),
    });
  }

  /** @param {PointerEvent} event */
  function handleEditorDialogResizePointerUp(event) {
    const resize = state.editorDialogResize;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    state.editorDialogResize = null;
    elements.editorDialog.classList.remove("resizing");
    if (elements.editorDialogResizeHandle.hasPointerCapture(event.pointerId)) {
      elements.editorDialogResizeHandle.releasePointerCapture(event.pointerId);
    }
    if (event.type === "pointerup") {
      const { width, height } = elements.editorDialog.getBoundingClientRect();
      applyEditorDialogSize({ width, height }, { persist: true });
    }
  }

  /** @param {number} left @param {number} top @returns {DialogPosition} */
  function clampUxDialogPosition(left, top) {
    const rect = elements.uxDialog.getBoundingClientRect();
    return {
      left: Math.min(Math.max(12, left), Math.max(12, window.innerWidth - rect.width - 12)),
      top: Math.min(Math.max(12, top), Math.max(12, window.innerHeight - rect.height - 12)),
    };
  }

  /** @param {DialogPosition | null} position */
  function applyUxDialogPosition(position) {
    if (!position) {
      return;
    }
    const clamped = clampUxDialogPosition(position.left, position.top);
    state.uxDialogPosition = clamped;
    elements.uxDialog.style.left = `${clamped.left}px`;
    elements.uxDialog.style.top = `${clamped.top}px`;
  }

  function prepareUxDialogPosition() {
    const rect = elements.uxDialog.getBoundingClientRect();
    applyUxDialogPosition({
      left: (window.innerWidth - rect.width) / 2,
      top: Math.max(48, (window.innerHeight - rect.height) / 2),
    });
  }

  /** @param {PointerEvent} event */
  function handleUxHeaderPointerDown(event) {
    if (!elements.uxDialog.open) {
      return;
    }
    const target = /** @type {Element | null} */ (event.target instanceof Element ? event.target : null);
    if (event.button !== 0 || target?.closest("button")) {
      return;
    }
    const rect = elements.uxDialog.getBoundingClientRect();
    state.uxDialogDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    elements.uxDialog.classList.add("dragging");
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  function handleUxHeaderPointerMove(event) {
    const drag = state.uxDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    applyUxDialogPosition({
      left: drag.left + (event.clientX - drag.startX),
      top: drag.top + (event.clientY - drag.startY),
    });
  }

  /** @param {PointerEvent} event */
  function handleUxHeaderPointerUp(event) {
    const drag = state.uxDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    state.uxDialogDrag = null;
    elements.uxDialog.classList.remove("dragging");
  }

  function syncDialogScrollLock() {
    const modal = elements.uxDialog.open ? elements.uxDialog : elements.editorDialog.open ? elements.editorDialog : null;
    document.documentElement.classList.toggle("dialog-scroll-locked", Boolean(modal));
    const toastParent = modal ?? document.body;
    if (elements.toast.parentNode !== toastParent) toastParent.append(elements.toast);
  }

  return {
    fitEditorDialogToViewport,
    handleEditorDialogResizePointerDown,
    handleEditorDialogResizePointerMove,
    handleEditorDialogResizePointerUp,
    handleEditorHeaderPointerDown,
    handleEditorHeaderPointerMove,
    handleEditorHeaderPointerUp,
    handleUxHeaderPointerDown,
    handleUxHeaderPointerMove,
    handleUxHeaderPointerUp,
    prepareEditorDialogPosition,
    prepareUxDialogPosition,
    syncDialogScrollLock,
  };
}
