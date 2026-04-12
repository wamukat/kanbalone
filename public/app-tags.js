export function tagToneClass(tag) {
  return tag.color ? "" : " tag-no-color";
}

export function tagBackgroundStyle(tag, escapeHtml) {
  if (!tag.color) {
    return "";
  }
  return ` style="background:${escapeHtml(tag.color)};color:${tagTextColor(tag.color)}"`;
}

export function tagTextColor(hexColor) {
  const rgb = parseHexColor(hexColor);
  if (!rgb) {
    return "#fff";
  }
  const luminance = relativeLuminance(rgb);
  return luminance > 0.48 ? "#1c1c17" : "#fffdf7";
}

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

function relativeLuminance({ r, g, b }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
