// @ts-check
import { t as tr } from "./app-i18n.js";
/** Resolve only real Group conflicts; a single candidate never opens another dialog. */
/** @param {import("./app-group-types.js").GroupConflictContext} ctx @param {import("./app-group-types.js").GroupPreview} preview */
export async function chooseGroupResolution(ctx, preview) {
  if (!preview.requiresResolution) return undefined;
  const { elements } = ctx;
  /** @type {number | null} */ let chosen = null;
  const tickets = preview.tickets || [];
  const details = tickets
    .map(
      (t) =>
        `<li>${t.id ? `#${t.id}` : tr("New ticket")} ${ctx.escapeHtml(t.title)}${t.isArchived ? ` <span class="muted">${tr("Archived")}</span>` : ""}</li>`,
    )
    .join("");
  const promise = ctx.openFormDialog({
    title: tr("Which Group should these tickets belong to?"),
    message:
      tr("The parent/child relationship and Group membership will be saved together."),
    fields: `<ul class="group-impact-list">${details}</ul>${preview.candidates.map((c) => `<button type="button" class="group-conflict-choice" data-resolve-group="${c.group.id}">${tr("Use “{name}”", { name: ctx.escapeHtml(c.group.name) })}<small>${tr("Change membership: {tickets}", { tickets: c.changedTicketIds.map((id) => (id ? `#${id}` : tr("new ticket"))).join(", ") || tr("none") })}</small></button>`).join("")}`,
    submitLabel: tr("Save"),
  });
  // Each named choice is the final action. Do not add a second confirmation step.
  elements.uxSubmitButton.hidden = true;
  /** @param {MouseEvent} e */
  const click = (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest("button[data-resolve-group]");
    if (!(button instanceof HTMLButtonElement)) return;
    chosen = Number(button.dataset.resolveGroup);
    elements.uxForm.requestSubmit();
  };
  elements.uxFields.addEventListener("click", click);
  try {
    const confirmed = await promise;
    return confirmed && chosen !== null ? { groupId: chosen } : null;
  } finally {
    elements.uxFields.removeEventListener("click", click);
    elements.uxSubmitButton.hidden = false;
  }
}
