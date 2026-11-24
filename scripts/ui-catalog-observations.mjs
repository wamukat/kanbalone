import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const stateLimits = new Map([
  ["home.bootstrap-message", { states: [], note: "アプリ起動前の初期HTML。初期化完了後のフレームは対象外。" }],
  ["home.empty-copy", { states: ["no-board"], note: "初期化が完了し、ボードがない状態。" }],
  ["custom-view.heading", {
    states: ["expanded-excerpt", "missing-and-empty", "narrow-sort", "page-first", "page-next", "saved", "selector-check-saved", "sort-temporary"],
    note: "保存済みビューの画面。利用不可の画面は除く。",
  }],
  ["custom-view.unavailable-heading", { states: ["unavailable"], note: "指定ビューが利用できない状態。" }],
  ["custom-view.unavailable-description", { states: ["unavailable"], note: "指定ビューが利用できない状態の説明。" }],
  ["ticket-detail.body-remote-empty", { states: ["remote-snapshot"], note: "リモート本文タブで空の本文を表示した場合。" }],
  ["ticket-detail.body-diff-empty", { states: ["remote-diff"], note: "差分タブで比較できる本文がない場合。" }],
]);

const catalog = new URL("../docs/development/ui-component-catalog/", import.meta.url);
const mode = process.argv[2];
if (mode && mode !== "--check") throw new Error("Usage: node scripts/ui-catalog-observations.mjs [--check]");
const read = async (pathname) => JSON.parse(await readFile(new URL(pathname, catalog), "utf8"));
const files = async (directory) =>
  (await readdir(new URL(directory, catalog))).filter((name) => name.endsWith(".json")).sort();

function splitTopLevel(selector, mode) {
  const tokens = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === "[" || char === "(") depth++;
    if (char === "]" || char === ")") depth--;
    if (depth < 0) return [];
    if (depth || quote) continue;
    if ((mode === "list" && char !== ",") || (mode === "path" && !/[\s>]/.test(char))) continue;
    const part = selector.slice(start, index).trim();
    if (part) tokens.push(part);
    if (char === ">") tokens.push(char);
    start = index + 1;
  }
  if (depth || quote) return [];
  const tail = selector.slice(start).trim();
  if (tail) tokens.push(tail);
  return tokens;
}

const identifier = "[a-zA-Z_][a-zA-Z_0-9-]*";
const tagPattern = new RegExp(`^(\\*|${identifier})`);
const simpleIdentity = new RegExp(`^([.#])(${identifier})`);
const staticAttribute = new RegExp(`^\\[(${identifier})(?:=(?:"([^"]*)"|'([^']*)'|([\\w-]+)))?\\]`);

