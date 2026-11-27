import { t as tr } from "./app-i18n.js";
export function describeTicketFilters(filters, lanes, tags) {
  const priorityLabels = { low: tr("Low"), medium: tr("Medium"), high: tr("High"), urgent: tr("Urgent") };
  const parts = [];
  if (filters.includeArchived) parts.push(tr("Include archived tickets"));
  if (filters.q) parts.push(tr("Search: “{value}”", { value: filters.q }));
  if (filters.laneIds.length) parts.push(tr("Lane: {value}", { value: selectedNames(lanes, filters.laneIds) }));
  if (filters.priority.length) parts.push(tr("Priority: {value}", { value: filters.priority.map((value) => priorityLabels[value] ?? value).join(" + ") }));
  if (filters.tagIds.length) parts.push(tr("Tag: {value}", { value: selectedNames(tags, filters.tagIds) }));
  return parts.join(" · ");
}

function selectedNames(choices, ids) {
  return choices.filter(choice => ids.includes(choice.id)).map(choice => choice.name).join(tr(", "));
}
