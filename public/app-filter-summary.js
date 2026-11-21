export function describeTicketFilters(filters, lanes = []) {
  const statusLabels = { open: "Open", resolved: "Resolved", archived: "Archived" };
  const priorityLabels = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
  const parts = [`Status: ${filters.status.map((value) => statusLabels[value] ?? value).join(" + ")}`];
  if (filters.q) parts.push(`Search: “${filters.q}”`);
  if (filters.lane) parts.push(`Lane: ${lanes.find((lane) => String(lane.id) === String(filters.lane))?.name ?? filters.lane}`);
  if (filters.priority.length) parts.push(`Priority: ${filters.priority.map((value) => priorityLabels[value] ?? value).join(" + ")}`);
  if (filters.tag) parts.push(`Tag: ${filters.tag}`);
  return parts.join(" · ");
}