function parseCompound(compound) {
  const tests = [];
  const tag = tagPattern.exec(compound)?.[0];
  if (tag && tag !== "*") tests.push(["tag", tag]);
  let remaining = compound.slice(tag?.length ?? 0);
  while (remaining.length) {
    const identity = simpleIdentity.exec(remaining);
    const attribute = staticAttribute.exec(remaining);
    const first = /^:first-child(?![\w-])/.exec(remaining);
    if (identity) {
      tests.push([identity[1] === "#" ? "id" : "class", identity[2]]);
      remaining = remaining.slice(identity[0].length);
    } else if (attribute) {
      tests.push(["attribute", attribute[1], attribute[2] ?? attribute[3] ?? attribute[4]]);
      remaining = remaining.slice(attribute[0].length);
    } else if (first) {
      tests.push(["nth-child", 1]);
      remaining = remaining.slice(first[0].length);
    } else {
      const prefix = /^:(nth-of-type|nth-child|not|is|has)\(/.exec(remaining);
      if (!prefix) return null;
      let depth = 1;
      let end = prefix[0].length;
      for (; end < remaining.length && depth; end++) {
        if (remaining[end] === "(") depth++;
        if (remaining[end] === ")") depth--;
      }
      if (depth) return null;
      const inside = remaining.slice(prefix[0].length, end - 1).trim();
      const name = prefix[1];
      if (name === "nth-of-type" || name === "nth-child") {
        if (!/^[1-9]\d*$/.test(inside)) return null;
        tests.push([name, Number(inside)]);
      } else if (name === "has") {
        // Positive evidence for one compound descendant suffices. Absence from
        // the collection cannot disprove :has() because it omits some nodes.
        const direct = inside.startsWith(">");
        const inner = parseCompound(direct ? inside.slice(1).trim() : inside);
        if (!inner?.length) return null;
        tests.push([name, inner, direct]);
      } else {
        const alternatives = splitTopLevel(inside, "list").map(parseCompound);
        if (!alternatives.length || alternatives.some((entry) => !entry?.length)) return null;
        tests.push([name, alternatives]);
      }
      remaining = remaining.slice(end);
    }
  }
  return tests;
}

function parseSelector(selector) {
  const branches = splitTopLevel(selector, "list");
  if (!branches.length) return null;
  const paths = branches.map((branch) => {
    const path = [];
    let child = false;
    for (const part of splitTopLevel(branch, "path")) {
      if (part === ">") {
        if (!path.length || child) return null;
        child = true;
        continue;
      }
      const tests = parseCompound(part);
      if (!tests) return null;
      path.push({ tests, child });
      child = false;
    }
    return path.length && !child ? path : null;
  });
  return paths.some((part) => part === null) ? null : paths;
}

function frameGraph(elements) {
  const nodes = new Map();
  function nodeFor(key) {
    if (nodes.has(key)) return nodes.get(key);
    const split = key.lastIndexOf(" > ");
    const segment = key.slice(split < 0 ? 0 : split + 3);
    const position = /:nth-of-type\((\d+)\)$/.exec(segment);
    const node = {
      id: segment.startsWith("#") ? segment.slice(1) : undefined,
      tag: position ? segment.slice(0, position.index) : segment.startsWith("#") ? undefined : segment,
      nthOfType: position && Number(position[1]),
      parent: split < 0 ? null : nodeFor(key.slice(0, split)),
      children: new Set(),
    };
    nodes.set(key, node);
    return node;
  }
  const indexed = elements.map((data, index) => Object.assign(nodeFor(data.key), { data, index, tag: data.tag }));
  for (const node of indexed) {
    if (node.data.parentKey) node.parent = nodeFor(node.data.parentKey);
  }
  for (const node of nodes.values()) node.parent?.children.add(node);
  return { indexed, nodes };
}

function disjunction(values) {
  if (values.includes(true)) return true;
  return values.includes(null) ? null : false;
}

function hasMatch(node, tests, direct) {
  for (const child of node.children) {
    if (checks(child, tests) === true) return true;
    if (!direct && hasMatch(child, tests, false) === true) return true;
  }
  return null;
}

function comparison(node, [kind, value, extra]) {
  switch (kind) {
    case "tag": return node.tag ? node.tag === value : null;
    case "id": return node.id ? node.id === value : null;
    case "class": return node.data ? (node.data.classes ?? []).includes(value) : null;
    case "attribute": {
      const attrs = node.data?.attributes;
      if (attrs && Object.hasOwn(attrs, value)) return extra === undefined || attrs[value] === extra;
      return null;
    }
    case "nth-of-type": return node.nthOfType ? node.nthOfType === value : null;
    case "nth-child": return node.data?.childIndex ? node.data.childIndex === value : null;
    case "is": return disjunction(value.map((group) => checks(node, group)));
    case "not": {
      const result = disjunction(value.map((group) => checks(node, group)));
      return result === null ? null : !result;
    }
    case "has": return hasMatch(node, value, extra);
    default: throw new Error(`Unknown selector test ${kind}`);
  }
}

function checks(node, tests) {
  let result = true;
  for (const test of tests) {
    const value = comparison(node, test);
    if (value === false) return false;
    if (value === null) result = null;
  }
  return result;
}

function provesMatch(node, path, index = path.length - 1) {
  if (!node || checks(node, path[index].tests) !== true) return false;
  if (index === 0) return true;
  if (path[index].child) return provesMatch(node.parent, path, index - 1);
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (provesMatch(parent, path, index - 1)) return true;
  }
  return false;
}

