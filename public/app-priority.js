// @ts-check
import { t as tr } from "./app-i18n.js";

import { icon } from "./icons.js";

const PRIORITY_LEVELS = {
  low: { value: 1, label: tr("Low"), icon: "priority-low" },
  medium: { value: 2, label: tr("Medium"), icon: "priority-medium" },
  high: { value: 3, label: tr("High"), icon: "priority-high" },
  urgent: { value: 4, label: tr("Urgent"), icon: "circle-alert" },
};

/** @param {unknown} priority */
export function getPriorityLevel(priority) {
  const normalizedPriority = Number(priority ?? 0);
  if (normalizedPriority === 4) {
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

/** @param {unknown} priority */
export function getPriorityInputValue(priority) {
  return String(getPriorityLevel(priority).value);
}

/** @param {unknown} priority */
export function renderPriorityBadge(priority) {
  const level = getPriorityLevel(priority);
  const label = tr("{priority} priority", { priority: level.label });
  return `<span class="ticket-priority-badge ticket-priority-${level.key}" title="${label}" aria-label="${label}">${icon(level.icon)}<span>${level.label}</span></span>`;
}

/** @param {unknown} priority @param {(name: string) => string} [renderIcon] */
export function renderPriorityIcon(priority, renderIcon = icon) {
  const level = getPriorityLevel(priority);
  const label = tr("{priority} priority", { priority: level.label });
  return `<span class="ticket-priority-icon ticket-priority-${level.key}" title="${label}" aria-label="${label}">${renderIcon(level.icon)}</span>`;
}
