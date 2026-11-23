import { t as tr } from "./app-i18n.js";
import { takeRoundRobinBatch } from "./app-board-utils.js";
import { createKanbanLane, createKanbanLaneInputColumn } from "./app-kanban-lane.js";
import { createKanbanTicketCard } from "./app-kanban-ticket-card.js";
import { kanbanCardIconNames } from "./app-ticket-inline-icons.js";
import { createTicketMaskRenderer } from "./app-ticket-mask-icons.js";
import { icon } from "./icons.js";

const COMPLETION_PREVIEW_COUNT = 5;
const COMPLETION_PAGE_SIZE = 50;
const INACTIVE_COLLAPSE_THRESHOLD = 8;
const INACTIVE_PREVIEW_COUNT = 3;
const INACTIVE_SHOW_MORE_COUNT = 50;
const KANBAN_TICKET_BATCH_SIZE = 120;

export function createKanbanBoardModule(ctx, options) {
  const { state, elements } = ctx;
  const getCardIcon = createTicketMaskRenderer(elements.laneBoard, {
    names: kanbanCardIconNames,
    scope: ".ticket-card",
    marker: "data-kanban-card-icon",
    className: "kanban-card-icon",
  });
  let kanbanRenderToken = 0;
  let kanbanNextLaneIndex = 0;
  let laneDragPreview = null;
  const laneScrollTopById = new Map();
  const completionLimits = new Map();
  const previousCompletionIds = new Map();
  const previousCompletionHeads = new Map();
  let completionBoardId = null;
  let completedLaneSnapshot = null;
  let laneSnapshotEpoch = 0;
  let laneWriteCount = 0;
  const laneScrollQueues = new WeakMap();
  let pendingNativeTab = null;

  function invalidateLaneSnapshot() {
    completedLaneSnapshot = null;
    laneSnapshotEpoch += 1;
  }

  function cancelPendingRender() {
    invalidateLaneSnapshot();
    state.boardKeyboardRenderPending = false;
    kanbanRenderToken += 1;
    kanbanNextLaneIndex = 0;
  }

  function planLaneTickets(detail) {
    return detail.lanes.sort((a, b) => a.position - b.position).map((lane) => {
      const laneTickets = detail.tickets.filter((item) => item.laneId === lane.id).sort((a, b) => a.position - b.position);
      if (lane.isCompletionLane) {
        laneTickets.sort((a, b) => {
          const aTime = a.resolvedAt ? Date.parse(a.resolvedAt) || 0 : 0;
          const bTime = b.resolvedAt ? Date.parse(b.resolvedAt) || 0 : 0;
          return bTime - aTime || a.position - b.position || b.id - a.id;
        });
      }
      const page = detail.completionPages?.[lane.id];
      const limit = page ? page.visibleCount ?? page.tickets.length : completionLimits.get(lane.id) ?? COMPLETION_PREVIEW_COUNT;
      const { visibleTickets, hiddenInactiveTickets, inactiveTotal } = lane.isCompletionLane
        ? { visibleTickets: laneTickets.slice(0, limit), hiddenInactiveTickets: [], inactiveTotal: 0 }
        : getKanbanLaneTicketGroups(laneTickets);
      // Recreate paging controls because their callbacks close over this response.
      const key = !lane.isCompletionLane && hiddenInactiveTickets.length === 0
        && visibleTickets.every((ticket) => typeof ticket.hasChildren === "boolean")
        ? JSON.stringify([lane, laneTickets]) : null;
      return { lane, laneTickets, page, visibleTickets, hiddenInactiveTickets, inactiveTotal, key };
    });
  }

  function retainOrdinaryLanes(scope, plans) {
    if (completedLaneSnapshot?.scope !== scope || state.boardKeyboardRenderPending || laneWriteCount
        || state.isCreatingLane || document.activeElement === elements.searchInput
        || elements.laneBoard.className !== "lane-board"
        || elements.laneBoard.querySelector(".ticket-card.dragging, .lane-title-edit-form, .inline-action-menu.expanded")) return null;
    const children = Array.from(elements.laneBoard.children);
    const adder = children.pop();
    if (!adder?.matches(".add-lane-button") || children.length !== plans.length
        || plans.some(({ lane }, i) => Number(children[i]?.dataset.laneId) !== lane.id)) return null;
    const retained = new Map();
    const current = new Map();
    plans.forEach(({ lane, key, visibleTickets }, i) => {
      const element = children[i];
      current.set(lane.id, element);
      const cached = completedLaneSnapshot.lanes.get(lane.id);
      if (!key || cached?.key !== key || cached.element !== element || cached.list.children.length !== visibleTickets.length) return;
      let index = 0;
      for (const card of cached.list.children) {
        if (!card.matches(".ticket-card:not(.dragging)") || Number(card.dataset.ticketId) !== visibleTickets[index++].id) return;
      }
      retained.set(lane.id, cached);
    });
    // Search ArrowDown must still find the first real card while changed lanes fill.
    const first = plans.find(({ visibleTickets }) => visibleTickets.length > 0);
    const firstCard = first && retained.get(first.lane.id)?.list.firstElementChild;
    const firstTitle = firstCard?.querySelector(".ticket-link");
    if (!firstTitle?.getClientRects().length || firstTitle.closest("[hidden], [inert]")
        || getComputedStyle(firstTitle).visibility !== "visible" || plans.length > KANBAN_TICKET_BATCH_SIZE) return null;
    return { retained, current };
  }

  function renderKanbanBoard(detail, { reuseReadyLanes = false } = {}) {
    if (completionBoardId !== state.activeBoardId) {
      completionLimits.clear();
      previousCompletionIds.clear();
      previousCompletionHeads.clear();
      completionBoardId = state.activeBoardId;
    }
    const scope = JSON.stringify([state.activeBoardId, state.filters]);
    const plans = planLaneTickets(detail);
    const reuse = reuseReadyLanes ? retainOrdinaryLanes(scope, plans) : null;
    const epoch = laneSnapshotEpoch;
    const canCommitSnapshot = laneWriteCount === 0 && state.activeLaneDragId === null
      && !elements.laneBoard.classList.contains("is-dragging-ticket");
    completedLaneSnapshot = null;
    const nextSnapshot = new Map();
    state.boardKeyboardRenderPending = true;
    const renderToken = ++kanbanRenderToken;
    kanbanNextLaneIndex = 0;
    const scrollState = captureKanbanScrollState();
    elements.laneBoard.className = "lane-board";
    if (!reuse) elements.laneBoard.innerHTML = "";
    const laneQueues = [];

    for (const { lane, laneTickets, page, visibleTickets, hiddenInactiveTickets, inactiveTotal, key } of plans) {
      const retained = reuse?.retained.get(lane.id);
      if (retained) {
        nextSnapshot.set(lane.id, retained);
        continue;
      }
      const { laneElement, list } = createKanbanLane(ctx, lane, laneTickets, {
        bindDropZone,
        bindLaneDrag,
        deleteLane,
        renameLane,
      });
      if (page) laneElement.querySelector(".lane-count").textContent = String(page.total);
      const previousIds = previousCompletionIds.get(lane.id);
      const previousHead = previousCompletionHeads.get(lane.id);
      const head = laneTickets[0];
      const headTime = head?.resolvedAt ? Date.parse(head.resolvedAt) || 0 : 0;
      const previousTime = previousHead?.resolvedAt ? Date.parse(previousHead.resolvedAt) || 0 : 0;
      // Older rows fetched by More (including a 409 restart) are not arrivals.
      // Removing the visible head must not make its older replacement an arrival.
      const hasArrival = lane.isCompletionLane && previousIds && head && !previousIds.has(head.id)
        && (headTime > previousTime || (headTime === previousTime && laneTickets.some((ticket) => ticket.id === previousHead?.id)));
      if (lane.isCompletionLane) {
        previousCompletionIds.set(lane.id, new Set(laneTickets.map((ticket) => ticket.id)));
        previousCompletionHeads.set(lane.id, head ?? null);
      }
      const restoreScrollTop = hasArrival ? 0 : scrollState.laneScrollTopById.get(lane.id) ?? 0;
      if (hasArrival) laneScrollTopById.set(lane.id, 0);
      const queue = {
        laneId: lane.id,
        list,
        restoreScrollPending: restoreScrollTop > 0,
        restoreScrollTop,
        replacesReadyLane: Boolean(reuse),
        tickets: visibleTickets,
        index: 0,
        afterRender: lane.isCompletionLane && (page?.total ?? laneTickets.length) > COMPLETION_PREVIEW_COUNT
          ? () => list.append(createCompletionSummary(lane, laneTickets, list, visibleTickets.length, page))
          : hiddenInactiveTickets.length > 0
            ? () => list.append(createInactiveTicketsSummary(ctx, hiddenInactiveTickets, inactiveTotal))
            : null,
        afterRenderDone: false,
      };
      trackLaneScroll(list, queue);

      if (reuse) reuse.current.get(lane.id).replaceWith(laneElement);
      else elements.laneBoard.append(laneElement);
      laneQueues.push(queue);
      if (key) nextSnapshot.set(lane.id, { key, element: laneElement, list });
    }

    if (state.isCreatingLane) {
      elements.laneBoard.append(createLaneInputColumn());
    } else if (!reuse) {
      const addLaneButton = document.createElement("button");
      addLaneButton.type = "button";
      addLaneButton.className = "add-lane-button icon-button";
      addLaneButton.innerHTML = icon("plus");
      addLaneButton.title = tr("New lane");
      addLaneButton.setAttribute("aria-label", tr("New lane"));
      addLaneButton.addEventListener("click", createLane);
      elements.laneBoard.append(addLaneButton);
    }

    restoreKanbanBoardScrollState(scrollState);
    renderKanbanTicketsInBatches(renderToken, laneQueues, Boolean(reuse), () => {
      if (canCommitSnapshot && laneSnapshotEpoch === epoch && laneWriteCount === 0 && kanbanRenderToken === renderToken) {
        completedLaneSnapshot = { scope, lanes: nextSnapshot };
      }
    });
  }

  function createCompletionSummary(lane, tickets, list, initialCount, page) {
    const summary = document.createElement("div");
    summary.className = "completion-ticket-summary";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "completion-show-more";
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "completion-collapse ghost";
    collapse.textContent = tr("Show latest 5");
    summary.append(more, collapse);
    let shown = initialCount;
    function sync() {
      const remaining = (page?.total ?? tickets.length) - shown;
      more.hidden = remaining <= 0;
      more.textContent = tr("Show {count} more ({remaining} remaining)", {
        count: formatCount(Math.min(COMPLETION_PAGE_SIZE, remaining)),
        remaining: formatCount(remaining),
      });
      collapse.hidden = shown <= COMPLETION_PREVIEW_COUNT;
    }
    more.addEventListener("click", async () => {
      if (more.disabled) return;
      more.disabled = true;
      collapse.disabled = true;
      const renderToken = kanbanRenderToken;
      try {
        let next = tickets.slice(shown, shown + COMPLETION_PAGE_SIZE);
        if (page && next.length === 0) {
          const result = await ctx.loadMoreCompletionTickets(lane.id);
          if (!result || renderToken !== kanbanRenderToken || !list.isConnected) return;
          next = result.tickets;
          tickets.push(...next);
        }
        if (renderToken !== kanbanRenderToken || !list.isConnected) return;
        const fragment = document.createDocumentFragment();
        next.forEach((ticket) => fragment.append(createKanbanTicketCard(ctx, ticket, getCardIcon())));
        list.insertBefore(fragment, summary);
        shown += next.length;
        completionLimits.set(lane.id, shown);
        previousCompletionIds.set(lane.id, new Set(tickets.map((ticket) => ticket.id)));
        ctx.collapseCompletionTickets?.(lane.id, shown);
        sync();
        options.afterRender?.();
        collapse.disabled = false;
        if (more.hidden) collapse.focus({ preventScroll: true });
      } catch (error) {
        if (renderToken === kanbanRenderToken && list.isConnected) ctx.showToast(error.message, "error");
      } finally {
        more.disabled = false;
        collapse.disabled = false;
      }
    });
    collapse.addEventListener("click", () => {
      const cards = [...list.querySelectorAll(":scope > .ticket-card")];
      cards.slice(COMPLETION_PREVIEW_COUNT).forEach((card) => card.remove());
      shown = Math.min(COMPLETION_PREVIEW_COUNT, tickets.length);
      completionLimits.set(lane.id, COMPLETION_PREVIEW_COUNT);
      ctx.collapseCompletionTickets?.(lane.id);
      list.scrollTop = 0;
      laneScrollTopById.set(lane.id, 0);
      sync();
      more.focus({ preventScroll: true });
    });
    sync();
    return summary;
  }

  function captureKanbanScrollState() {
    for (const list of elements.laneBoard.querySelectorAll(".ticket-list[data-lane-id]")) {
      const laneId = Number(list.dataset.laneId);
      if (list.scrollHeight > list.clientHeight || list.scrollTop > 0) {
        laneScrollTopById.set(laneId, list.scrollTop);
      }
    }
    return {
      boardScrollLeft: elements.laneBoard.scrollLeft,
      boardScrollTop: elements.laneBoard.scrollTop,
      laneScrollTopById: new Map(laneScrollTopById),
    };
  }

  function restoreKanbanBoardScrollState(scrollState) {
    elements.laneBoard.scrollLeft = scrollState.boardScrollLeft;
    elements.laneBoard.scrollTop = scrollState.boardScrollTop;
  }

  function stopKeyboardScrollRestore(list) {
    const queue = laneScrollQueues.get(list);
    if (queue?.replacesReadyLane) queue.restoreScrollPending = false;
  }

  function rememberNativeTab(event) {
    pendingNativeTab = null;
    if (event.key !== "Tab" || !event.isTrusted || event.defaultPrevented || event.isComposing
        || event.altKey || event.ctrlKey || event.metaKey || state.viewMode !== "kanban"
        || !state.boardKeyboardRenderPending || elements.editorDialog.open || elements.uxDialog.open) return;

    pendingNativeTab = event;
    window.setTimeout(() => {
      if (pendingNativeTab === event) pendingNativeTab = null;
    }, 0);
  }

  function stopScrollRestoreAfterNativeTab(event) {
    const keydown = pendingNativeTab;
    pendingNativeTab = null;
    // A native Tab moves focus after keydown propagation. An app focus change during keydown can precede it.
    if (!keydown || keydown.defaultPrevented || keydown.eventPhase !== Event.NONE || !event.isTrusted
        || event.relatedTarget !== keydown.target || !(event.target instanceof Element)) return;

    const list = event.target.closest(".ticket-list");
    if (!list?.isConnected || !elements.laneBoard.contains(list)) return;
    const queue = laneScrollQueues.get(list);
    if (queue?.restoreScrollPending) queue.restoreScrollPending = false;
  }

  function trackLaneScroll(list, queue) {
    laneScrollQueues.set(list, queue);
    list.addEventListener("scroll", () => {
      laneScrollTopById.set(queue.laneId, list.scrollTop);
    });
    const stop = () => {
      queue.restoreScrollPending = false;
    };
    list.addEventListener("wheel", stop, { passive: true });
    list.addEventListener("touchmove", stop, { passive: true });
    list.addEventListener("pointerdown", stop);
  }

  function getKanbanLaneTicketGroups(laneTickets) {
    const inactiveTickets = laneTickets.filter((ticket) => ticket.isResolved || ticket.isArchived);
    if (inactiveTickets.length <= INACTIVE_COLLAPSE_THRESHOLD) {
      return {
        visibleTickets: laneTickets,
        hiddenInactiveTickets: [],
        inactiveTotal: inactiveTickets.length,
      };
    }

    const previewInactiveIds = new Set(inactiveTickets.slice(0, INACTIVE_PREVIEW_COUNT).map((ticket) => ticket.id));
    return {
      visibleTickets: laneTickets.filter((ticket) => (!ticket.isResolved && !ticket.isArchived) || previewInactiveIds.has(ticket.id)),
      hiddenInactiveTickets: inactiveTickets.slice(INACTIVE_PREVIEW_COUNT),
      inactiveTotal: inactiveTickets.length,
    };
  }

  function createInactiveTicketsSummary(ctx, hiddenTickets, inactiveTotal) {
    const summary = document.createElement("div");
    summary.className = "inactive-ticket-summary";
    const hiddenCount = hiddenTickets.length;
    summary.innerHTML = [
      '<div class="inactive-ticket-summary-text">',
      `<strong>${tr("{count} hidden tickets", { count: formatCount(hiddenCount) })}</strong>`,
      `<span>${tr("{count} resolved or archived in this lane", { count: formatCount(inactiveTotal) })}</span>`,
      '</div>',
      '<div class="inactive-ticket-summary-list" hidden></div>',
      `<button type="button" class="inactive-ticket-summary-button">${getShowMoreText(hiddenCount)}</button>`,
    ].join("");

    const button = summary.querySelector(".inactive-ticket-summary-button");
    const list = summary.querySelector(".inactive-ticket-summary-list");
    let renderedCount = 0;
    button.addEventListener("click", () => {
      if (renderedCount >= hiddenTickets.length) {
        renderedCount = 0;
        list.replaceChildren();
        list.hidden = true;
        button.textContent = getShowMoreText(hiddenTickets.length);
        return;
      }

      const nextTickets = hiddenTickets.slice(renderedCount, renderedCount + INACTIVE_SHOW_MORE_COUNT);
      const fragment = document.createDocumentFragment();
      nextTickets.forEach((ticket) => fragment.append(createKanbanTicketCard(ctx, ticket, getCardIcon())));
      list.append(fragment);
      renderedCount += nextTickets.length;
      list.hidden = false;
      const remaining = hiddenTickets.length - renderedCount;
      button.textContent = remaining > 0 ? getShowMoreText(remaining) : tr("Hide resolved or archived");
    });

    return summary;
  }

  function formatCount(count) {
    return count.toLocaleString("en-US");
  }

  function getShowMoreText(remaining) {
    const count = Math.min(INACTIVE_SHOW_MORE_COUNT, remaining);
    return remaining <= INACTIVE_SHOW_MORE_COUNT
      ? tr("Show remaining {count}", { count: formatCount(remaining) })
      : tr("Show {count} more", { count: formatCount(count) });
  }

  function createLaneInputColumn() {
    return createKanbanLaneInputColumn(submitLaneCreate, cancelLaneCreate);
  }

  function renderKanbanTicketsInBatches(renderToken, laneQueues, immediate, onComplete) {
    const stepNextFrame = () => step(KANBAN_TICKET_BATCH_SIZE);

    function step(limit) {
      if (renderToken !== kanbanRenderToken) {
        return;
      }
      const { selections, nextLaneIndex } = takeRoundRobinBatch(laneQueues, kanbanNextLaneIndex, limit);
      kanbanNextLaneIndex = nextLaneIndex;
      const fragments = new Map();
      for (const selection of selections) {
        const queue = laneQueues[selection.laneIndex];
        const fragment = fragments.get(selection.laneIndex) ?? document.createDocumentFragment();
        fragment.append(createKanbanTicketCard(ctx, queue.tickets[selection.ticketIndex], getCardIcon()));
        fragments.set(selection.laneIndex, fragment);
      }
      for (const [laneIndex, fragment] of fragments.entries()) {
        laneQueues[laneIndex].list.append(fragment);
      }
      for (const queue of laneQueues) {
        if (!queue.afterRenderDone && queue.index >= queue.tickets.length) {
          queue.afterRender?.();
          queue.afterRenderDone = true;
        }
        restoreLaneScroll(queue);
      }
      const hasMore = laneQueues.some((queue) => queue.index < queue.tickets.length);
      state.boardKeyboardRenderPending = hasMore;
      options.afterRender?.();
      if (hasMore) requestAnimationFrame(stepNextFrame);
      else onComplete();
    }

    // Leave a target in every changed lane before keyboard input can reach the board.
    if (immediate) step(Math.max(24, laneQueues.length));
    else requestAnimationFrame(stepNextFrame);
  }

  function restoreLaneScroll(queue) {
    if (!queue.restoreScrollPending) {
      return;
    }
    const maxScrollTop = Math.max(0, queue.list.scrollHeight - queue.list.clientHeight);
    if (maxScrollTop <= 0 && queue.index < queue.tickets.length) {
      return;
    }
    queue.list.scrollTop = Math.min(queue.restoreScrollTop, maxScrollTop);
    laneScrollTopById.set(queue.laneId, queue.list.scrollTop);
    if (maxScrollTop >= queue.restoreScrollTop || queue.index >= queue.tickets.length) {
      queue.restoreScrollPending = false;
    }
  }

  function bindDropZone(list) {
    list.addEventListener("dragover", (event) => {
      const dragging = elements.laneBoard.querySelector(".ticket-card.dragging");
      if (!dragging) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setActiveDropLane(list);
      clearTicketInsertionFeedback();
      // Keep the native drag source and hit targets in place until drop. Moving
      // the source during dragover can prevent the browser from emitting drop.
      const afterElement = getTicketDropAnchor(list, event.clientY);
      if (afterElement) {
        afterElement.classList.add("is-ticket-drop-before");
      } else {
        [...list.querySelectorAll(":scope > .ticket-card:not(.dragging)")].at(-1)?.classList.add("is-ticket-drop-after");
      }
    });

    list.addEventListener("drop", async (event) => {
      const dragging = elements.laneBoard.querySelector(".ticket-card.dragging");
      if (!dragging) {
        return;
      }
      event.preventDefault();
      const afterElement = getTicketDropAnchor(list, event.clientY);
      // Place cards before the paging controls when dropping at the end.
      const endControl = list.querySelector(".completion-ticket-summary, .inactive-ticket-summary");
      invalidateLaneSnapshot();
      laneWriteCount += 1;
      try {
        list.insertBefore(dragging, afterElement ?? endControl);
        clearDropLaneFeedback();
        await persistTicketPosition(dragging, list);
      } finally {
        laneWriteCount -= 1;
      }
    });

    list.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) {
        return;
      }
      list.closest(".lane")?.classList.remove("is-drag-over");
      clearTicketInsertionFeedback(list);
    });
  }

  function getTicketDropAnchor(list, y) {
    const lane = state.boardDetail?.lanes.find((item) => item.id === Number(list.dataset.laneId));
    return lane?.isCompletionLane
      ? list.querySelector(":scope > .ticket-card:not(.dragging)")
      : getDragAfterElement(list, y);
  }

  function clearTicketInsertionFeedback(container = elements.laneBoard) {
    for (const card of container.querySelectorAll(".is-ticket-drop-before, .is-ticket-drop-after")) {
      card.classList.remove("is-ticket-drop-before", "is-ticket-drop-after");
    }
  }

  function setActiveDropLane(list) {
    elements.laneBoard.classList.add("is-dragging-ticket");
    const activeLane = list.closest(".lane");
    for (const lane of elements.laneBoard.querySelectorAll(".lane.is-drag-over")) {
      if (lane !== activeLane) {
        lane.classList.remove("is-drag-over");
      }
    }
    activeLane?.classList.add("is-drag-over");
  }

  function clearDropLaneFeedback() {
    clearTicketInsertionFeedback();
    elements.laneBoard.classList.remove("is-dragging-ticket");
    for (const lane of elements.laneBoard.querySelectorAll(".lane.is-drag-over")) {
      lane.classList.remove("is-drag-over");
    }
  }

  function bindLaneDrag(handle, laneElement) {
    handle.draggable = true;
    handle.classList.add("lane-draggable");

    handle.addEventListener("dragstart", (event) => {
      invalidateLaneSnapshot();
      state.activeLaneDragId = Number(laneElement.dataset.laneId);
      elements.laneBoard.classList.add("is-dragging-lane");
      laneElement.classList.add("dragging-lane");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(state.activeLaneDragId));
        laneDragPreview = createLaneDragPreview(laneElement);
        const box = laneElement.getBoundingClientRect();
        event.dataTransfer.setDragImage(
          laneDragPreview,
          Math.max(24, event.clientX - box.left),
          Math.max(18, event.clientY - box.top),
        );
      }
    });

    handle.addEventListener("dragend", async () => {
      if (!laneElement.classList.contains("dragging-lane")) {
        return;
      }
      laneElement.classList.remove("dragging-lane");
      clearLaneDropFeedback();
      removeLaneDragPreview();
      state.activeLaneDragId = null;
      invalidateLaneSnapshot();
      laneWriteCount += 1;
      try {
        await persistLaneOrder();
      } finally {
        laneWriteCount -= 1;
      }
    });
  }

  function createLaneDragPreview(laneElement) {
    removeLaneDragPreview();
    const box = laneElement.getBoundingClientRect();
    const height = Math.min(box.height, 420);
    const preview = laneElement.cloneNode(false);
    for (const child of laneElement.children) {
      if (child.matches(".ticket-list")) {
        // The preview starts at the top, even when the source lane is scrolled.
        const firstItem = child.firstElementChild;
        const bottom = (firstItem?.getBoundingClientRect().top ?? box.top) + height;
        preview.append(clonePreviewList(child, bottom));
      } else {
        preview.append(child.cloneNode(true));
      }
    }
    preview.classList.remove("dragging-lane", "is-lane-drop-target");
    preview.classList.add("lane-drag-preview");
    preview.style.width = `${box.width}px`;
    preview.style.height = `${height}px`;
    preview.style.position = "fixed";
    preview.style.top = "-1000px";
    preview.style.left = "-1000px";
    preview.style.pointerEvents = "none";
    preview.setAttribute("aria-hidden", "true");
    document.body.append(preview);
    return preview;
  }

  function clonePreviewList(list, bottom) {
    const preview = list.cloneNode(false);
    for (let item = list.firstElementChild; item; item = item.nextElementSibling) {
      const top = item.getBoundingClientRect().top;
      if (top >= bottom) {
        // Keep the omitted items' extent so the preview retains its scrollbar.
        const lastBottom = list.lastElementChild.getBoundingClientRect().bottom;
        const spacer = document.createElement("div");
        spacer.style.height = `${Math.max(0, lastBottom - top)}px`;
        preview.append(spacer);
        break;
      }
      preview.append(clonePreviewItem(item, bottom));
    }
    return preview;
  }

  function clonePreviewItem(item, bottom) {
    if (!item.matches(".inactive-ticket-summary")) return item.cloneNode(true);
    const preview = item.cloneNode(false);
    for (const child of item.children) {
      preview.append(child.matches(".inactive-ticket-summary-list:not([hidden])")
        ? clonePreviewList(child, bottom)
        : child.cloneNode(true));
    }
    return preview;
  }

  function removeLaneDragPreview() {
    laneDragPreview?.remove();
    laneDragPreview = null;
  }

  function handleLaneDragOver(event) {
    if (!elements.laneBoard.classList.contains("is-dragging-lane")) {
      return;
    }
    const dragging =
      state.activeLaneDragId == null
        ? null
        : elements.laneBoard.querySelector(`.lane[data-lane-id="${state.activeLaneDragId}"]`);
    if (!dragging) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".ticket-list")) {
      return;
    }
    event.preventDefault();
    const afterElement = getLaneAfterElement(elements.laneBoard, event.clientX);
    setLaneDropTarget(afterElement);
    if (!afterElement) {
      elements.laneBoard.append(dragging);
      return;
    }
    elements.laneBoard.insertBefore(dragging, afterElement);
  }

  function setLaneDropTarget(afterElement) {
    for (const lane of elements.laneBoard.querySelectorAll(".lane.is-lane-drop-target")) {
      if (lane !== afterElement) {
        lane.classList.remove("is-lane-drop-target");
      }
    }
    afterElement?.classList.add("is-lane-drop-target");
  }

  function clearLaneDropFeedback() {
    elements.laneBoard.classList.remove("is-dragging-lane");
    for (const lane of elements.laneBoard.querySelectorAll(".lane.is-lane-drop-target")) {
      lane.classList.remove("is-lane-drop-target");
    }
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll(":scope > .ticket-card:not(.dragging)")];
    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
  }

  function getLaneAfterElement(container, x) {
    const lanes = [...container.querySelectorAll(".lane:not(.dragging-lane)")];
    return lanes.reduce(
      (closest, lane) => {
        const box = lane.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: lane };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
  }

  async function persistTicketPosition(card, list) {
    if (!state.boardDetail) {
      return;
    }
    const ticketId = Number(card.dataset.ticketId);
    const laneId = Number(list.dataset.laneId);
    const targetLane = state.boardDetail.lanes.find((lane) => lane.id === laneId);
    const sourceTicket = state.boardDetail.tickets.find((ticket) => ticket.id === ticketId);
    if (targetLane?.isCompletionLane && sourceTicket?.laneId === laneId) {
      await ctx.refreshBoardDetail();
      ctx.showToast(tr("Completion lanes show the most recently completed tickets first."));
      return;
    }
    const cards = [...list.querySelectorAll(".ticket-card[data-ticket-id]")];
    const position = cards.indexOf(card);
    const beforeTicketId = cards[position + 1]?.dataset.ticketId ? Number(cards[position + 1].dataset.ticketId) : null;
    const afterTicketId = cards[position - 1]?.dataset.ticketId ? Number(cards[position - 1].dataset.ticketId) : null;
    try {
      await ctx.api(`/api/tickets/${ticketId}/position`, {
        method: "PATCH",
        body: JSON.stringify({
          laneId,
          position: targetLane?.isCompletionLane ? 0 : Math.max(0, position),
          beforeTicketId: targetLane?.isCompletionLane ? null : beforeTicketId,
          afterTicketId: targetLane?.isCompletionLane ? null : afterTicketId,
        }),
      });
      await ctx.refreshBoardDetail();
    } catch (error) {
      await ctx.refreshBoardDetail();
      ctx.showToast(error.message, "error");
    }
  }

  async function persistLaneOrder() {
    if (!state.boardDetail) {
      return;
    }
    const laneIds = [...elements.laneBoard.querySelectorAll(".lane")].map((lane) => Number(lane.dataset.laneId));
    try {
      await ctx.api(`/api/boards/${state.activeBoardId}/lanes/reorder`, {
        method: "POST",
        body: JSON.stringify({ laneIds }),
      });
      await ctx.refreshBoardDetail();
    } catch (error) {
      await ctx.refreshBoardDetail();
      ctx.showToast(error.message, "error");
    }
  }

  async function createLane() {
    if (!state.activeBoardId) {
      return;
    }
    state.isCreatingLane = true;
    options.renderBoardDetail();
  }

  async function submitLaneCreate(input) {
    if (!state.activeBoardId) {
      return;
    }
    const name = input?.value.trim() ?? "";
    if (!name) {
      cancelLaneCreate();
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}/lanes`, {
      method: "POST",
      body: { name },
    });
    state.isCreatingLane = false;
    await ctx.refreshBoardDetail();
  }

  function cancelLaneCreate() {
    if (!state.isCreatingLane) {
      return;
    }
    state.isCreatingLane = false;
    options.renderBoardDetail();
  }

  async function renameLane(lane, name) {
    const nextName = name?.trim() ?? "";
    if (!nextName || nextName === lane.name) {
      return;
    }
    await ctx.sendJson(`/api/lanes/${lane.id}`, {
      method: "PATCH",
      body: { name: nextName },
    });
    await ctx.refreshBoardDetail();
  }

  async function deleteLane(lane) {
    await ctx.confirmAndRun({
      title: tr("Delete Lane"),
      message: tr("Delete lane \"{name}\"?", { name: lane.name }),
      details: [
        tr("Lane \"{name}\"", { name: lane.name }),
        tr("All tickets, comments, tags, and relations in this lane"),
      ],
      warning: tr("Only empty lanes can be deleted. This action cannot be undone."),
      submitLabel: tr("Delete"),
      run: async () => {
        await ctx.api(`/api/lanes/${lane.id}`, { method: "DELETE" });
        await ctx.refreshBoardDetail();
      },
    });
  }

  document.addEventListener("keydown", rememberNativeTab);
  document.addEventListener("focusin", stopScrollRestoreAfterNativeTab);

  return {
    renderKanbanBoard,
    cancelPendingRender,
    stopKeyboardScrollRestore,
    handleLaneDragOver,
    createLane,
    cancelLaneCreate,
    deleteLane,
    renameLane,
  };
}
