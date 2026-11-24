import { readFile, readdir, writeFile } from "node:fs/promises";

const catalog = new URL("../docs/development/ui-component-catalog/", import.meta.url);
const check = process.argv[2] === "--check";
if (process.argv[2] && !check) throw new Error("Usage: node scripts/ui-catalog-style-comparison.mjs [--check]");
const read = async (path) => JSON.parse(await readFile(new URL(path, catalog), "utf8"));

const [manifest, mapping, data] = await Promise.all([
  read("evidence/manifest.json"),
  read("semantics/mapping.json"),
  read("semantics/style-comparison.json"),
]);
if (data.sourceRevision !== manifest.sourceCommit || data.sourceRevision !== mapping.sourceRevision) {
  throw new Error("Evidence and semantic inventory must identify the same product revision");
}
const revision = data.sourceRevision;
const manifestFrames = new Map(manifest.frames.map((entry) => [entry.id, entry]));
const frames = new Map();
const inventories = new Map(mapping.elements.map((element) => [element.elementId, element]));
const exact = new Map();
for (const file of (await readdir(new URL("observations/", catalog))).filter((name) => name.endsWith(".json"))) {
  const { elements } = await read(`observations/${file}`);
  for (const element of elements) exact.set(element.id, element);
}

const fields = {
  controls: "font-size font-weight line-height height padding-top padding-left border-top-width border-radius color background-color",
  box: "display width height padding-top padding-left border-top-width border-radius",
  panel: "display width height padding-top padding-left row-gap border-top-width border-radius color background-color",
  text: "font-size font-weight line-height height display color white-space",
  checkbox: "appearance width height padding-top padding-left border-top-width accent-color",
  icon: "width height border-top-width border-radius background-color color",
  badge: "font-size font-weight width height padding-top padding-left border-top-width border-radius color background-color",
  tab: "font-size font-weight width height border-bottom-width border-bottom-color color",
  colors: "color background-color",
  label: "display font-size font-weight line-height row-gap width height color",
};
const properties = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.split(" ")]));
const judgments = {
  "keep-shared": "既存共有を維持",
  "preserve-variants": "意図的な差を維持",
  "share-candidate": "共通化候補",
  "correction-candidate": "是正候補",
  "insufficient-evidence": "根拠不足・保留",
};
const coverage = {
  "direct-sample": "同条件の直接比較あり",
  "representative-only": "異なる役割・状態等の代表例",
  "insufficient-evidence": "比較対象の観測が不足",
};
const modes = {
  peer: "同条件の代表比較",
  variant: "状態・操作・配置の違いを確認",
  context: "同画面の周辺要素を照合",
  "contrast-theme": "明暗のみを変えた照合",
};

const required = mapping.components
  .filter((group) => ["cross-screen-review", "internal-review"].includes(group.assessment))
  .map(({ id, assessment }) => `${id}:${assessment}`).sort();
const supplied = data.groups.map(({ id, assessment }) => `${id}:${assessment}`).sort();
if (JSON.stringify(required) !== JSON.stringify(supplied)) throw new Error("Comparison groups differ from the semantic inventory");

async function getFrame(id) {
  if (!frames.has(id)) {
    const entry = manifestFrames.get(id);
    if (!entry) throw new Error(`Unknown frame ${id}`);
    frames.set(id, await read(`evidence/${entry.styles}`));
  }
  const frame = frames.get(id);
  if (frame.frameId !== id || frame.source !== revision) throw new Error(`Invalid frame metadata ${id}`);
  return frame;
}

function interaction(states) {
  return states.filter((state) => /^(:hover|:focus|:focus-visible|:disabled|:checked|:indeterminate|aria-(selected|current|pressed|expanded|checked|disabled)=)/.test(state)).sort();
}

