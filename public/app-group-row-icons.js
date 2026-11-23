// @ts-check
import { groupRowIconNames, ticketInlineIcon } from "./app-ticket-inline-icons.js";

const icons = new Map(groupRowIconNames.map(name => {
  const marker = `data-group-row-icon="${name}"`;
  return [name, {
    inline: ticketInlineIcon(name).replace('class="icon"', `class="icon" ${marker}`),
    mask: `<span class="icon group-row-icon" ${marker} aria-hidden="true"></span>`,
  }];
}));

/** @param {string} name */
function inlineIcon(name) {
  return icons.get(name)?.inline ?? ticketInlineIcon(name);
}

/** @param {string} name */
function maskedIcon(name) {
  return icons.get(name)?.mask ?? ticketInlineIcon(name);
}

/** @param {HTMLElement} host @param {boolean} useInline */
function replaceIcons(host, useInline) {
  const selector = useInline ? "span[data-group-row-icon]" : "svg[data-group-row-icon]";
  const currentIcons = host.querySelectorAll(`[data-group-section="tickets"] ${selector}`);
  if (!currentIcons.length) return;

  const template = document.createElement("template");
  /** @type {Map<string, Element>} */
  const replacements = new Map();
  const renderIcon = useInline ? inlineIcon : maskedIcon;
  for (const current of currentIcons) {
    const name = current.getAttribute("data-group-row-icon");
    if (!name) continue;

    let replacement = replacements.get(name);
    if (!replacement) {
      template.innerHTML = renderIcon(name);
      replacement = /** @type {Element} */ (template.content.firstElementChild);
      replacements.set(name, replacement);
    }
    current.replaceWith(replacement.cloneNode(true));
  }
}

/** @param {HTMLElement} host */
export function createGroupRowIconRenderer(host) {
  if (!globalThis.CSS?.supports("mask-image", "url(about:blank)")) {
    return () => ticketInlineIcon;
  }

  const forcedColors = matchMedia("(forced-colors: active)");
  forcedColors.addEventListener("change", () => {
    replaceIcons(host, forcedColors.matches);
  });
  return () => forcedColors.matches ? inlineIcon : maskedIcon;
}