function indexFrame(frame) {
  const { frameId, screen, elements, styles, properties } = frame;
  if (!frameId || !screen || !Array.isArray(elements) || !Array.isArray(styles) || !Array.isArray(properties)) {
    throw new Error(`Invalid frame ${frameId}`);
  }
  for (const style of styles) {
    if (style.length !== properties.length) throw new Error(`Invalid style vector in ${frameId}`);
  }
  const positions = frameGraph(elements);
  const pseudoBackdrop = Array.isArray(frame.backdrop) ? frame.backdrop : [];
  return { ...frame, ...positions, pseudoBackdrop };
}

function withinModal(node, frame) {
  const keys = frame.pseudoBackdrop.map(({ key }) => key);
  for (let current = node; current; current = current.parent) {
    if (current.data && keys.includes(current.data.key)) return true;
  }
  return false;
}

function frameMatches(frame, selector, parts, pseudo) {
  const native = frame.selectorMatches;
  const checkedInBrowser = native && Object.hasOwn(native, selector);
  const nodes = checkedInBrowser
    ? native[selector].map((key) => {
        const node = frame.nodes.get(key);
        if (!node?.data) throw new Error(`Unknown query match key in ${frame.frameId}: ${key}`);
        return node;
      })
    : parts ? frame.indexed.filter((node) => parts.some((path) => provesMatch(node, path))) : [];
  const items = [];
  for (const node of nodes) {
    if (node.data.states?.includes("inert")) continue;
    if (frame.pseudoBackdrop.length && !withinModal(node, frame)) continue;
    let styleIndex = node.data.style;
    if (pseudo === "::backdrop") styleIndex = frame.pseudoBackdrop.find((entry) => entry.key === node.data.key)?.style;
    else if (pseudo) styleIndex = node.data.pseudo?.[pseudo]?.style;
    if (styleIndex === undefined && pseudo) continue;
    if (!frame.styles[styleIndex]) throw new Error(`Missing style vector in ${frame.frameId} at ${styleIndex}`);
    items.push({ elementIndex: node.index, styleIndex, ...(pseudo && { pseudo }) });
  }
  return items.length ? {
    frame: frame.frameId,
    method: checkedInBrowser ? "browser-query" : "captured-dom",
    image: frame.image,
    items,
  } : null;
}

function inline(value) {
  const text = String(value);
  const fence = text.includes("`") ? "``" : "`";
  return `${fence}${text.replaceAll("\n", " ")}${fence}`;
}

function frameLabel(frame) {
  return `${frame.locale} / ${frame.colorScheme} / ${frame.screen} · ${frame.state}`;
}

function evidenceLinks(frame) {
  const links = [];
  if (frame.image) links.push(`[${frame.frameId}.png](../evidence/images/${frame.image})`);
  links.push(`[実測生データ](../evidence/styles/${frame.frameId}.json)`);
  return links.join(" · ");
}

function stylesSummary(frame, item) {
  const vector = new Map(frame.properties.map((name, index) => [name, frame.styles[item.styleIndex][index]]));
  const values = (...properties) => properties.map((name) => vector.get(name) || "—").join(" / ");
  const directions = ["top", "right", "bottom", "left"];
  const sides = (family) => values(...directions.map((side) => `${family}-${side}`));
  const border = directions.map((side) => values(`border-${side}-width`, `border-${side}-style`, `border-${side}-color`));
  const borderValue = new Set(border).size === 1 ? border[0] : border.join(" ｜ ");
  return [
    `文字 ${inline(values("font-family", "font-size", "font-weight", "line-height"))}`,
    `前景・背景 ${inline(values("color", "background-color"))}`,
    `枠 ${inline(borderValue)}、角丸 ${inline(values("border-radius"))}`,
    `内余白 ${inline(sides("padding"))}、外余白 ${inline(sides("margin"))}、間隔 ${inline(values("row-gap", "column-gap"))}`,
    `配置 ${inline(values("display", "position"))}、寸法 ${inline(values("width", "height"))}`,
  ].join("。") + "。";
}

