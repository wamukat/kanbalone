export function createBoardModule(ctx) {
  const { state, elements } = ctx;

  function renderBoards() {
    elements.boardList.innerHTML = "";
    for (const board of state.boards) {
      const button = document.createElement("button");
      button.className = `board-button ${board.id === state.activeBoardId ? "active" : ""}`;
      button.textContent = board.name;
      button.addEventListener("click", async () => {
        await ctx.selectBoard(board.id);
      });
      elements.boardList.append(button);
    }
  }

  function renderBoardDetail() {
    const detail = state.boardDetail;
    if (!detail) {
      elements.boardTitle.textContent = "No board selected";
      elements.sidebarTagSection.hidden = true;
      elements.sidebarBoardSection.hidden = true;
      elements.tagFilter.innerHTML = '<option value="">All tags</option>';
      elements.laneFilter.innerHTML = '<option value="">All lanes</option>';
      elements.laneBoard.className = "lane-board empty";
      elements.laneBoard.innerHTML = '<div class="empty-state"><p>Create a board to start tracking tasks.</p></div>';
      elements.listBoard.className = "list-board empty";
      elements.listBoard.innerHTML = '<div class="empty-state"><p>Create a board to start tracking tasks.</p></div>';
      state.selectedListTicketIds = [];
      ctx.syncViewMode();
      return;
    }

    elements.boardTitle.textContent = detail.board.name;
    elements.sidebarTagSection.hidden = false;
    elements.sidebarBoardSection.hidden = false;
    renderSidebarTags();
    elements.tagFilter.innerHTML =
      '<option value="">All tags</option>' +
      detail.tags
        .map(
          (tag) =>
            `<option value="${ctx.escapeHtml(tag.name)}" ${state.filters.tag === tag.name ? "selected" : ""}>${ctx.escapeHtml(tag.name)}</option>`,
        )
        .join("");
    elements.laneFilter.innerHTML =
      '<option value="">All lanes</option>' +
      detail.lanes
        .map(
          (lane) =>
            `<option value="${lane.id}" ${state.filters.lane === String(lane.id) ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`,
        )
        .join("");

    renderKanbanBoard(detail);
    renderListBoard(detail);
    ctx.syncViewMode();
  }

  function renderKanbanBoard(detail) {
    elements.laneBoard.className = "lane-board";
    elements.laneBoard.innerHTML = "";

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
          <button type="button" class="icon-button" data-action="rename-lane" title="Rename lane">✎</button>
          <button type="button" class="icon-button danger" data-action="delete-lane" title="Delete lane">×</button>
        </div>
      `;

      const list = document.createElement("div");
      list.className = "ticket-list";
      list.dataset.laneId = String(lane.id);
      bindDropZone(list);

      for (const ticket of laneTickets) {
        list.append(createTicketCard(ticket));
      }

      const addTicketButton = document.createElement("button");
      addTicketButton.type = "button";
      addTicketButton.className = "add-ticket-button icon-button";
      addTicketButton.textContent = "+";
      addTicketButton.title = "New ticket";
      addTicketButton.addEventListener("click", () => ctx.openEditor(null, "edit", lane.id));

      header.querySelector("[data-action='rename-lane']").addEventListener("click", () => renameLane(lane));
      header.querySelector("[data-action='delete-lane']").addEventListener("click", () => deleteLane(lane));
      bindLaneDrag(header.querySelector("[data-action='drag-lane']"), laneElement);

      laneElement.append(header, list, addTicketButton);
      elements.laneBoard.append(laneElement);
    }

    const addLaneButton = document.createElement("button");
    addLaneButton.type = "button";
    addLaneButton.className = "add-lane-button icon-button";
    addLaneButton.textContent = "+";
    addLaneButton.title = "New lane";
    addLaneButton.addEventListener("click", createLane);
    elements.laneBoard.append(addLaneButton);
  }

  function renderListBoard(detail) {
    state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => detail.tickets.some((ticket) => ticket.id === ticketId));
    if (detail.tickets.length === 0) {
      elements.listBoard.className = "list-board empty";
      elements.listBoard.innerHTML = '<div class="empty-state"><p>No tickets match the current filters.</p></div>';
      return;
    }
    elements.listBoard.className = "list-board";
    const orderedTickets = getListTickets(detail.tickets);
    const visibleTicketIds = orderedTickets.map(({ ticket }) => ticket.id);
    const allSelected = visibleTicketIds.length > 0 && visibleTicketIds.every((ticketId) => state.selectedListTicketIds.includes(ticketId));
    const doneButton = `<button type="button" class="list-action-button" data-bulk-complete="true" ${state.selectedListTicketIds.length === 0 ? "disabled" : ""}>Mark Done</button>`;
    const openButton = `<button type="button" class="list-action-button" data-bulk-complete="false" ${state.selectedListTicketIds.length === 0 ? "disabled" : ""}>Mark Open</button>`;
    elements.listBoard.innerHTML = `
      <div class="list-actions">${doneButton}${openButton}</div>
      <div class="list-header">
        <div><input type="checkbox" id="list-select-all" ${allSelected ? "checked" : ""} /></div>
        <div>ID / Title</div>
        <div>Blockers</div>
        <div>Tags</div>
        <div>Priority</div>
        <div>Status</div>
      </div>
      ${orderedTickets.map(renderListRow).join("")}
      <div class="list-actions">${doneButton}${openButton}</div>
    `;
    elements.listBoard.querySelectorAll("input[data-list-ticket-id]").forEach((input) => {
      input.addEventListener("change", handleListTicketSelection);
    });
    const selectAll = elements.listBoard.querySelector("#list-select-all");
    if (selectAll) {
      const selectedCount = visibleTicketIds.filter((ticketId) => state.selectedListTicketIds.includes(ticketId)).length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleTicketIds.length;
      selectAll.addEventListener("change", (event) => {
        handleListSelectAll(event, visibleTicketIds);
      });
    }
    elements.listBoard.querySelectorAll("button[data-open-ticket-id]").forEach((button) => {
      button.addEventListener("click", () => ctx.openEditor(Number(button.dataset.openTicketId), "view"));
    });
    elements.listBoard.querySelectorAll(".list-action-button").forEach((button) => {
      button.addEventListener("click", async () => {
        await updateSelectedListTickets(button.dataset.bulkComplete === "true");
      });
    });
  }

  function getListTickets(tickets) {
    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const roots = tickets
      .filter((ticket) => ticket.parentTicketId == null || !byId.has(ticket.parentTicketId))
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
    const ordered = [];
    const seen = new Set();
    for (const root of roots) {
      ordered.push({ ticket: root, indent: 0 });
      seen.add(root.id);
      const children = tickets
        .filter((candidate) => candidate.parentTicketId === root.id)
        .sort((a, b) => a.priority - b.priority || a.id - b.id);
      for (const child of children) {
        ordered.push({ ticket: child, indent: 1 });
        seen.add(child.id);
      }
    }
    for (const ticket of tickets.sort((a, b) => a.priority - b.priority || a.id - b.id)) {
      if (!seen.has(ticket.id)) {
        ordered.push({ ticket, indent: ticket.parentTicketId == null ? 0 : 1 });
      }
    }
    return ordered;
  }

  function renderListRow(entry) {
    const { ticket, indent } = entry;
    const tags = ticket.tags
      .map((tag) => `<span class="tag" style="background:${ctx.escapeHtml(tag.color)}">${ctx.escapeHtml(tag.name)}</span>`)
      .join("");
    const blockedByTickets = state.boardTickets.filter((candidate) => ticket.blockerIds.includes(candidate.id));
    const blockedBy = blockedByTickets.length
      ? `blocked by ${blockedByTickets
          .map(
            (blocker) =>
              `<span class="ticket-ref-inline${blocker.isCompleted ? " ticket-ref-completed" : ""}">#${blocker.id}</span>`,
          )
          .join(", ")}`
      : "";
    const blocks = state.boardTickets
      .filter((candidate) => candidate.id !== ticket.id && candidate.blockerIds.includes(ticket.id))
      .map(
        (candidate) =>
          `<span class="ticket-ref-inline${candidate.isCompleted ? " ticket-ref-completed" : ""}">#${candidate.id}</span>`,
      );
    const relations = [
      blockedBy,
      blocks.length ? `blocks ${blocks.join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    const lane = state.boardDetail.lanes.find((item) => item.id === ticket.laneId);
    return `
      <div class="list-row ${ticket.isCompleted ? "completed" : ""}">
        <input type="checkbox" data-list-ticket-id="${ticket.id}" ${state.selectedListTicketIds.includes(ticket.id) ? "checked" : ""} />
        <button type="button" class="list-ticket-link indent-${indent}" data-open-ticket-id="${ticket.id}">
          <span class="ticket-id">#${ticket.id}</span>
          <span>${ctx.escapeHtml(ticket.title)}</span>
        </button>
        <div class="list-cell muted">${relations || "-"}</div>
        <div class="tag-list">${tags || '<span class="muted">-</span>'}</div>
        <div class="list-cell">P${ticket.priority}</div>
        <div class="list-cell muted">${ticket.isCompleted ? "Done" : ctx.escapeHtml(lane?.name || "Open")}</div>
      </div>
    `;
  }

  async function updateSelectedListTickets(isCompleted) {
    const ticketIds = [...state.selectedListTicketIds];
    if (ticketIds.length === 0) {
      return;
    }
    for (const ticketId of ticketIds) {
      await ctx.sendJson(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        body: { isCompleted },
      });
    }
    state.selectedListTicketIds = [];
    await ctx.refreshBoardDetail();
  }

  function handleListTicketSelection(event) {
    const ticketId = Number(event.target.dataset.listTicketId);
    if (event.target.checked) {
      state.selectedListTicketIds = [...new Set([...state.selectedListTicketIds, ticketId])];
    } else {
      state.selectedListTicketIds = state.selectedListTicketIds.filter((id) => id !== ticketId);
    }
    ctx.syncListActionButtons();
    syncListSelectAllState();
  }

  function handleListSelectAll(event, visibleTicketIds) {
    if (event.target.checked) {
      state.selectedListTicketIds = [...new Set([...state.selectedListTicketIds, ...visibleTicketIds])];
    } else {
      const visibleSet = new Set(visibleTicketIds);
      state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => !visibleSet.has(ticketId));
    }
    renderListBoard(state.boardDetail);
    ctx.syncListActionButtons();
  }

  function syncListSelectAllState() {
    const selectAll = elements.listBoard.querySelector("#list-select-all");
    if (!selectAll || !state.boardDetail) {
      return;
    }
    const visibleTicketIds = state.boardDetail.tickets.map((ticket) => ticket.id);
    const selectedCount = visibleTicketIds.filter((ticketId) => state.selectedListTicketIds.includes(ticketId)).length;
    selectAll.checked = visibleTicketIds.length > 0 && selectedCount === visibleTicketIds.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleTicketIds.length;
  }

  function createTicketCard(ticket) {
    const card = document.createElement("article");
    card.className = `ticket-card ${ticket.isCompleted ? "completed" : ""}`;
    card.draggable = true;
    card.dataset.ticketId = String(ticket.id);
    card.innerHTML = `
      <div class="ticket-head">
        <span class="ticket-id">#${ticket.id}</span>
        <button type="button" class="ticket-link">${ctx.escapeHtml(ticket.title)}</button>
      </div>
      <div class="tag-list">
        ${ticket.tags.map((tag) => `<span class="tag" style="background:${ctx.escapeHtml(tag.color)}">${ctx.escapeHtml(tag.name)}</span>`).join("")}
      </div>
    `;

    const titleButton = card.querySelector(".ticket-link");
    titleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      ctx.openEditor(ticket.id, "view");
    });
    card.addEventListener("dragstart", () => {
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
    return card;
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

  async function createBoard() {
    const values = await ctx.requestFields({
      title: "New Board",
      submitLabel: "Create",
      fields: [{ id: "name", label: "Board name", value: "", required: true }],
    });
    if (!values) {
      return;
    }
    const created = await ctx.sendJson("/api/boards", {
      method: "POST",
      body: { name: values.name },
    });
    state.activeBoardId = created.board.id;
    await ctx.refreshBoards();
    ctx.syncBoardUrl();
  }

  async function createLane() {
    if (!state.activeBoardId) {
      return;
    }
    const values = await ctx.requestFields({
      title: "New Lane",
      submitLabel: "Create",
      fields: [{ id: "name", label: "Lane name", value: "", required: true }],
    });
    if (!values) {
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}/lanes`, {
      method: "POST",
      body: { name: values.name },
    });
    await ctx.refreshBoardDetail();
  }

  async function renameBoard() {
    if (!state.boardDetail) {
      return;
    }
    const values = await ctx.requestFields({
      title: "Rename Board",
      submitLabel: "Save",
      fields: [{ id: "name", label: "Board name", value: state.boardDetail.board.name, required: true }],
    });
    if (!values) {
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}`, {
      method: "PATCH",
      body: { name: values.name },
    });
    await ctx.refreshBoards();
  }

  async function deleteBoard() {
    if (!state.boardDetail) {
      return;
    }
    const board = state.boardDetail.board;
    const nextBoard = state.boards.find((entry) => entry.id !== board.id) ?? null;
    await ctx.confirmAndRun({
      title: "Delete Board",
      message: `Delete board "${board.name}" and all of its tickets?`,
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/boards/${board.id}`, { method: "DELETE" });
        state.activeBoardId = nextBoard?.id ?? null;
        await ctx.refreshBoards();
        ctx.syncBoardUrl();
      },
    });
  }

  async function createTag() {
    if (!state.activeBoardId) {
      return;
    }
    const values = await ctx.requestFields({
      title: "New Tag",
      submitLabel: "Create",
      fields: [
        { id: "name", label: "Tag name", value: "", required: true },
        { id: "color", label: "Color", value: "#1f6f5f", required: true, type: "color" },
      ],
    });
    if (!values) {
      return;
    }
    const created = await ctx.sendJson(`/api/boards/${state.activeBoardId}/tags`, {
      method: "POST",
      body: { name: values.name, color: values.color },
    });
    await ctx.refreshBoardDetail();
    state.editorTagIds = [...new Set([...state.editorTagIds, created.id])];
    ctx.syncTicketTagOptions();
  }

  function renderSidebarTags() {
    const tags = state.boardDetail?.tags ?? [];
    if (tags.length === 0) {
      elements.sidebarTagList.innerHTML = '<p class="tag-manager-empty muted">No tags yet.</p>';
      return;
    }

    elements.sidebarTagList.innerHTML = "";
    for (const tag of tags) {
      const row = document.createElement("div");
      row.className = "sidebar-tag-row";
      row.innerHTML = `
        <span class="sidebar-tag-badge" style="background:${ctx.escapeHtml(tag.color)}">${ctx.escapeHtml(tag.name)}</span>
        <button type="button" class="icon-button" title="Edit tag">✎</button>
      `;
      row.querySelector('button[title="Edit tag"]').addEventListener("click", async () => {
        const result = await ctx.requestFieldsAction({
          title: "Edit Tag",
          submitLabel: "Save",
          dangerLabel: "Delete",
          fields: [
            { id: "name", label: "Tag name", value: tag.name, required: true },
            { id: "color", label: "Color", value: tag.color, required: true, type: "color" },
          ],
        });
        if (!result) {
          return;
        }
        try {
          if (result.action === "danger") {
            await ctx.api(`/api/tags/${tag.id}`, { method: "DELETE" });
            ctx.showToast("Tag deleted");
          } else if (result.action === "submit") {
            await ctx.sendJson(`/api/tags/${tag.id}`, {
              method: "PATCH",
              body: { name: result.values.name, color: result.values.color },
            });
            ctx.showToast("Tag updated");
          }
          await ctx.refreshBoardDetail();
          ctx.syncTicketTagOptions();
          renderSidebarTags();
        } catch (error) {
          ctx.showToast(error.message, "error");
        }
      });

      elements.sidebarTagList.append(row);
    }
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

  async function exportBoard() {
    if (!state.activeBoardId) {
      return;
    }
    const payload = await ctx.api(`/api/boards/${state.activeBoardId}/export`);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${payload.board.name.replace(/\s+/g, "-").toLowerCase() || "board"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBoard(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const payload = JSON.parse(await file.text());
    const imported = await ctx.api("/api/boards/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.activeBoardId = imported.board.id;
    event.target.value = "";
    await ctx.refreshBoards();
    ctx.syncBoardUrl();
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("soloboard:sidebar-collapsed", String(state.sidebarCollapsed));
    syncSidebar();
  }

  function syncSidebar() {
    elements.shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    elements.sidebarReopenButton.hidden = !state.sidebarCollapsed;
    elements.sidebarToggleButton.textContent = state.sidebarCollapsed ? "☰" : "⟨";
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

  return {
    renderBoards,
    renderBoardDetail,
    renderSidebarTags,
    handleLaneDragOver,
    createBoard,
    createLane,
    renameBoard,
    deleteBoard,
    createTag,
    renameLane,
    deleteLane,
    exportBoard,
    importBoard,
    toggleSidebar,
    syncSidebar,
    syncListActionButtons: ctx.syncListActionButtons,
  };
}
