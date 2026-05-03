// @ts-check

/** @param {string} name */
export function icon(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="/icons.svg#${name}"></use></svg>`;
}
