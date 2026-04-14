import { takeRoundRobinBatch } from "./app-board-utils.js";
import { createKanbanLane, createKanbanLaneInputColumn } from "./app-kanban-lane.js";
import { createKanbanTicketCard } from "./app-kanban-ticket-card.js";
import { icon } from "./icons.js";

export function createKanbanBoardModule(ctx, options) {
  const { state, elements } = ctx;
  let kanbanRenderToken = 0;
  let kanbanNextLaneIndex = 0;
  let laneDragPreview = null;

  function cancelPendingRender() {
    kanbanRenderToken += 1;
    kanbanNextLaneIndex = 0;
  }

  function renderKanbanBoard(detail) {
    const renderToken = ++kanbanRenderToken;
    kanbanNextLaneIndex = 0;
    elements.laneBoard.className = "lane-board";
    elements.laneBoard.innerHTML = "";
    const laneQueues = [];

    for (const lane of detail.lanes.sort((a, b) => a.position - b.position)) {
      const laneTickets = detail.tickets.filter((item) => item.laneId === lane.id).sort((a, b) => a.position - b.position);
      const { laneElement, list } = createKanbanLane(ctx, lane, laneTickets, {
        bindDropZone,
        bindLaneDrag,
        deleteLane,
        renameLane,
      });

      elements.laneBoard.append(laneElement);
      laneQueues.push({ list, tickets: laneTickets, index: 0 });
    }

    const addLaneButton = document.createElement("button");
    if (state.isCreatingLane) {
      elements.laneBoard.append(createLaneInputColumn());
    } else {
      addLaneButton.type = "button";
      addLaneButton.className = "add-lane-button icon-button";
      addLaneButton.innerHTML = icon("plus");
      addLaneButton.title = "New lane";
      addLaneButton.setAttribute("aria-label", "New lane");
      addLaneButton.addEventListener("click", createLane);
      elements.laneBoard.append(addLaneButton);
    }

    renderKanbanTicketsInBatches(renderToken, laneQueues);
  }

  function createLaneInputColumn() {
    return createKanbanLaneInputColumn(submitLaneCreate, cancelLaneCreate);
  }

  function renderKanbanTicketsInBatches(renderToken, laneQueues) {
    const batchSize = 120;
    function step() {
      if (renderToken !== kanbanRenderToken) {
        return;
      }
      const { selections, nextLaneIndex } = takeRoundRobinBatch(laneQueues, kanbanNextLaneIndex, batchSize);
      kanbanNextLaneIndex = nextLaneIndex;
      const fragments = new Map();
      for (const selection of selections) {
        const queue = laneQueues[selection.laneIndex];
        const fragment = fragments.get(selection.laneIndex) ?? document.createDocumentFragment();
        fragment.append(createKanbanTicketCard(ctx, queue.tickets[selection.ticketIndex]));
        fragments.set(selection.laneIndex, fragment);
      }
      for (const [laneIndex, fragment] of fragments.entries()) {
        laneQueues[laneIndex].list.append(fragment);
      }
      if (laneQueues.some((queue) => queue.index < queue.tickets.length)) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function bindDropZone(list) {
    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = document.querySelector(".ticket-card.dragging");
      if (!dragging) {
        return;
      }
      setActiveDropLane(list);
      const afterElement = getDragAfterElement(list, event.clientY);
      if (!afterElement) {
        list.append(dragging);
        return;
      }
      list.insertBefore(dragging, afterElement);
    });

    list.addEventListener("drop", async (event) => {
      if (!document.querySelector(".ticket-card.dragging")) {
        return;
      }
      event.preventDefault();
      clearDropLaneFeedback();
      await persistTicketOrder();
    });

    list.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) {
        return;
      }
      list.closest(".lane")?.classList.remove("is-drag-over");
    });
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
    elements.laneBoard.classList.remove("is-dragging-ticket");
    for (const lane of elements.laneBoard.querySelectorAll(".lane.is-drag-over")) {
      lane.classList.remove("is-drag-over");
    }
  }

  function bindLaneDrag(handle, laneElement) {
    handle.draggable = true;
    handle.classList.add("lane-draggable");

    handle.addEventListener("dragstart", (event) => {
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
      await persistLaneOrder();
    });
  }

  function createLaneDragPreview(laneElement) {
    removeLaneDragPreview();
    const preview = laneElement.cloneNode(true);
    const box = laneElement.getBoundingClientRect();
    preview.classList.remove("dragging-lane", "is-lane-drop-target");
    preview.classList.add("lane-drag-preview");
    preview.style.width = `${box.width}px`;
    preview.style.height = `${Math.min(box.height, 420)}px`;
    preview.setAttribute("aria-hidden", "true");
    document.body.append(preview);
    return preview;
  }

  function removeLaneDragPreview() {
    laneDragPreview?.remove();
    laneDragPreview = null;
  }

  function handleLaneDragOver(event) {
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
    const draggableElements = [...container.querySelectorAll(".ticket-card:not(.dragging)")];
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

  async function persistTicketOrder() {
    if (!state.boardDetail) {
      return;
    }
    const items = [...document.querySelectorAll(".ticket-list")].flatMap((list) =>
      [...list.children].map((card, index) => ({
        ticketId: Number(card.dataset.ticketId),
        laneId: Number(list.dataset.laneId),
        position: index,
      })),
    );
    await ctx.api(`/api/boards/${state.activeBoardId}/tickets/reorder`, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    await ctx.refreshBoardDetail();
  }

  async function persistLaneOrder() {
    if (!state.boardDetail) {
      return;
    }
    const laneIds = [...elements.laneBoard.querySelectorAll(".lane")].map((lane) => Number(lane.dataset.laneId));
    await ctx.api(`/api/boards/${state.activeBoardId}/lanes/reorder`, {
      method: "POST",
      body: JSON.stringify({ laneIds }),
    });
    await ctx.refreshBoardDetail();
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
      title: "Delete Lane",
      message: `Delete lane "${lane.name}"?`,
      details: [
        `Lane "${lane.name}"`,
        "All tickets, comments, tags, and relations in this lane",
      ],
      warning: "Only empty lanes can be deleted. This action cannot be undone.",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/lanes/${lane.id}`, { method: "DELETE" });
        await ctx.refreshBoardDetail();
      },
    });
  }

  return {
    renderKanbanBoard,
    cancelPendingRender,
    handleLaneDragOver,
    createLane,
    cancelLaneCreate,
    renameLane,
    deleteLane,
  };
}
