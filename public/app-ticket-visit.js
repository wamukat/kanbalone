import { t } from "./app-i18n.js";
import { createTicketVisitStore, compareVisitOrder, isTicketVisit } from "./app-ticket-visit-store.js";
import { renderTicketVisit } from "./app-ticket-visit-renderer.js";

export function createTicketVisitModule({ dialog, normal, api, escapeHtml, showActivity, refreshNormal }) {
  const tabs = dialog.querySelector("#ticket-visit-tabs");
  const changes = dialog.querySelector("#ticket-visit-changes");
  const content = dialog.querySelector("#ticket-visit-content");
  const updateNotice = dialog.querySelector("#ticket-visit-update");
  const storageNotice = dialog.querySelector("#ticket-visit-storage");
  const scroll = dialog.querySelector(".editor-scroll");
  const tabButtons = [...tabs.querySelectorAll("button")];
  const store = createTicketVisitStore();
  let viewing = false;
  let mode = "normal";
  let hasBaseline = false;
  let session;
  let fullText = [];
  let scrollTops = { normal: 0, changes: 0 };

  function applyMode() {
    normal.hidden = !viewing || mode !== "normal";
    changes.hidden = !viewing || mode !== "changes";
    tabs.hidden = !viewing;
    for (const button of tabButtons) {
      button.hidden = button.dataset.visitTab === "changes" && !hasBaseline;
      const selected = button.dataset.visitTab === mode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }

  function switchMode(next) {
    if (next === mode || (next === "changes" && !hasBaseline)) return;
    scrollTops[mode] = scroll.scrollTop;
    mode = next;
    applyMode();
    scroll.scrollTop = scrollTops[mode];
    if (mode === "normal" && session?.didUpdate) refreshCurrentView(session);
  }

  function writeOutcome(view) {
    if (!viewing || !view.isCurrent() || !view.result?.current || view.result.saveError || view.saving) return;
    view.saving = true;
    // This endpoint has already been rendered. Closing now keeps the saved
    // observation, while an endpoint that arrived after close never reaches here.
    store.save(view.ticketId, view.stored, view.result.current, view.allowRollback).catch(() => {
      if (!view.isCurrent()) return;
      view.result.saveError = true;
      storageNotice.hidden = false;
      content.querySelector(".ticket-visit-guidance")?.setAttribute("hidden", "");
    });
  }

  function setViewing(visible) {
    viewing = visible;
    applyMode();
    if (session) writeOutcome(session);
  }

  function reset() {
    if (session) {
      clearTimeout(session.checkTimer);
      session.controller.abort();
    }
    session = undefined;
    mode = "normal";
    hasBaseline = false;
    scrollTops = { normal: 0, changes: 0 };
    render({ kind: "loading" });
    updateNotice.hidden = true;
    storageNotice.hidden = true;
    applyMode();
  }

  function render(result) {
    fullText = [];
    storageNotice.hidden = hasBaseline || !result.saveError;
    content.innerHTML = renderTicketVisit(result, escapeHtml, values => fullText.push(values) - 1);
    const notices = hasBaseline ? content.querySelector("[data-visit-notices]") ?? changes : normal;
    notices.append(updateNotice, storageNotice);
  }

  async function refreshCurrentView(view) {
    if (view.normalRefreshed || view.refreshingNormal) return;
    view.refreshingNormal = true;
    try {
      view.normalRefreshed = Boolean(await refreshNormal());
    } finally {
      view.refreshingNormal = false;
    }
  }

  async function open(ticketId, boardId, isDialogCurrent) {
    if (session || !viewing) return;
    const controller = new AbortController();
    const view = { ticketId, controller, isCurrent };
    function isCurrent() {
      return session === view && !controller.signal.aborted && isDialogCurrent();
    }
    session = view;
    const url = "/api/tickets/" + ticketId + "/change-snapshot";
    view.url = url;
    let saveError = false;
    const stored = await store.read(ticketId).catch(() => { saveError = true; });
    if (!isCurrent()) return;
    try {
      const snapshot = await api(url, { signal: controller.signal });
      if (!isCurrent()) return;
      const visitId = crypto.getRandomValues(new Uint32Array(3)).join("-");
      const current = { ...snapshot, seenAt: Date.now(), visitId };
      if (current.ticketId !== ticketId || current.state?.board?.id !== boardId || typeof current.fingerprint !== "string") {
        throw new Error("Snapshot does not match the displayed ticket");
      }
      const valid = isTicketVisit(stored, ticketId);
      const order = valid ? compareVisitOrder(current, stored) : 0;
      const matches = order > 0 || (order === 0 && stored?.stateFingerprint === current.stateFingerprint);
      const before = valid && stored.series === current.series && matches ? stored : undefined;
      view.stored = stored;
      view.allowRollback = valid && stored.series === current.series && order < 0;
      view.result = { before, current, kind: stored && !before ? "expired" : "ready", saveError };
      hasBaseline = Boolean(before);
      mode = hasBaseline ? "changes" : "normal";
      render(view.result);
      applyMode();
      writeOutcome(view);
      if (view.checkQueued) scheduleUpdateCheck();
    } catch {
      if (!isCurrent()) return;
      const before = isTicketVisit(stored, ticketId) ? stored : undefined;
      view.result = { before, kind: "error" };
      hasBaseline = Boolean(before);
      mode = hasBaseline ? "changes" : "normal";
      render(view.result);
      applyMode();
    }
  }

  function scheduleUpdateCheck() {
    const view = session;
    if (!view || !view.isCurrent() || !updateNotice.hidden) return;
    view.checkQueued = true;
    if (!view.result?.current || view.checking || view.checkTimer) return;
    view.checkTimer = setTimeout(async () => {
      view.checkTimer = undefined;
      if (!view.isCurrent()) return;
      view.checking = true;
      view.checkQueued = false;
      try {
        const latest = await api(view.url + "?metadataOnly=true", { signal: view.controller.signal });
        const shown = view.result.current;
        if (view.isCurrent() && latest.series === shown.series && latest.fingerprint !== shown.fingerprint) {
          view.didUpdate = true;
          updateNotice.hidden = false;
          if (viewing && mode === "normal") void refreshCurrentView(view);
        }
      } catch (error) {
        if (view.isCurrent() && error.status === 404) updateNotice.hidden = false;
      } finally {
        view.checking = false;
        if (view.checkQueued && view.isCurrent()) scheduleUpdateCheck();
      }
    }, 150);
  }

  for (const button of tabButtons) {
    button.addEventListener("click", () => switchMode(button.dataset.visitTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const available = tabButtons.filter(tab => !tab.hidden);
      const next = event.key === "Home" ? available[0] : event.key === "End" ? available.at(-1) :
        available.find(other => other !== button) ?? button;
      switchMode(next.dataset.visitTab);
      next.focus({ preventScroll: true });
    });
  }

  changes.addEventListener("click", event => {
    if (!event.target.closest("[data-visit-history]")) return;
    switchMode("normal");
    void showActivity(session?.result);
    const activityTab = normal.querySelector("#activity-tab-button");
    activityTab.focus({ preventScroll: true });
    scroll.scrollTop += activityTab.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
  });
  changes.addEventListener("toggle", event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.hasAttribute("data-visit-full-text")) return;
    const panel = details.querySelector("[data-visit-full-text-content]");
    const values = fullText[Number(details.dataset.visitFullText)];
    if (!details.open || !values) {
      panel.replaceChildren();
      return;
    }
    panel.replaceChildren(...values.map((value, index) => {
      const container = document.createElement("div");
      if (values.length === 2) {
        const label = document.createElement("strong");
        label.textContent = t(index === 0 ? "Before" : "After");
        container.append(label);
      }
      const text = document.createElement("p");
      text.textContent = value;
      container.append(text);
      return container;
    }));
  }, true);

  return { open, reset, setViewing, scheduleUpdateCheck };
}