async function observe(sample, selected) {
  const { elementId, frameId, elementIndex, pseudo } = sample;
  const frame = await getFrame(frameId);
  const occurrence = exact.get(elementId)?.frames.find(({ frame }) => frame === frameId);
  const match = occurrence?.items.find((item) => item.elementIndex === elementIndex && item.pseudo === pseudo);
  if (!match || !inventories.has(elementId)) throw new Error(`Unverified occurrence ${elementId} in ${frameId}`);
  const element = frame.elements[elementIndex];
  const measured = pseudo === "::backdrop"
    ? frame.backdrop.find((entry) => entry.key === element.key)?.style
    : pseudo ? element.pseudo?.[pseudo]?.style : element.style;
  if (measured !== match.styleIndex || !element.intersectsViewport) throw new Error(`Invalid visible style sample ${elementId} in ${frameId}`);
  const style = frame.styles[measured];
  const values = Object.fromEntries(selected.map((property) => {
    const index = frame.properties.indexOf(property);
    if (index < 0) throw new Error(`Missing ${property} in ${frameId}`);
    return [property, style[index]];
  }));
  return {
    elementId, frameId, elementIndex,
    ...(pseudo && { pseudo }),
    styleIndex: measured,
    domKey: element.key,
    ...(pseudo && element.pseudo?.[pseudo]?.content && { generatedContent: element.pseudo[pseudo].content }),
    state: frame.state,
    interaction: interaction(element.states ?? []),
    values,
  };
}

async function compute(comparison) {
  const { mode, profile, label } = comparison;
  const samples = [];
  for (const input of comparison.samples) samples.push(await observe(input, properties[profile]));
  if (samples.length < 2 || !modes[mode]) throw new Error(`Incomplete comparison ${label}`);
  const metadata = samples.map(({ frameId }) => frames.get(frameId));
  const [{ locale, colorScheme, viewport, browser }] = metadata;
  if (!metadata.every((frame) =>
    frame.locale === locale && frame.browser === browser && JSON.stringify(frame.viewport) === JSON.stringify(viewport) &&
    (mode === "contrast-theme" || frame.colorScheme === colorScheme)
  )) throw new Error(`Frame conditions differ in ${label}`);
  if (mode === "peer" || mode === "contrast-theme") {
    const state = JSON.stringify(samples[0].interaction);
    if (!samples.every((sample) => JSON.stringify(sample.interaction) === state)) {
      throw new Error(`Interaction state differs in ${label}: ${JSON.stringify(samples.map(({interaction}) => interaction))}`);
    }
  }
  return {
    mode, profile, label,
    condition: { locale, viewport, themes: [...new Set(metadata.map((frame) => frame.colorScheme))] },
    samples,
    differingProperties: properties[profile].filter((key) => new Set(samples.map(({ values }) => values[key])).size > 1),
  };
}

for (const group of [...data.groups, ...data.primitives, ...data.otherFindings]) {
  if (!judgments[group.disposition] || !coverage[group.coverage]) throw new Error(`Invalid group disposition ${group.id}`);
  const comparisons = [];
  for (const comparison of group.comparisons) {
    try {
      comparisons.push(await compute(comparison));
    } catch (error) {
      throw new Error(`${group.id}: ${error.message}`);
    }
  }
  group.comparisons = comparisons;
}

function reference(sample) {
  const { screenId } = inventories.get(sample.elementId);
  const frame = manifestFrames.get(sample.frameId);
  const location = `elements[${sample.elementIndex}] / styles[${sample.styleIndex}]${sample.pseudo ? ` / ${sample.pseudo}` : ""}`;
  const parts = [
    `[${sample.elementId}](../observations/${screenId}.md#${sample.elementId})`,
    `\`${location}\``,
    `状態 ${sample.state}${sample.interaction.length ? ` · ${sample.interaction.join(", ")}` : ""}`,
  ];
  if (sample.generatedContent) parts.push(`生成内容 \`${sample.generatedContent}\``);
  parts.push(`[生データ](../evidence/${frame.styles})`);
  if (frame.image) parts.push(`[原画像](../evidence/${frame.image})`);
  return parts.join(" · ");
}

function outputRow(group) {
  return `| [${group.label}](#${group.id}) | ${coverage[group.coverage]} | ${judgments[group.disposition]} |`;
}

