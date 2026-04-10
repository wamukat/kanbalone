export function createEditorModule(ctx) {
  const { state, elements } = ctx;

  function getSelectedTagIds() {
    return [...state.editorTagIds];
  }

  function getBoardTickets() {
    return state.boardTickets ?? [];
  }

  function getTicketById(ticketId) {
    return getBoardTickets().find((ticket) => ticket.id === ticketId) ?? null;
  }

  function hasChildOnBoard(ticketId) {
    return getBoardTickets().some((ticket) => ticket.parentTicketId === ticketId);
  }

  function getBlockingTickets(ticketId) {
    return getBoardTickets().filter((ticket) => ticket.id !== ticketId && ticket.blockerIds.includes(ticketId));
  }

  function formatTicketChoice(ticket) {
    return `#${ticket.id} P${ticket.priority} ${ticket.title}`;
  }

  function matchTicketQuery(ticket, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    const idText = String(ticket.id);
    const hashText = `#${ticket.id}`;
    return idText.includes(normalized) || hashText.includes(normalized) || ticket.title.toLowerCase().includes(normalized);
  }

  function renderTagSummaryChip(tag) {
    return `<button type="button" class="ticket-tag-chip" data-remove-tag-id="${tag.id}" style="background:${ctx.escapeHtml(tag.color)}" title="Remove ${ctx.escapeHtml(tag.name)}">${ctx.escapeHtml(tag.name)} <span aria-hidden="true">×</span></button>`;
  }

  function renderTicketSummaryChip(ticket, removeAttr) {
    return `<button type="button" class="ticket-tag-chip ticket-ref-chip" ${removeAttr}="${ticket.id}" title="Remove ${ctx.escapeHtml(formatTicketChoice(ticket))}"><span class="ticket-ref-chip-id">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span><span aria-hidden="true">×</span></button>`;
  }

  function renderTicketOption(ticket, attrName, isSelected) {
    return `
      <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" ${attrName}="${ticket.id}" role="option" aria-selected="${isSelected}">
        <span class="ticket-picker-id">#${ticket.id}</span>
        <span class="tag-picker-text">${ctx.escapeHtml(ticket.title)}</span>
        <span class="ticket-picker-meta">P${ticket.priority}${ticket.isCompleted ? " Done" : ""}</span>
      </button>
    `;
  }

  function syncTicketTagOptions() {
    if (!state.boardDetail) {
      return;
    }
    const availableTagIds = new Set(state.boardDetail.tags.map((tag) => tag.id));
    state.editorTagIds = state.editorTagIds.filter((id) => availableTagIds.has(id));
    const selectedTags = state.boardDetail.tags.filter((tag) => state.editorTagIds.includes(tag.id));
    elements.ticketTagSummary.innerHTML = selectedTags.length
      ? selectedTags.map(renderTagSummaryChip).join("")
      : '<span class="ticket-tag-placeholder">Add tags</span>';

    if (state.boardDetail.tags.length === 0) {
      elements.ticketTagOptions.innerHTML = '<div class="tag-picker-empty">No tags</div>';
      return;
    }

    const query = state.tagQuery.trim().toLowerCase();
    const visibleTags = state.boardDetail.tags.filter((tag) => {
      if (state.editorTagIds.includes(tag.id)) {
        return true;
      }
      if (!query) {
        return true;
      }
      return tag.name.toLowerCase().includes(query);
    });

    elements.ticketTagOptions.innerHTML = visibleTags.length
      ? visibleTags
          .map((tag) => {
            const isSelected = state.editorTagIds.includes(tag.id);
            return `
              <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" data-tag-id="${tag.id}" role="option" aria-selected="${isSelected}">
                <span class="tag-picker-swatch" style="background:${ctx.escapeHtml(tag.color)}"></span>
                <span class="tag-picker-text">${ctx.escapeHtml(tag.name)}</span>
                <span class="tag-picker-check" aria-hidden="true">${isSelected ? "✓" : ""}</span>
              </button>
            `;
          })
          .join("")
      : '<div class="tag-picker-empty">No matching tags</div>';
  }

  function getAvailableBlockerTickets() {
    const currentId = state.editingTicketId;
    return getBoardTickets()
      .filter((ticket) => ticket.id !== currentId)
      .filter((ticket) => currentId == null || !ticket.blockerIds.includes(currentId))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function getSelectedParentId() {
    return elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
  }

  function getAvailableParentTickets() {
    return getBoardTickets()
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => ticket.parentTicketId == null)
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function syncParentOptions() {
    const selectedParent = getTicketById(getSelectedParentId());
    elements.ticketParentSummary.innerHTML = selectedParent
      ? renderTicketSummaryChip(selectedParent, "data-remove-parent-id")
      : '<span class="ticket-tag-placeholder">No parent</span>';

    const visibleTickets = getAvailableParentTickets().filter((ticket) => {
      if (selectedParent?.id === ticket.id) {
        return true;
      }
      return matchTicketQuery(ticket, state.parentQuery);
    });

    elements.ticketParentOptions.innerHTML = visibleTickets.length
      ? visibleTickets.map((ticket) => renderTicketOption(ticket, "data-parent-id", selectedParent?.id === ticket.id)).join("")
      : '<div class="tag-picker-empty">No matching tickets</div>';
  }

  function openParentOptions() {
    closeTicketTagOptions();
    closeBlockerOptions();
    closeChildOptions();
    elements.ticketParentOptions.hidden = false;
    elements.ticketParentToggle.setAttribute("aria-expanded", "true");
  }

  function closeParentOptions() {
    elements.ticketParentOptions.hidden = true;
    elements.ticketParentToggle.setAttribute("aria-expanded", "false");
  }

  function handleParentFieldClick(event) {
    const removeButton = event.target.closest("[data-remove-parent-id]");
    if (removeButton) {
      event.preventDefault();
      setParent(null);
      return;
    }
    openParentOptions();
    elements.ticketParentSearch.focus();
  }

  function handleParentSearchInput(event) {
    state.parentQuery = event.target.value;
    openParentOptions();
    syncParentOptions();
  }

  function handleParentSearchKeydown(event) {
    if (event.key === "Backspace" && !elements.ticketParentSearch.value && getSelectedParentId() != null) {
      event.preventDefault();
      setParent(null);
      return;
    }
    if (event.key === "Enter") {
      const firstOption = elements.ticketParentOptions.querySelector("[data-parent-id]");
      if (firstOption) {
        event.preventDefault();
        setParent(Number(firstOption.dataset.parentId));
      }
      return;
    }
    if (event.key === "Escape") {
      closeParentOptions();
      elements.ticketParentSearch.blur();
    }
  }

  function setParent(ticketId) {
    elements.ticketParent.value = ticketId == null ? "" : String(ticketId);
    state.parentQuery = "";
    elements.ticketParentSearch.value = "";
    syncParentOptions();
    handleParentChange();
    openParentOptions();
    elements.ticketParentSearch.focus();
  }

  function syncBlockerOptions() {
    const selectedTickets = state.editorBlockerIds.map(getTicketById).filter(Boolean);
    elements.ticketBlockerSummary.innerHTML = selectedTickets.length
      ? selectedTickets.map((ticket) => renderTicketSummaryChip(ticket, "data-remove-blocker-id")).join("")
      : '<span class="ticket-tag-placeholder">Add blockers</span>';

    const visibleTickets = getAvailableBlockerTickets().filter((ticket) => {
      if (state.editorBlockerIds.includes(ticket.id)) {
        return true;
      }
      return matchTicketQuery(ticket, state.blockerQuery);
    });

    elements.ticketBlockerOptions.innerHTML = visibleTickets.length
      ? visibleTickets.map((ticket) => renderTicketOption(ticket, "data-blocker-id", state.editorBlockerIds.includes(ticket.id))).join("")
      : '<div class="tag-picker-empty">No matching tickets</div>';
  }

  function openBlockerOptions() {
    closeTicketTagOptions();
    closeChildOptions();
    elements.ticketBlockerOptions.hidden = false;
    elements.ticketBlockerToggle.setAttribute("aria-expanded", "true");
  }

  function closeBlockerOptions() {
    elements.ticketBlockerOptions.hidden = true;
    elements.ticketBlockerToggle.setAttribute("aria-expanded", "false");
  }

  function handleBlockerFieldClick(event) {
    const removeButton = event.target.closest("[data-remove-blocker-id]");
    if (removeButton) {
      event.preventDefault();
      toggleBlocker(Number(removeButton.dataset.removeBlockerId));
      return;
    }
    openBlockerOptions();
    elements.ticketBlockerSearch.focus();
  }

  function handleBlockerSearchInput(event) {
    state.blockerQuery = event.target.value;
    openBlockerOptions();
    syncBlockerOptions();
  }

  function handleBlockerSearchKeydown(event) {
    if (event.key === "Backspace" && !elements.ticketBlockerSearch.value && state.editorBlockerIds.length > 0) {
      event.preventDefault();
      state.editorBlockerIds = state.editorBlockerIds.slice(0, -1);
      syncBlockerOptions();
      return;
    }
    if (event.key === "Enter") {
      const firstOption = elements.ticketBlockerOptions.querySelector("[data-blocker-id]");
      if (firstOption) {
        event.preventDefault();
        toggleBlocker(Number(firstOption.dataset.blockerId));
      }
      return;
    }
    if (event.key === "Escape") {
      closeBlockerOptions();
      elements.ticketBlockerSearch.blur();
    }
  }

  function toggleBlocker(ticketId) {
    if (state.editorBlockerIds.includes(ticketId)) {
      state.editorBlockerIds = state.editorBlockerIds.filter((id) => id !== ticketId);
    } else {
      state.editorBlockerIds = [...state.editorBlockerIds, ticketId];
    }
    state.blockerQuery = "";
    elements.ticketBlockerSearch.value = "";
    syncBlockerOptions();
    openBlockerOptions();
    elements.ticketBlockerSearch.focus();
  }

  function getAvailableChildTickets() {
    if (!state.editingTicketId || getSelectedParentId() != null) {
      return [];
    }
    return getBoardTickets()
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => state.editorChildIds.includes(ticket.id) || (ticket.parentTicketId == null && !hasChildOnBoard(ticket.id)))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function syncChildPickerAvailability() {
    const canEditChildren = Boolean(state.editingTicketId) && getSelectedParentId() == null;
    elements.ticketChildrenRow.hidden = !state.editingTicketId;
    elements.ticketChildSearch.disabled = !canEditChildren;
    elements.ticketChildToggle.classList.toggle("is-disabled", !canEditChildren);
    if (!canEditChildren) {
      closeChildOptions();
      if (getSelectedParentId() != null) {
        state.editorChildIds = [];
      }
    }
  }

  function syncChildOptions() {
    const selectedTickets = state.editorChildIds.map(getTicketById).filter(Boolean);
    elements.ticketChildSummary.innerHTML = selectedTickets.length
      ? selectedTickets.map((ticket) => renderTicketSummaryChip(ticket, "data-remove-child-id")).join("")
      : `<span class="ticket-tag-placeholder">${state.editingTicketId ? (getSelectedParentId() != null ? "Clear parent to edit children" : "Add children") : "Save ticket first"}</span>`;

    if (!state.editingTicketId || getSelectedParentId() != null) {
      elements.ticketChildOptions.innerHTML = '<div class="tag-picker-empty">Children cannot be edited while this ticket has a parent</div>';
      return;
    }

    const visibleTickets = getAvailableChildTickets().filter((ticket) => {
      if (state.editorChildIds.includes(ticket.id)) {
        return true;
      }
      return matchTicketQuery(ticket, state.childQuery);
    });

    elements.ticketChildOptions.innerHTML = visibleTickets.length
      ? visibleTickets.map((ticket) => renderTicketOption(ticket, "data-child-id", state.editorChildIds.includes(ticket.id))).join("")
      : '<div class="tag-picker-empty">No matching tickets</div>';
  }

  function openChildOptions() {
    if (!state.editingTicketId || getSelectedParentId() != null) {
      return;
    }
    closeTicketTagOptions();
    closeParentOptions();
    closeBlockerOptions();
    elements.ticketChildOptions.hidden = false;
    elements.ticketChildToggle.setAttribute("aria-expanded", "true");
  }

  function closeChildOptions() {
    elements.ticketChildOptions.hidden = true;
    elements.ticketChildToggle.setAttribute("aria-expanded", "false");
  }

  function handleChildFieldClick(event) {
    const removeButton = event.target.closest("[data-remove-child-id]");
    if (removeButton) {
      event.preventDefault();
      toggleChild(Number(removeButton.dataset.removeChildId));
      return;
    }
    openChildOptions();
    elements.ticketChildSearch.focus();
  }

  function handleChildSearchInput(event) {
    state.childQuery = event.target.value;
    openChildOptions();
    syncChildOptions();
  }

  function handleChildSearchKeydown(event) {
    if (event.key === "Backspace" && !elements.ticketChildSearch.value && state.editorChildIds.length > 0) {
      event.preventDefault();
      state.editorChildIds = state.editorChildIds.slice(0, -1);
      syncChildOptions();
      return;
    }
    if (event.key === "Enter") {
      const firstOption = elements.ticketChildOptions.querySelector("[data-child-id]");
      if (firstOption) {
        event.preventDefault();
        toggleChild(Number(firstOption.dataset.childId));
      }
      return;
    }
    if (event.key === "Escape") {
      closeChildOptions();
      elements.ticketChildSearch.blur();
    }
  }

  function toggleChild(ticketId) {
    if (state.editorChildIds.includes(ticketId)) {
      state.editorChildIds = state.editorChildIds.filter((id) => id !== ticketId);
    } else {
      state.editorChildIds = [...state.editorChildIds, ticketId];
    }
    state.childQuery = "";
    elements.ticketChildSearch.value = "";
    syncChildOptions();
    openChildOptions();
    elements.ticketChildSearch.focus();
  }

  function handleParentChange() {
    syncChildPickerAvailability();
    syncChildOptions();
  }

  function openTicketTagOptions() {
    closeParentOptions();
    closeBlockerOptions();
    closeChildOptions();
    elements.ticketTagOptions.hidden = false;
    elements.ticketTagToggle.setAttribute("aria-expanded", "true");
  }

  function closeTicketTagOptions() {
    elements.ticketTagOptions.hidden = true;
    elements.ticketTagToggle.setAttribute("aria-expanded", "false");
  }

  function handleTicketTagFieldClick(event) {
    const removeButton = event.target.closest("[data-remove-tag-id]");
    if (removeButton) {
      event.preventDefault();
      toggleTicketTag(Number(removeButton.dataset.removeTagId));
      return;
    }
    openTicketTagOptions();
    elements.ticketTagSearch.focus();
  }

  function handleTicketTagSearchInput(event) {
    state.tagQuery = event.target.value;
    openTicketTagOptions();
    syncTicketTagOptions();
  }

  function handleTicketTagSearchKeydown(event) {
    if (event.key === "Backspace" && !elements.ticketTagSearch.value && state.editorTagIds.length > 0) {
      event.preventDefault();
      state.editorTagIds = state.editorTagIds.slice(0, -1);
      syncTicketTagOptions();
      return;
    }
    if (event.key === "Enter") {
      const firstOption = elements.ticketTagOptions.querySelector("[data-tag-id]");
      if (firstOption) {
        event.preventDefault();
        toggleTicketTag(Number(firstOption.dataset.tagId));
      }
      return;
    }
    if (event.key === "Escape") {
      closeTicketTagOptions();
      elements.ticketTagSearch.blur();
    }
  }

  function toggleTicketTag(tagId) {
    if (state.editorTagIds.includes(tagId)) {
      state.editorTagIds = state.editorTagIds.filter((id) => id !== tagId);
    } else {
      state.editorTagIds = [...state.editorTagIds, tagId];
    }
    state.tagQuery = "";
    elements.ticketTagSearch.value = "";
    syncTicketTagOptions();
    openTicketTagOptions();
    elements.ticketTagSearch.focus();
  }

  async function createTagFromEditor() {
    if (!state.activeBoardId) {
      return;
    }
    const values = await requestFields({
      title: "New Tag",
      submitLabel: "Create",
      fields: [
        { id: "name", label: "Name", required: true },
        { id: "color", label: "Color", type: "color", value: "#2f7f6f", required: true },
      ],
    });
    if (!values) {
      return;
    }
    const created = await ctx.sendJson(`/api/boards/${state.activeBoardId}/tags`, {
      method: "POST",
      body: values,
    });
    await ctx.refreshBoardDetail();
    state.editorTagIds = [...new Set([...state.editorTagIds, created.id])];
    syncTicketTagOptions();
    showToast("Tag created");
  }

  function setDialogMode(mode) {
    state.dialogMode = mode;
    elements.ticketView.hidden = mode !== "view";
    elements.editorForm.hidden = mode !== "edit";
    elements.headerEditButton.hidden = mode !== "view" || !state.editingTicketId;
    if (mode !== "edit") {
      closeParentOptions();
      closeTicketTagOptions();
      closeBlockerOptions();
      closeChildOptions();
    }
  }

  function resetDialogState() {
    state.editingTicketId = null;
    state.dialogMode = "view";
    state.editorTagIds = [];
    state.editorBlockerIds = [];
    state.editorChildIds = [];
    state.editorOriginalChildIds = [];
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
  }

  function handleEditorDialogClose() {
    const shouldSync = !state.skipDialogCloseSync && window.location.pathname.startsWith("/tickets/");
    resetDialogState();
    state.skipDialogCloseSync = false;
    if (shouldSync) {
      ctx.syncBoardUrl();
    }
  }

  function closeEditor() {
    if (elements.editorDialog.open) {
      elements.editorDialog.close();
    }
    closeParentOptions();
    closeTicketTagOptions();
    closeBlockerOptions();
    closeChildOptions();
    ctx.syncBoardUrl();
  }

  function renderRelationLink(ticket) {
    return `<a class="ticket-inline-link" href="/tickets/${ticket.id}"><span class="ticket-ref-inline${ticket.isCompleted ? " ticket-ref-completed" : ""}">#${ticket.id}</span>${ctx.escapeHtml(ticket.title)}</a>`;
  }

  function renderRelationChip(ticket, kind) {
    return `<a class="ticket-tag-chip ticket-ref-chip ticket-relation-chip ticket-relation-chip-${kind}" href="/tickets/${ticket.id}"><span class="ticket-ref-chip-id${ticket.isCompleted ? " ticket-ref-completed" : ""}">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span></a>`;
  }

  function renderTicketRelations(ticket) {
    if (!ticket) {
      return "";
    }
    const parts = [];
    const blocking = getBlockingTickets(ticket.id);
    if (ticket.parent) {
      parts.push(`<div><span class="muted">Parent</span> ${renderRelationChip(ticket.parent, "parent")}</div>`);
    }
    if (ticket.children.length) {
      parts.push(`<div><span class="muted">Children</span> ${ticket.children.map((child) => renderRelationChip(child, "child")).join("")}</div>`);
    }
    if (ticket.blockers.length) {
      parts.push(`<div><span class="muted">Blocked By</span> ${ticket.blockers.map((blocker) => renderRelationChip(blocker, "blocked-by")).join("")}</div>`);
    }
    if (blocking.length) {
      parts.push(`<div><span class="muted">Blocks</span> ${blocking.map((blocked) => renderRelationChip(blocked, "blocks")).join("")}</div>`);
    }
    return parts.join("");
  }

  function renderComments(comments) {
    if (comments.length === 0) {
      return '<p class="muted">No comments yet.</p>';
    }
    return comments
      .map(
        (comment) => `
          <article class="comment-item">
            <div class="comment-meta muted">#${comment.id} ${new Date(comment.createdAt).toLocaleString()}</div>
            <div class="markdown">${comment.bodyHtml}</div>
          </article>
        `,
      )
      .join("");
  }

  function renderTicketMeta(ticket) {
    if (!ticket) {
      return "";
    }
    const priority = `<span class="ticket-priority-label">Priority: ${ticket.priority}</span>`;
    const tags = ticket.tags
      .map((tag) => `<span class="tag" style="background:${ctx.escapeHtml(tag.color)}">${ctx.escapeHtml(tag.name)}</span>`)
      .join("");
    return `
      <div class="ticket-meta-row">${priority}${tags}</div>
    `;
  }

  function syncEditorHeader(ticket) {
    if (!ticket) {
      elements.editorHeaderState.hidden = true;
      elements.editorHeaderId.textContent = "";
      elements.editorTitle.textContent = "New Ticket";
      elements.headerEditButton.hidden = true;
      return;
    }
    elements.editorHeaderState.hidden = false;
    elements.editorHeaderState.textContent = ticket.isCompleted ? "Completed" : "Open";
    elements.editorHeaderState.className = `ticket-state-pill ${ticket.isCompleted ? "ticket-state-pill-completed" : "ticket-state-pill-open"}`;
    elements.editorHeaderId.textContent = `#${ticket.id}`;
    elements.editorTitle.textContent = ticket.title;
    elements.headerEditButton.hidden = state.dialogMode !== "view";
  }

  function syncTicketRelations(ticket) {
    const relationsHtml = renderTicketRelations(ticket);
    elements.ticketRelations.innerHTML = relationsHtml;
    elements.ticketRelations.hidden = !relationsHtml;
  }

  function hydrateDialogTicket(ticket) {
    syncEditorHeader(ticket);
    elements.ticketViewMeta.innerHTML = renderTicketMeta(ticket);
    syncTicketRelations(ticket);
    elements.ticketViewBody.innerHTML = ticket.bodyHtml || '<p class="muted">No description</p>';
    elements.ticketComments.innerHTML = renderComments(ticket.comments ?? []);
    elements.ticketTitle.value = ticket.title;
    elements.ticketPriority.value = String(ticket.priority ?? 0);
    elements.ticketCompleted.checked = ticket.isCompleted;
    elements.ticketBody.value = ticket.bodyMarkdown;
    elements.ticketLane.value = String(ticket.laneId);
    elements.ticketParent.value = ticket.parentTicketId == null ? "" : String(ticket.parentTicketId);
    state.editorTagIds = ticket.tags.map((tag) => tag.id);
    state.editorBlockerIds = [...ticket.blockerIds];
    state.editorChildIds = ticket.children.map((child) => child.id);
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketChildSearch.value = "";
    syncParentOptions();
    syncTicketTagOptions();
    syncBlockerOptions();
    syncChildPickerAvailability();
    syncChildOptions();
  }

  async function openEditor(ticketId = null, mode = "edit", defaultLaneId = null) {
    if (!state.boardDetail) {
      return;
    }
    state.editingTicketId = ticketId;
    const ticket = ticketId ? await ctx.api(`/api/tickets/${ticketId}`) : null;
    elements.ticketTitle.value = ticket?.title ?? "";
    elements.ticketPriority.value = String(ticket?.priority ?? 0);
    elements.ticketCompleted.checked = ticket?.isCompleted ?? false;
    elements.ticketBody.value = ticket?.bodyMarkdown ?? "";
    syncEditorHeader(ticket);
    elements.ticketViewMeta.innerHTML = renderTicketMeta(ticket);
    syncTicketRelations(ticket);
    elements.ticketViewBody.innerHTML = ticket?.bodyHtml ?? '<p class="muted">No description</p>';
    elements.ticketComments.innerHTML = renderComments(ticket?.comments ?? []);
    elements.commentBody.value = "";
    const selectedLaneId = ticket?.laneId ?? defaultLaneId;
    elements.ticketLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
    elements.ticketParent.value = ticket?.parentTicketId == null ? "" : String(ticket.parentTicketId);
    elements.deleteTicketButton.hidden = !ticketId;
    elements.commentForm.hidden = !ticketId;
    elements.ticketCompletedRow.hidden = !ticketId;
    if (!ticketId && defaultLaneId != null) {
      elements.ticketLane.value = String(defaultLaneId);
    }
    state.editorTagIds = ticket?.tags.map((entry) => entry.id) ?? [];
    state.editorBlockerIds = ticket?.blockerIds ?? [];
    state.editorChildIds = ticket?.children.map((entry) => entry.id) ?? [];
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketChildSearch.value = "";
    elements.ticketChildrenRow.hidden = !ticketId;
    syncParentOptions();
    syncTicketTagOptions();
    syncBlockerOptions();
    syncChildPickerAvailability();
    syncChildOptions();
    setDialogMode(ticketId ? mode : "edit");
    elements.editorDialog.showModal();
    if (ticketId) {
      ctx.syncTicketUrl(ticketId);
    }
  }

  async function saveTicket(event) {
    event.preventDefault();
    if (!state.activeBoardId) {
      return;
    }
    const tagIds = getSelectedTagIds();
    const blockerIds = [...state.editorBlockerIds];
    const nextParentTicketId = elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
    const payload = {
      title: elements.ticketTitle.value.trim(),
      laneId: Number(elements.ticketLane.value),
      parentTicketId: nextParentTicketId,
      priority: Number(elements.ticketPriority.value || 0),
      isCompleted: elements.ticketCompleted.checked,
      bodyMarkdown: elements.ticketBody.value,
      tagIds,
      blockerIds,
    };
    const endpoint = state.editingTicketId
      ? `/api/tickets/${state.editingTicketId}`
      : `/api/boards/${state.activeBoardId}/tickets`;
    const method = state.editingTicketId ? "PATCH" : "POST";
    const editingTicketId = state.editingTicketId;
    if (editingTicketId && nextParentTicketId != null && state.editorOriginalChildIds.length > 0) {
      for (const childId of state.editorOriginalChildIds) {
        await ctx.sendJson(`/api/tickets/${childId}`, {
          method: "PATCH",
          body: { parentTicketId: null },
        });
      }
    }
    await ctx.api(endpoint, {
      method,
      body: JSON.stringify(payload),
    });
    if (editingTicketId) {
      if (nextParentTicketId == null) {
        const originalChildIds = new Set(state.editorOriginalChildIds);
        const nextChildIds = new Set(state.editorChildIds);
        for (const childId of state.editorOriginalChildIds) {
          if (!nextChildIds.has(childId)) {
            await ctx.sendJson(`/api/tickets/${childId}`, {
              method: "PATCH",
              body: { parentTicketId: null },
            });
          }
        }
        for (const childId of state.editorChildIds) {
          if (!originalChildIds.has(childId)) {
            await ctx.sendJson(`/api/tickets/${childId}`, {
              method: "PATCH",
              body: { parentTicketId: editingTicketId },
            });
          }
        }
      }
      const updated = await ctx.api(`/api/tickets/${editingTicketId}`);
      hydrateDialogTicket(updated);
      state.editorOriginalChildIds = [...state.editorChildIds];
      setDialogMode("view");
    } else {
      closeEditor();
    }
    await ctx.refreshBoardDetail();
  }

  async function deleteTicket() {
    if (!state.editingTicketId) {
      return;
    }
    const ticketId = state.editingTicketId;
    await confirmAndRun({
      title: "Delete Ticket",
      message: "Delete this ticket?",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        closeEditor();
        await ctx.refreshBoardDetail();
      },
    });
  }

  async function addComment(event) {
    event?.preventDefault?.();
    if (!state.editingTicketId) {
      return;
    }
    const bodyMarkdown = elements.commentBody.value.trim();
    if (!bodyMarkdown) {
      showToast("Comment is required", "error");
      return;
    }
    try {
      elements.saveCommentButton.disabled = true;
      await ctx.sendJson(`/api/tickets/${state.editingTicketId}/comments`, {
        method: "POST",
        body: { bodyMarkdown },
      });
      const ticket = await ctx.api(`/api/tickets/${state.editingTicketId}`);
      hydrateDialogTicket(ticket);
      elements.commentBody.value = "";
      await ctx.refreshBoardDetail();
      showToast("Comment added");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      elements.saveCommentButton.disabled = false;
    }
  }

  function handleDocumentClick(event) {
    if (!elements.editorDialog.open) {
      return;
    }
    const tagOption = event.target.closest?.("[data-tag-id]");
    if (tagOption && elements.ticketTagOptions.contains(tagOption)) {
      toggleTicketTag(Number(tagOption.dataset.tagId));
      return;
    }
    const blockerOption = event.target.closest?.("[data-blocker-id]");
    if (blockerOption && elements.ticketBlockerOptions.contains(blockerOption)) {
      toggleBlocker(Number(blockerOption.dataset.blockerId));
      return;
    }
    const childOption = event.target.closest?.("[data-child-id]");
    if (childOption && elements.ticketChildOptions.contains(childOption)) {
      toggleChild(Number(childOption.dataset.childId));
      return;
    }
    const parentOption = event.target.closest?.("[data-parent-id]");
    if (parentOption && elements.ticketParentOptions.contains(parentOption)) {
      setParent(Number(parentOption.dataset.parentId));
      return;
    }
    if (
      elements.ticketParentToggle.contains(event.target) ||
      elements.ticketParentOptions.contains(event.target) ||
      elements.ticketTagToggle.contains(event.target) ||
      elements.ticketTagOptions.contains(event.target) ||
      elements.ticketBlockerToggle.contains(event.target) ||
      elements.ticketBlockerOptions.contains(event.target) ||
      elements.ticketChildToggle.contains(event.target) ||
      elements.ticketChildOptions.contains(event.target)
    ) {
      return;
    }
    closeParentOptions();
    closeTicketTagOptions();
    closeBlockerOptions();
    closeChildOptions();
  }

  function handleUxSubmit(event) {
    event.preventDefault();
    if (state.uxMode === "confirm") {
      finishUxDialog(true);
      return;
    }
    const fields = [...elements.uxFields.querySelectorAll("[data-field-id]")];
    const values = Object.fromEntries(fields.map((input) => [input.dataset.fieldId, input.value.trim()]));
    const missing = fields.find((input) => input.required && !input.value.trim());
    if (missing) {
      const label = missing.closest("label")?.childNodes?.[0]?.textContent?.trim() ?? "Field";
      elements.uxError.hidden = false;
      elements.uxError.textContent = `${label} is required`;
      return;
    }
    finishUxDialog({ action: "submit", values });
  }

  function handleUxDanger() {
    finishUxDialog({ action: "danger" });
  }

  function finishUxDialog(value) {
    const resolver = state.uxResolver;
    if (!resolver) {
      return;
    }
    state.uxResolver = null;
    if (elements.uxDialog.open) {
      elements.uxDialog.close();
    }
    resolver(value);
  }

  function openUxDialog({ title, message = "", submitLabel, fields, dangerLabel = "" }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      state.uxMode = "form";
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = !message;
      elements.uxMessage.textContent = message;
      elements.uxSubmitButton.textContent = submitLabel;
      elements.uxDangerButton.hidden = !dangerLabel;
      elements.uxDangerButton.textContent = dangerLabel || "Delete";
      elements.uxError.hidden = true;
      elements.uxError.textContent = "";
      elements.uxFields.innerHTML = fields
        .map(
          (field) => `
            <label>
              ${ctx.escapeHtml(field.label)}
              <input
                data-field-id="${ctx.escapeHtml(field.id)}"
                type="${ctx.escapeHtml(field.type ?? "text")}"
                value="${ctx.escapeHtml(field.value ?? "")}"
                ${field.required ? "required" : ""}
              />
            </label>
          `,
        )
        .join("");

      elements.uxDialog.showModal();
      const firstInput = elements.uxFields.querySelector("input");
      firstInput?.focus();
    });
  }

  function requestFields(config) {
    return openUxDialog(config).then((result) => (result?.action === "submit" ? result.values : null));
  }

  function requestFieldsAction(config) {
    return openUxDialog(config);
  }

  function openConfirmDialog({ title, message, submitLabel }) {
    return new Promise((resolve) => {
      state.uxResolver = resolve;
      state.uxMode = "confirm";
      elements.uxTitle.textContent = title;
      elements.uxMessage.hidden = false;
      elements.uxMessage.textContent = message;
      elements.uxSubmitButton.textContent = submitLabel;
      elements.uxDangerButton.hidden = true;
      elements.uxError.hidden = true;
      elements.uxFields.innerHTML = "";
      elements.uxDialog.showModal();
    });
  }

  async function confirmAndRun({ title, message, submitLabel, run }) {
    const confirmed = await openConfirmDialog({ title, message, submitLabel });
    if (!confirmed) {
      return false;
    }
    try {
      await run();
      return true;
    } catch (error) {
      showToast(error.message, "error");
      return false;
    }
  }

  function showToast(message, kind = "info") {
    elements.toast.textContent = message;
    elements.toast.dataset.kind = kind;
    elements.toast.hidden = false;
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  return {
    addComment,
    closeEditor,
    confirmAndRun,
    createTagFromEditor,
    deleteTicket,
    finishUxDialog,
    handleBlockerFieldClick,
    handleBlockerSearchInput,
    handleBlockerSearchKeydown,
    handleChildFieldClick,
    handleChildSearchInput,
    handleChildSearchKeydown,
    handleDocumentClick,
    handleEditorDialogClose,
    handleParentChange,
    handleParentFieldClick,
    handleParentSearchInput,
    handleParentSearchKeydown,
    handleTicketTagSearchInput,
    handleTicketTagSearchKeydown,
    handleTicketTagFieldClick,
    handleUxDanger,
    handleUxSubmit,
    openBlockerOptions,
    openChildOptions,
    openEditor,
    openParentOptions,
    openTicketTagOptions,
    requestFields,
    requestFieldsAction,
    saveTicket,
    setDialogMode,
    showToast,
    syncTicketTagOptions,
  };
}
