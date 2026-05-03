// @ts-check

/**
 * @typedef {{ name?: string; color?: string | null }} TagLike
 * @typedef {{ maxLength?: number }} TagFormatOptions
 * @typedef {{ r: number; g: number; b: number }} RgbColor
 */

/** @param {TagLike} tag */
export function tagToneClass(tag) {
  return tag.color ? "" : " tag-no-color";
}

/** @param {TagLike} tag @param {(value: unknown) => string} escapeHtml */
export function tagBackgroundStyle(tag, escapeHtml) {
  if (!tag.color) {
    return "";
  }
  return ` style="background:${escapeHtml(tag.color)};color:${tagTextColor(tag.color)}"`;
}

/** @param {TagLike} tag @param {TagFormatOptions} [options] */
export function formatTagLabel(tag, options = {}) {
  const maxLength = options.maxLength ?? 28;
  const name = tag.name ?? "";
  return {
    name,
    label: truncateTagName(name, maxLength),
  };
}

/** @param {TagLike} tag @param {(value: unknown) => string} escapeHtml @param {TagFormatOptions} [options] */
export function renderTag(tag, escapeHtml, options = {}) {
  const { name, label } = formatTagLabel(tag, options);
  return `<span class="tag${tagToneClass(tag)}" title="${escapeHtml(name)}"${tagBackgroundStyle(tag, escapeHtml)}><span class="visually-hidden">${escapeHtml(name)}</span><span aria-hidden="true">${escapeHtml(label)}</span></span>`;
}

/** @param {unknown} hexColor */
export function tagTextColor(hexColor) {
  const rgb = parseHexColor(hexColor);
  if (!rgb) {
    return "#fff";
  }
  const luminance = relativeLuminance(rgb);
  return luminance > 0.48 ? "#1c1c17" : "#fffdf7";
}

/** @param {unknown} hexColor @returns {RgbColor | null} */
function parseHexColor(hexColor) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(hexColor ?? "").trim());
  if (!match) {
    return null;
  }
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/** @param {RgbColor} rgb */
function relativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** @param {string} name @param {number} maxLength */
function truncateTagName(name, maxLength) {
  const characters = splitGraphemes(name);
  if (characters.length <= maxLength) {
    return name;
  }
  return `${characters.slice(0, Math.max(0, maxLength - 3)).join("")}...`;
}

/** @param {string} value @returns {string[]} */
function splitGraphemes(value) {
  if (typeof globalThis.Intl?.Segmenter === "function") {
    return [...new globalThis.Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map((segment) => segment.segment);
  }
  return splitGraphemesFallback(value);
}

/** @param {string} value @returns {string[]} */
function splitGraphemesFallback(value) {
  const clusters = [];
  let joinNext = false;
  let regionalIndicatorCount = 0;
  for (const character of Array.from(value)) {
    if (isRegionalIndicator(character)) {
      if (regionalIndicatorCount % 2 === 1 && clusters.length > 0) {
        clusters[clusters.length - 1] += character;
      } else {
        clusters.push(character);
      }
      regionalIndicatorCount += 1;
      joinNext = false;
      continue;
    }
    if (clusters.length === 0) {
      clusters.push(character);
    } else if (joinNext || isGraphemeExtender(character)) {
      clusters[clusters.length - 1] += character;
    } else {
      clusters.push(character);
    }
    joinNext = character === "\u200d";
    if (!isGraphemeExtender(character)) {
      regionalIndicatorCount = 0;
    }
  }
  return clusters;
}

/** @param {string} character */
function isRegionalIndicator(character) {
  return /^[\u{1f1e6}-\u{1f1ff}]$/u.test(character);
}

/** @param {string} character */
function isGraphemeExtender(character) {
  return /\p{Mark}/u.test(character)
    || character === "\u200d"
    || /^[\ufe00-\ufe0f]$/u.test(character)
    || /^[\u{e0100}-\u{e01ef}]$/u.test(character)
    || /^[\u{1f3fb}-\u{1f3ff}]$/u.test(character);
}