function renderGroup(group) {
  const lines = [
    `<a id="${group.id}" name="${group.id}"></a>`,
    "",
    `### ${group.label}`,
    "",
    `${coverage[group.coverage]}。**${judgments[group.disposition]}**。`,
    "",
    group.reason,
    "",
    group.candidate,
  ];
  if (group.sourceRefs.length) {
    const sources = group.sourceRefs.map(({ file, line }) =>
      `[${file.split("/").at(-1)}#L${line}](https://github.com/wamukat/kanbalone/blob/${revision}/${file}#L${line})`);
    lines.push("", sources.join(" · "));
  }
  for (const comparison of group.comparisons) {
    const { condition, differingProperties, samples } = comparison;
    const [width, height, dpr] = condition.viewport;
    lines.push(
      "",
      `**${comparison.label}**。 ${modes[comparison.mode]}。 ${condition.locale} / ${condition.themes.join("・")} / ${width} × ${height}（DPR ${dpr}）。`,
      "",
      ...samples.map((sample, index) => `- ${String.fromCharCode(65 + index)}. ${reference(sample)}`),
      "",
      `| 実測CSSプロパティ | ${samples.map((_, index) => String.fromCharCode(65 + index)).join(" | ")} |`,
      `| --- | ${samples.map(() => "---").join(" | ")} |`,
    );
    for (const property of properties[comparison.profile]) {
      const values = samples.map(({ values }) => `\`${values[property] || '""'}\``);
      lines.push(`| \`${property}\` | ${values.join(" | ")} |`);
    }
    if (!differingProperties.length) lines.push("", "この表の実測項目は一致。");
  }
  return lines.join("\n");
}

const counts = Object.fromEntries(Object.keys(coverage).map((value) => [value, data.groups.filter((group) => group.coverage === value).length]));
const rowHeader = "| 比較群 | 比較の範囲 | 判断 |\n| --- | --- | --- |";
const markdown = [
  "# UI部品のスタイル比較",
  "",
  "画面別の棚卸しと意味分類から、画面横断23群・領域内15群を評価しました。各群の代表例を比較し、全要素・全状態の組み合わせは測定していません。横断で確認した9つの基本型と、比較で別途確認した初回案内も記録します。タブやタグ表示等は各比較群に含め、OSが描画する選択肢の画面は対象外としました。 [全判定と実測値（JSON）](style-comparison.json) · [意味分類](taxonomy.md) · [採取マニフェスト](../evidence/manifest.json)",
  "",
  `38群の比較範囲は、同条件の直接比較あり ${counts["direct-sample"]} 群、異なる役割・状態等の代表例 ${counts["representative-only"]} 群、比較対象の観測が不足 ${counts["insufficient-evidence"]} 群です。`,
  "",
  "直接比較は代表例のブラウザー・言語・テーマ・viewport・記録された操作状態を揃え、同じ役割のプロパティを読みます。状態や役割が異なる例と明暗差は、該当する条件を明示しました。幅・高さにはテキスト量や親領域が反映されます。CSS値の一致は測定表の項目の範囲です。",
  "",
  "## 優先して確認する是正候補",
  "",
  "- 暗色の履歴本文に文字色を与える。 [履歴の測定](#activity-timeline)",
  "- 外部課題の取り込みでチェックボックスの配置と操作領域を直す。 [チェックボックスの測定](#checkbox)",
  "- Markdownのリンクにテーマ色・下線・フォーカスの共通ルールを適用する。 [同一試料での測定](#rich-text-link)",
  "- 日本語の初回ボード作成案内を翻訳経路に載せる。 [擬似要素の文字の測定](#home-copy)",
  "",
  "## 38比較群",
  "",
  rowHeader,
  ...data.groups.map(outputRow),
  "",
  "## 横断の基本型",
  "",
  rowHeader,
  ...data.primitives.map(outputRow),
  "",
  "## 各判断の測定値",
  "",
  [...data.groups, ...data.primitives, ...data.otherFindings].map(renderGroup).join("\n\n"),
  "",
].join("\n");

async function save(path, content) {
  const location = new URL(path, catalog);
  if (check) {
    if ((await readFile(location, "utf8")) !== content) throw new Error(`Regenerate ${path}`);
  } else {
    await writeFile(location, content);
  }
}
await save("semantics/style-comparison.json", JSON.stringify(data, null, 2) + "\n");
await save("semantics/style-comparison.md", markdown);
console.log(JSON.stringify({ groups: data.groups.length, primitiveTypes: data.primitives.length, coverage: counts }));
