// @ts-check

const EDITOR_DIALOG_WIDTH = 720;
const EDITOR_DIALOG_MIN_WIDTH = 520;
const EDITOR_DIALOG_MIN_HEIGHT = 360;

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
    const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
    const minTop = window.scrollY + 12;
    return {
      left: Math.min(Math.max(12, left), maxLeft),
      top: Math.max(minTop, top),
    };
  }

  /** @param {number} width @param {number} height @returns {DialogSize} */
  function clampEditorDialogSize(width, height) {
    const rect = elements.editorDialog.getBoundingClientRect();
    const maxWidth = Math.max(EDITOR_DIALOG_MIN_WIDTH, window.innerWidth - rect.left - 12);
    const viewportBottom = window.scrollY + window.innerHeight - 12;
    const dialogTop = window.scrollY + rect.top;
    const maxHeight = Math.max(EDITOR_DIALOG_MIN_HEIGHT, viewportBottom - dialogTop);
    return {
      width: Math.min(Math.max(EDITOR_DIALOG_MIN_WIDTH, width), maxWidth),
      height: Math.min(Math.max(EDITOR_DIALOG_MIN_HEIGHT, height), maxHeight),
    };
  }

  /** @param {DialogSize | null} size @param {{ persist?: boolean }} [options] */
  function applyEditorDialogSize(size, { persist = false } = {}) {
    if (!size) {
      return;
    }
    const clamped = clampEditorDialogSize(size.width, size.height);
    state.editorDialogSize = clamped;
    elements.editorDialog.style.width = `${clamped.width}px`;
    elements.editorDialog.style.height = `${clamped.height}px`;
    if (persist) {
      options.saveEditorDialogSize(clamped);
    }
    syncEditorDialogScrollSpace();
  }

  /** @param {DialogPosition | null} position */
  function applyEditorDialogPosition(position) {
    if (!position) {
      return;
    }
    const clamped = clampEditorDialogPosition(position.left, position.top);
    state.editorDialogPosition = clamped;
    elements.editorDialog.style.left = `${clamped.left}px`;
    elements.editorDialog.style.top = `${clamped.top}px`;
  }

  /** @param {number} [scrollY] */
  function prepareEditorDialogPosition(scrollY = window.scrollY) {
    if (state.editorDialogSize) {
      applyEditorDialogSize(state.editorDialogSize);
    } else {
      elements.editorDialog.style.width = "";
      elements.editorDialog.style.height = "";
    }
    const closedWidth = state.editorDialogSize?.width ?? Math.min(EDITOR_DIALOG_WIDTH, Math.max(0, window.innerWidth - 32));
    const position = {
      left: Math.max(12, (window.innerWidth - closedWidth) / 2),
      top: scrollY + 48,
    };
    state.editorDialogPosition = position;
    elements.editorDialog.style.left = `${position.left}px`;
    elements.editorDialog.style.top = `${position.top}px`;
  }

  function ensureEditorDialogPosition() {
    if (state.editorDialogPosition) {
      applyEditorDialogPosition(state.editorDialogPosition);
      return;
    }
    const rect = elements.editorDialog.getBoundingClientRect();
    applyEditorDialogPosition({
      left: Math.max(12, (window.innerWidth - rect.width) / 2),
      top: window.scrollY + 48,
    });
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
      top: window.scrollY + drag.top + (event.clientY - drag.startY),
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
    elements.editorDialogResizeHandle.releasePointerCapture?.(event.pointerId);
    if (state.editorDialogSize) {
      applyEditorDialogSize(state.editorDialogSize, { persist: true });
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

  function syncEditorDialogScrollSpace() {
    if (!elements.editorDialog.open) {
      document.body.style.minHeight = "";
      return;
    }
    const rect = elements.editorDialog.getBoundingClientRect();
    const dialogBottom = window.scrollY + rect.bottom;
    document.body.style.minHeight = `${Math.ceil(dialogBottom + 32)}px`;
  }

  function syncDialogScrollLock() {
    const shouldLockScroll = elements.uxDialog.open;
    document.documentElement.classList.toggle("dialog-scroll-locked", shouldLockScroll);
    document.body.classList.toggle("dialog-scroll-locked", shouldLockScroll);
    document.body.classList.toggle("editor-dialog-open", elements.editorDialog.open);
    syncEditorDialogScrollSpace();
  }

  return {
    ensureEditorDialogPosition,
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
