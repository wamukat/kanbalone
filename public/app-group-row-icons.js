// @ts-check
import { groupRowIconNames } from "./app-ticket-inline-icons.js";
import { createTicketMaskRenderer } from "./app-ticket-mask-icons.js";

/** @param {HTMLElement} host */
export function createGroupRowIconRenderer(host) {
  return createTicketMaskRenderer(host, {
    names: groupRowIconNames,
    scope: '[data-group-section="tickets"]',
    marker: "data-group-row-icon",
    className: "group-row-icon",
  });
}