function examplesFor(observations, frames) {
  const themes = new Map();
  for (const observed of observations) {
    const frame = frames.get(observed.frame);
    const inViewport = observed.items.find(({ elementIndex }) => frame.elements[elementIndex].intersectsViewport);
    const previous = themes.get(frame.colorScheme);
    const rank = Number(!!inViewport) * 2 + Number(!!frame.image);
    if (!previous || rank > previous.rank) {
      themes.set(frame.colorScheme, { frame, item: inViewport ?? observed.items[0], inViewport: !!inViewport, rank });
    }
  }
  return [...themes.values()];
}

function belongsToScreen(frame, screenId) {
  if (frame.screen === screenId) return true;
  if (screenId === "shell") return ["list", "group", "kanban"].includes(frame.screen);
  if (screenId === "home" && frame.screen === "shell" && frame.state === "new-board" && frame.path === "/") {
    return frame.elements.some((element) => element.classes?.includes("no-boards"));
  }
  return false;
}

function renderScreen(screen, records, frames) {
  const matched = records.filter((entry) => entry.frames.length).length;
  const lines = [
    `# 実測スタイル — ${screen.title}`,
    "",
    `[画面別の要素一覧](../screens/${screen.screenId}.md) · [すべての照合結果（JSON）](${screen.screenId}.json) · [照合の読み方](README.md)`,
    "",
    `${records.length} 要素のうち ${matched} 要素を採取DOMと照合しました。要素ごとに採取できたテーマの実測例を掲載します。`,
  ];
  for (const record of records) {
    lines.push("", `<a id="${record.id}" name="${record.id}"></a>`, "", `### ${record.id}`, "", inline(record.selector), "");
    if (record.stateLimit) lines.push(record.stateLimit.note, "");
    if (!record.frames.length) {
      if (record.markdownSpecimen) {
        const specimen = frames.get(record.markdownSpecimen);
        lines.push(`未観測。サンプルの取り消し線記法は平文として表示されました。${evidenceLinks(specimen)}`);
        continue;
      }
      lines.push(record.selectorSupported
        ? "未観測。この画面で採取したDOMに、このセレクターで確定できる要素はありませんでした。"
        : "未照合。採取済みDOMだけで、このセレクターの一致を判定できませんでした。");
      continue;
    }
    for (const { frame, item, inViewport } of examplesFor(record.frames, frames)) {
      const position = `elements[${item.elementIndex}] / styles[${item.styleIndex}]${item.pseudo ? ` / ${item.pseudo}` : ""}`;
      const node = frame.elements[item.elementIndex];
      const classState = node.states?.join(", ");
      const pseudoContent = item.pseudo && node.pseudo?.[item.pseudo]?.content;
      lines.push(
        `- ${frameLabel(frame)} · ${inline(position)}${inViewport ? "" : "（要素の矩形は採取時の表示領域外）"}${classState ? ` · ${inline(classState)}` : ""}。${evidenceLinks(frame)}`,
        `  ${stylesSummary(frame, item)}${pseudoContent ? ` 生成内容 ${inline(pseudoContent)}。` : ""}`,
      );
    }
    lines.push("", `一致を記録したフレーム ${record.frames.length} 件。[${screen.screenId}.json](${screen.screenId}.json)`);
  }
  const matchedFrames = [...new Set(records.flatMap((entry) => entry.frames.map((frame) => frame.frame)))].sort();
  lines.push("", "## 照合に使った画像", "");
  for (const id of matchedFrames) {
    const frame = frames.get(id);
    lines.push(`- ${frameLabel(frame)}。${evidenceLinks(frame)}`);
  }
  return lines.join("\n") + "\n";
}

async function write(pathname, content) {
  const target = new URL(pathname, catalog);
  if (mode === "--check") {
    if ((await readFile(target, "utf8")) !== content) throw new Error(`Regenerate ${pathname}`);
  } else {
    await writeFile(target, content);
  }
}

async function verifiedArtifact(relativePath, expectedSha) {
  const bytes = await readFile(new URL(`evidence/${relativePath}`, catalog));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedSha) throw new Error(`Capture manifest hash differs: ${relativePath}`);
  return bytes;
}

