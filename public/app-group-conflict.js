/** Resolve only real Group conflicts; a single candidate never opens another dialog. */
export async function chooseGroupResolution(ctx, preview) {
  if (!preview.requiresResolution) return undefined;
  const { elements } = ctx;
  let chosen = null;
  const tickets = preview.tickets || [];
  const details = tickets.map(t => `<li>${t.id ? `#${t.id}` : "New ticket"} ${ctx.escapeHtml(t.title)}${t.isArchived ? ' <span class="muted">Archived</span>' : ""}</li>`).join("");
  const promise = ctx.openFormDialog({
    title: "Which Group should these tickets belong to?",
    message: "The parent/child relationship and Group membership will be saved together.",
    fields: `<ul class="group-impact-list">${details}</ul>${preview.candidates.map(c => `<button type="button" class="group-conflict-choice" data-resolve-group="${c.group.id}">Use “${ctx.escapeHtml(c.group.name)}”<small>Change membership: ${c.changedTicketIds.map(id => id ? `#${id}` : "new ticket").join(", ") || "none"}</small></button>`).join("")}`,
    submitLabel: "Save",
  });
  // Each named choice is the final action. Do not add a second confirmation step.
  elements.uxSubmitButton.hidden = true;
  const click = e => {
    const button = e.target.closest("[data-resolve-group]");
    if (!button) return;
    chosen = Number(button.dataset.resolveGroup);
    elements.uxForm.requestSubmit();
  };
  elements.uxFields.addEventListener("click", click);
  try { const confirmed = await promise; return confirmed && chosen !== null ? { groupId: chosen } : null; }
  finally { elements.uxFields.removeEventListener("click", click); elements.uxSubmitButton.hidden = false; }
}
