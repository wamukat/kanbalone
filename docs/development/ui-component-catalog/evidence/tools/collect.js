(() => {
  const inventoryElements = /* inventory IDs */ {};
  const properties = [
    "font-family", "font-size", "font-weight", "line-height", "color", "background-color", "background-image",
    "border-top-width", "border-top-style", "border-top-color", "border-right-width", "border-right-color",
    "border-bottom-width", "border-bottom-color", "border-left-width", "border-left-color", "border-radius",
    "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "row-gap", "column-gap", "height",
    "min-height", "width", "min-width", "display", "position", "align-items", "justify-content", "flex-direction",
    "flex-wrap", "grid-template-columns", "overflow-x", "overflow-y", "text-overflow", "white-space", "box-shadow",
    "outline-style", "outline-width", "outline-color", "outline-offset", "appearance", "accent-color", "color-scheme", "fill", "stroke", "mask-image",
    "cursor", "opacity"
  ];
  const rectOf = node => {
    const rect = node.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height].map(position => Math.round(position * 100) / 100);
  };
  const anchors = node => {
    if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) return "#" + CSS.escape(node.id);
    let index = 1;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.localName === node.localName) index++;
    }
    return node.parentElement
      ? anchors(node.parentElement) + " > " + node.localName + ":nth-of-type(" + index + ")"
      : node.localName;
  };
  const visible = node => {
    if (node.closest("[hidden]") || node.closest("dialog:not([open])")) return false;
    if (!node.getClientRects().length) return false;
    const css = getComputedStyle(node);
    return css.display !== "none" && css.visibility === "visible"
      && (node.getBoundingClientRect().width > 0 || node.getBoundingClientRect().height > 0);
  };
  const flags = node => {
    const states = [":hover", ":focus", ":focus-visible", ":disabled", ":checked", ":indeterminate"];
    const list = states.filter(state => node.matches(state));
    if (node.closest("[inert]")) list.push("inert");
    for (const state of ["current", "expanded", "pressed", "selected", "disabled", "invalid", "busy", "checked"]) {
      const value = node.getAttribute("aria-" + state);
      if (value !== null) list.push("aria-" + state + "=" + value);
    }
    return list;
  };
  const styleCache = new Map();
  const styles = [];
  function styleIndex(css) {
    const values = properties.map(property => css.getPropertyValue(property));
    const key = JSON.stringify(values);
    if (!styleCache.has(key)) {
      styleCache.set(key, styles.length);
      styles.push(values);
    }
    return styleCache.get(key);
  }
  const elements = [...document.querySelectorAll("html, body, body *")].filter(node =>
    !node.matches("script,style,template,noscript,link,defs,defs *,symbol,symbol *,path") && visible(node)
  ).map(node => {
    const rect = rectOf(node);
    const [x, y, width, height] = rect;
    const css = getComputedStyle(node);
    const key = anchors(node);
    const attributes = [...node.attributes].filter(attr =>
      (attr.name.startsWith("data-") && !["data-i18n", "data-i18n-title", "data-i18n-placeholder", "data-i18n-aria-label"].includes(attr.name))
      || ["role", "type", "name", "aria-label", "aria-hidden", "title", "for", "tabindex", "datetime", "open", "value", "lang"].includes(attr.name)
    ).map(attr => [attr.name, attr.value]).filter(([,value]) => value.length < 160);
    const element = {
      key,
      parentKey: node.parentElement ? anchors(node.parentElement) : null,
      childIndex: node.parentElement ? [...node.parentElement.children].indexOf(node) + 1 : 0,
      tag: node.localName,
      rect,
      intersectsViewport: x < innerWidth && y < innerHeight && x + width > 0 && y + height > 0,
      style: styleIndex(css)
    };
    const classes = [...node.classList];
    if (classes.length) element.classes = classes;
    if (attributes.length) element.attributes = Object.fromEntries(attributes);
    const states = flags(node);
    if (states.length) element.states = states;
    if (node.matches("button,a,label,h1,h2,h3,h4,summary,[role=option],input,select") && !node.matches("svg")) {
      const label = (node.getAttribute("aria-label") || node.innerText || node.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 100);
      if (label) element.label = label;
    }
    if (css.overflowX !== "visible" || css.overflowY !== "visible") {
      element.scroll = [node.scrollWidth, node.clientWidth, node.scrollHeight, node.clientHeight, node.scrollLeft, node.scrollTop];
    }
    if (node.matches("input,select,textarea,progress")) element.nativeControl = true;
    if (node.matches("use") && node.getAttribute("href")) element.svgSymbol = node.getAttribute("href");
    const pseudo = {};
    for (const part of ["::before","::after"]) {
      const css = getComputedStyle(node, part);
      if (css.content !== "none" && css.content !== "normal") {
        pseudo[part] = {content: css.content, style: styleIndex(css)};
      }
    }
    if (Object.keys(pseudo).length) element.pseudo = pseudo;
    return element;
  });
  const backdrop = [...document.querySelectorAll("dialog:modal")].map(dialog => ({
    key: anchors(dialog), style: styleIndex(getComputedStyle(dialog, "::backdrop"))
  }));
  const keyedElements = new Map(elements.map(element => [element.key, element]));
  const backdropKeys = new Set(backdrop.map(record => record.key));
  const selectorMatches = {};
  for (const selector of new Set(Object.values(inventoryElements))) {
    const pseudo = selector.match(/::(before|after|backdrop)$/);
    if (selector.includes("::") && !pseudo) continue;
    try {
      const keys = [...document.querySelectorAll(pseudo ? selector.slice(0, pseudo.index) : selector)]
        .map(anchors)
        .filter(key => keyedElements.has(key) && (!pseudo || (pseudo[1] === "backdrop"
          ? backdropKeys.has(key) : keyedElements.get(key).pseudo?.[pseudo[0]])));
      if (keys.length) selectorMatches[selector] = keys;
    } catch {
      // The source inventory also contains virtual-only or native syntax that is not a live element selector.
    }
  }
  const elementIdMatches = Object.fromEntries(Object.entries(inventoryElements)
    .filter(([, selector]) => selectorMatches[selector]?.length)
    .map(([id, selector]) => [id, selectorMatches[selector]]));
  return {
    path: location.pathname, viewport: [innerWidth, innerHeight, devicePixelRatio],
    locale: document.documentElement.lang, colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    forcedColors: matchMedia("(forced-colors: active)").matches, browser: navigator.userAgent,
    properties, styles, elements, backdrop, selectorMatches, elementIdMatches
  };
})()
