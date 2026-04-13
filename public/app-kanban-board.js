import { takeRoundRobinBatch } from "./app-board-utils.js";
import { createInlineTextForm } from "./app-inline-text-form.js";
import { createKanbanTicketCard } from "./app-kanban-ticket-card.js";
import { icon } from "./icons.js";

export function createKanbanBoardModule(ctx, options) {
  const { state, elements } = ctx;
  let kanbanRenderToken = 0;
  let kanbanNextLaneIndex = 0;

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
      const laneElement = document.createElement("section");
      laneElement.className = "lane";
      laneElement.dataset.laneId = String(lane.id);

      const header = document.createElement("div");
      header.className = "lane-header";
      header.innerHTML = `
        <div class="lane-title-row">
          <h3 class="lane-title" data-action="drag-lane" title="Drag to reorder">${ctx.escapeHtml(lane.name)}</h3>
          <span class="lane-count">${laneTickets.length}</span>
        </div>
        <div class="lane-actions">
          <button type="button" class="icon-button action-menu-toggle" data-action="toggle-lane-actions" title="Lane actions" aria-label="Lane actions" aria-expanded="false">${icon("ellipsis")}</button>
          <span class="inline-action-menu" hidden>
            <button type="button" class="icon-button" data-action="rename-lane" title="Rename lane" aria-label="Rename lane">${icon("pencil")}</button>
            <button type="button" class="icon-button danger" data-action="delete-lane" title="Delete lane" aria-label="Delete lane">${icon("trash-2")}</button>
          </span>
        </div>
      `;

      const list = document.createElement("div");
      list.className = "ticket-list";
      list.dataset.laneId = String(lane.id);
      bindDropZone(list);

      const addTicketButton = document.createElement("button");
      addTicketButton.type = "button";
      addTicketButton.className = "add-ticket-button icon-button";
      addTicketButton.innerHTML = icon("plus");
      addTicketButton.title = "New ticket";
      addTicketButton.setAttribute("aria-label", "New ticket");
      addTicketButton.addEventListener("click", () => ctx.openEditor(null, "edit", lane.id));

      header.querySelector("[data-action='rename-lane']").addEventListener("click", () => renameLane(lane));
      header.querySelector("[data-action='delete-lane']").addEventListener("click", () => deleteLane(lane));
      header.querySelector("[data-action='toggle-lane-actions']").addEventListener("click", (event) => {
        toggleInlineActionMenu(event.currentTarget);
      });
      bindLaneDrag(header.querySelector("[data-action='drag-lane']"), laneElement);

      laneElement.append(header, list, addTicketButton);
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
    return createInlineTextForm({
      className: "lane lane-create-column",
      html: `
        <label class="lane-create-label" for="lane-create-input">New lane</label>
        <input id="lane-create-input" type="text" data-lane-create-input aria-label="Lane name" placeholder="Lane name" autocomplete="off" />
      `,
      inputSelector: "[data-lane-create-input]",
      onSubmit: submitLaneCreate,
      onCancel: cancelLaneCreate,
    });
  }

  function toggleInlineActionMenu(toggleButton) {
    const menu = toggleButton.parentElement?.querySelector(".inline-action-menu");
    if (!menu) {
      return;
    }
    const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
    toggleButton.setAttribute("aria-expanded", String(!isExpanded));
    menu.hidden = false;
    menu.classList.toggle("expanded", !isExpanded);
    menu.toggleAttribute("inert", isExpanded);
    if (isExpanded) {
      window.setTimeout(() => {
        if (!menu.classList.contains("expanded")) {
          menu.hidden = true;
        }
      }, 180);
    }
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
      await persistTicketOrder();
    });
  }

  function bindLaneDrag(handle, laneElement) {
    handle.draggable = true;
    handle.classList.add("lane-draggable");

    handle.addEventListener("dragstart", (event) => {
      state.activeLaneDragId = Number(laneElement.dataset.laneId);
      laneElement.classList.add("dragging-lane");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(state.activeLaneDragId));
      }
    });

    handle.addEventListener("dragend", async () => {
      if (!laneElement.classList.contains("dragging-lane")) {
        return;
      }
      laneElement.classList.remove("dragging-lane");
      state.activeLaneDragId = null;
      await persistLaneOrder();
    });
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
    if (!afterElement) {
      elements.laneBoard.append(dragging);
      return;
    }
    elements.laneBoard.insertBefore(dragging, afterElement);
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

  async function renameLane(lane) {
    const values = await ctx.requestFields({
      title: "Rename Lane",
      submitLabel: "Save",
      fields: [{ id: "name", label: "Lane name", value: lane.name, required: true }],
    });
    if (!values) {
      return;
    }
    await ctx.sendJson(`/api/lanes/${lane.id}`, {
      method: "PATCH",
      body: { name: values.name },
    });
    await ctx.refreshBoardDetail();
  }

  async function deleteLane(lane) {
    await ctx.confirmAndRun({
      title: "Delete Lane",
      message: `Delete lane "${lane.name}"? Empty lanes only.`,
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
