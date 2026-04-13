import { createInlineTextForm } from "./app-inline-text-form.js";
import { icon } from "./icons.js";

export function createKanbanLane(ctx, lane, laneTickets, handlers) {
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
  handlers.bindDropZone(list);

  const addTicketButton = document.createElement("button");
  addTicketButton.type = "button";
  addTicketButton.className = "add-ticket-button icon-button";
  addTicketButton.innerHTML = icon("plus");
  addTicketButton.title = "New ticket";
  addTicketButton.setAttribute("aria-label", "New ticket");
  addTicketButton.addEventListener("click", () => ctx.openEditor(null, "edit", lane.id));

  header.querySelector("[data-action='rename-lane']").addEventListener("click", () => handlers.renameLane(lane));
  header.querySelector("[data-action='delete-lane']").addEventListener("click", () => handlers.deleteLane(lane));
  header.querySelector("[data-action='toggle-lane-actions']").addEventListener("click", (event) => {
    toggleInlineActionMenu(event.currentTarget);
  });
  handlers.bindLaneDrag(header.querySelector("[data-action='drag-lane']"), laneElement);

  laneElement.append(header, list, addTicketButton);
  return { laneElement, list };
}

export function createKanbanLaneInputColumn(onSubmit, onCancel) {
  return createInlineTextForm({
    className: "lane lane-create-column",
    html: `
      <label class="lane-create-label" for="lane-create-input">New lane</label>
      <input id="lane-create-input" type="text" data-lane-create-input aria-label="Lane name" placeholder="Lane name" autocomplete="off" />
    `,
    inputSelector: "[data-lane-create-input]",
    onSubmit,
    onCancel,
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
