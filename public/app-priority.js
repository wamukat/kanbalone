import { icon } from "./icons.js";

const PRIORITY_LEVELS = {
  low: { value: 1, label: "Low", icon: "priority-low" },
  medium: { value: 2, label: "Medium", icon: "priority-medium" },
  high: { value: 3, label: "High", icon: "priority-high" },
  urgent: { value: 4, label: "Urgent", icon: "circle-alert" },
};

export function getPriorityLevel(priority) {
  const normalizedPriority = Number(priority ?? 0);
  if (normalizedPriority >= 4) {
    return { key: "urgent", ...PRIORITY_LEVELS.urgent };
  }
  if (normalizedPriority === 3) {
    return { key: "high", ...PRIORITY_LEVELS.high };
  }
  if (normalizedPriority === 2) {
    return { key: "medium", ...PRIORITY_LEVELS.medium };
  }
  if (normalizedPriority === 1) {
    return { key: "low", ...PRIORITY_LEVELS.low };
  }
  return { key: "medium", ...PRIORITY_LEVELS.medium };
}

export function getPriorityInputValue(priority) {
  return String(getPriorityLevel(priority).value);
}

export function renderPriorityBadge(priority) {
  const level = getPriorityLevel(priority);
  const label = `${level.label} priority`;
  return `<span class="ticket-priority-badge ticket-priority-${level.key}" title="${label}" aria-label="${label}">${icon(level.icon)}<span>${level.label}</span></span>`;
}

export function renderPriorityIcon(priority) {
  const level = getPriorityLevel(priority);
  const label = `${level.label} priority`;
  return `<span class="ticket-priority-icon ticket-priority-${level.key}" title="${label}" aria-label="${label}">${icon(level.icon)}</span>`;
}
