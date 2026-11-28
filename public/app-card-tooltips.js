// @ts-check
// One delegated controller. The portal is outside scrolling/virtualized lanes;
// observers exist only while a description is visible, never per card.
export function initializeCardTooltips() {
  const tooltip = document.createElement("div");
  tooltip.className = "ticket-card-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  /** @type {HTMLElement | null} */
  let source = null;
  /** @type {HTMLElement | null} */
  let dismissed = null;
  let focused = false;
  let leaveTimer = 0;
  let scrollFrame = 0;
  const observer = new MutationObserver(position);

  function cancelLeave() {
    window.clearTimeout(leaveTimer);
    leaveTimer = 0;
  }

  function hide() {
    cancelLeave();
    observer.disconnect();
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    source = null;
    focused = false;
    tooltip.hidden = true;
  }

  function position() {
    if (!source) return;
    if (!source.isConnected || !source.getClientRects().length) {
      hide();
      return;
    }
    const anchor = focused ? source.closest(".ticket-card") ?? source : source;
    const rect = anchor.getBoundingClientRect();
    const triggerRect = source.getBoundingClientRect();
    for (const clip of [source.closest(".ticket-list"), source.closest(".lane-board")]) {
      if (!clip) continue;
      const bounds = clip.getBoundingClientRect();
      if (triggerRect.bottom <= bounds.top || triggerRect.top >= bounds.bottom || triggerRect.right <= bounds.left || triggerRect.left >= bounds.right) {
        hide();
        return;
      }
    }
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const margin = 8;
    if (triggerRect.bottom <= top || triggerRect.top >= top + height || triggerRect.right <= left || triggerRect.left >= left + width) {
      hide();
      return;
    }
    tooltip.style.maxWidth = `${Math.max(0, width - margin * 2)}px`;
    tooltip.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
    const box = tooltip.getBoundingClientRect();
    const below = rect.bottom + margin;
    const y = below + box.height <= top + height - margin ? below : rect.top - margin - box.height;
    tooltip.style.left = `${Math.max(left + margin, Math.min(rect.left, left + width - margin - box.width))}px`;
    tooltip.style.top = `${Math.max(top + margin, Math.min(y, top + height - margin - box.height))}px`;
  }

  /** @param {HTMLElement} element @param {boolean} fromFocus */
  function show(element, fromFocus) {
    if (element === dismissed) return;
    cancelLeave();
    source = element;
    focused = fromFocus;
    tooltip.textContent = element.dataset.cardTooltip ?? "";
    tooltip.hidden = false;
    position();
    if (source) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  }

  /** @param {EventTarget | null} target */
  function trigger(target) {
    return target instanceof Element ? target.closest(".ticket-card [data-card-tooltip]") : null;
  }

  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    if (event.target instanceof Node && tooltip.contains(event.target)) {
      cancelLeave();
      return;
    }
    const element = trigger(event.target);
    if (element instanceof HTMLElement && !element.classList.contains("ticket-link")) {
      if (element !== source) show(element, false);
      else cancelLeave();
    }
  });
  document.addEventListener("pointerout", event => {
    const next = event.relatedTarget;
    if (next instanceof Node && (source?.contains(next) || tooltip.contains(next))) return;
    if (dismissed && !(next instanceof Node && dismissed.contains(next))) dismissed = null;
    if (focused && source === document.activeElement) return;
    cancelLeave();
    leaveTimer = window.setTimeout(hide, 160);
  });
  document.addEventListener("focusin", event => {
    const element = trigger(event.target);
    if (element instanceof HTMLElement) show(element, true);
    else hide();
  });
  document.addEventListener("focusout", event => {
    if (event.target === dismissed) dismissed = null;
    if (focused) hide();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || tooltip.hidden) return;
    dismissed = source;
    hide();
    // Dismiss the description without consuming the board's Escape action
    // (returning from a card title to the search field).
  }, true);
  document.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node && tooltip.contains(event.target))) hide();
  }, true);
  // Closing a dialog restores its originating title, but is not a request for
  // its description (which could otherwise cover the next card's click target).
  document.addEventListener("close", hide, true);
  document.addEventListener("dragstart", hide, true);
  document.addEventListener("scroll", event => {
    // An exceptionally long explanation can scroll inside the portal itself.
    if (event.target instanceof Node && tooltip.contains(event.target)) return;
    if (focused && source === document.activeElement) {
      // Native Tab scrolls the lane after focusin. Keep its description anchored.
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; position(); });
    } else hide();
  }, true);
  window.addEventListener("resize", hide);
  window.addEventListener("blur", hide);
  window.visualViewport?.addEventListener("resize", hide);
  window.visualViewport?.addEventListener("scroll", hide);
}
