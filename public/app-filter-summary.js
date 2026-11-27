import { t as tr } from "./app-i18n.js";
export function describeTicketFilters(filters, lanes = []) {
  const priorityLabels = { low: tr("Low"), medium: tr("Medium"), high: tr("High"), urgent: tr("Urgent") };
  const parts = [];
  if (filters.includeArchived) parts.push(tr("Include archived tickets"));
  if (filters.q) parts.push(tr("Search: “{value}”", { value: filters.q }));
  if (filters.lane) parts.push(tr("Lane: {value}", { value: lanes.find((lane) => String(lane.id) === String(filters.lane))?.name ?? filters.lane }));
  if (filters.priority.length) parts.push(tr("Priority: {value}", { value: filters.priority.map((value) => priorityLabels[value] ?? value).join(" + ") }));
  if (filters.tag) parts.push(tr("Tag: {value}", { value: filters.tag }));
  return parts.join(" · ");
}
