// @ts-check
import { ticketInlineIcon } from "./app-ticket-inline-icons.js";

/**
 * @param {HTMLElement} host
 * @param {{names: readonly string[], scope: string, marker: string, className: string}} options
 */
export function createTicketMaskRenderer(host, { names, scope, marker, className }) {
  if (!globalThis.CSS?.supports("mask-image", "url(about:blank)")) {
    return () => ticketInlineIcon;
  }

  const icons = new Map(names.map(name => {
    const attribute = `${marker}="${name}"`;
    return [name, {
      inline: ticketInlineIcon(name).replace('class="icon"', `class="icon" ${attribute}`),
      mask: `<span class="icon ${className}" ${attribute} aria-hidden="true"></span>`,
    }];
  }));
  /** @param {string} name */
  const inlineIcon = name => icons.get(name)?.inline ?? ticketInlineIcon(name);
  /** @param {string} name */
  const maskedIcon = name => icons.get(name)?.mask ?? ticketInlineIcon(name);
  const forcedColors = matchMedia("(forced-colors: active)");

  forcedColors.addEventListener("change", () => {
    const useInline = forcedColors.matches;
    const tag = useInline ? "span" : "svg";
    const currentIcons = host.querySelectorAll(`${scope} ${tag}[${marker}]`);
    if (!currentIcons.length) return;

    const template = host.ownerDocument.createElement("template");
    /** @type {Map<string, Element>} */
    const replacements = new Map();
    const renderIcon = useInline ? inlineIcon : maskedIcon;
    for (const current of currentIcons) {
      const name = current.getAttribute(marker);
      if (!name) continue;

      let replacement = replacements.get(name);
      if (!replacement) {
        template.innerHTML = renderIcon(name);
        replacement = /** @type {Element} */ (template.content.firstElementChild);
        replacements.set(name, replacement);
      }
      current.replaceWith(replacement.cloneNode(true));
    }
  });
  return () => forcedColors.matches ? inlineIcon : maskedIcon;
}