const manifest = await read("evidence/manifest.json");
const frames = new Map();
for (const entry of manifest.frames.toSorted((left, right) => left.id.localeCompare(right.id, "en"))) {
  if (!/^[a-z0-9-]+$/.test(entry.id) || entry.styles !== `styles/${entry.id}.json` || frames.has(entry.id)) {
    throw new Error(`Invalid frame name ${entry.id}`);
  }
  const data = await verifiedArtifact(entry.styles, entry.styleSha256);
  const frame = indexFrame(JSON.parse(data.toString("utf8")));
  if (frame.frameId !== entry.id || frame.screen !== entry.screen || frame.state !== entry.state) {
    throw new Error(`Capture frame metadata differs: ${entry.id}`);
  }
  frame.image = null;
  if (entry.image) {
    frame.image = `${entry.id}.png`;
    if (entry.image !== `images/${frame.image}`) throw new Error(`Invalid image name ${entry.image}`);
    await verifiedArtifact(entry.image, entry.sha256);
  }
  frames.set(frame.frameId, frame);
}
if (frames.size !== manifest.frameCount || [...frames.values()].filter((frame) => frame.image).length !== manifest.imageCount) {
  throw new Error("Capture manifest totals differ");
}

const unrenderedMarkdown = new Map();
for (const specimen of manifest.supplementalFixture?.markdownObservations ?? []) {
  if (!frames.has(specimen.frameId)) throw new Error(`Missing Markdown frame ${specimen.frameId}`);
  for (const id of specimen.notObserved) unrenderedMarkdown.set(id, specimen.frameId);
}

if (!mode) await mkdir(new URL("observations/", catalog), { recursive: true });
const summary = [];
for (const filename of await files("screens")) {
  if (filename === "rules.json") continue;
  const screen = await read(`screens/${filename}`);
  if (filename !== `${screen.screenId}.json` || !Array.isArray(screen.elements)) throw new Error(`Invalid screen name ${filename}`);
  const screenFrames = [...frames.values()].filter((frame) => belongsToScreen(frame, screen.screenId));
  for (const frame of screenFrames) {
    if (frame.source !== screen.sourceRevision) {
      throw new Error(`Frame ${frame.frameId} and screen ${screen.screenId} have different source revisions`);
    }
  }
  const ids = new Set();
  const entriesBySelector = Map.groupBy(screen.elements, (entry) => entry.selector.trim());
  for (const entries of entriesBySelector.values()) {
    if (entries.length > 1 && entries.some((entry) => !stateLimits.has(entry.id))) {
      throw new Error(`Add frame conditions for shared selector: ${entries.map(({ id }) => id).join(", ")}`);
    }
  }
  const records = screen.elements.map(({ id, selector }) => {
    if (!/^[a-z0-9.-]+$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate inventory ID: ${id}`);
    ids.add(id);
    const value = selector.trim();
    const pseudo = /::(?:before|after|backdrop)$/.exec(value)?.[0];
    const base = pseudo ? value.slice(0, -pseudo.length) : value;
    const parts = parseSelector(base);
    const stateLimit = stateLimits.get(id);
    const eligible = stateLimit
      ? screenFrames.filter((frame) => stateLimit.states.includes(frame.state))
      : screenFrames;
    const observations = eligible.map((frame) => frameMatches(frame, value, parts, pseudo)).filter(Boolean);
    const markdownSpecimen = !observations.length && unrenderedMarkdown.get(id);
    return {
      id, selector, selectorSupported: !!parts,
      ...(stateLimit && { stateLimit }),
      ...(markdownSpecimen && { markdownSpecimen }),
      frames: observations,
    };
  });
  const screenID = screen.screenId;
  const jsonRecords = records.map((record) => "    " + JSON.stringify(record)).join(",\n");
  const raw = `{\n  "screenId": "${screenID}",\n  "elements": [\n${jsonRecords}\n  ]\n}\n`;
  await write(`observations/${screenID}.json`, raw);
  await write(`observations/${screenID}.md`, renderScreen(screen, records, frames));
  summary.push({
    screenId: screenID,
    frames: screenFrames.length,
    total: records.length,
    matched: records.filter((record) => record.frames.length).length,
  });
}
if (!summary.length) throw new Error("No screen inventories found");
console.log(JSON.stringify({ frames: frames.size, screens: summary }, null, 2));
