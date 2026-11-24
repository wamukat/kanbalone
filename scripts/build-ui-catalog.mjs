import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "docs/development/ui-component-catalog");
const output = path.join(root, "dist/ui-catalog");
const escape = value => String(value).replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const htmlPath = file => file.replace(/(^|\/)README\.md$/, "$1index.html").replace(/\.md$/, ".html");

async function filesIn(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

const files = await filesIn(source);
const extraPages = new Map([
  ["current-contracts.md", path.join(root, "docs/development/ui-component-contracts.md")],
  ["current-adoption.md", path.join(root, "docs/development/ui-component-adoption.md")],
]);
const pageFiles = [...files.filter(file => file.endsWith(".md")), ...extraPages.keys()];
const targetBySource = new Map(pageFiles.map(file => [extraPages.get(file) ?? path.join(source, file), htmlPath(file)]));
const screens = [];
for (const file of files.filter(file => /^screens\/[^/]+\.json$/.test(file) && !file.endsWith("/rules.json"))) {
  const data = JSON.parse(await readFile(path.join(source, file), "utf8"));
  screens.push({ name: data.title, file: htmlPath(file.replace(/\.json$/, ".md")) });
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

for (const file of pageFiles) {
  const sourceFile = extraPages.get(file) ?? path.join(source, file);
  const markdown = await readFile(sourceFile, "utf8");
  const title = markdown.match(/^# (.+)$/m)?.[1] ?? file;
  const target = htmlPath(file);
  const relative = destination => path.posix.relative(path.posix.dirname(target), destination) || "index.html";
  const body = marked.parse(markdown).replace(/href="([^"?#]+\.md)([?#][^"]*)?"/g,
    (all, href, suffix = "") => {
      if (/^[a-z][a-z\d+.-]*:/i.test(href)) return all;
      const resolved = path.resolve(path.dirname(sourceFile), href);
      const destination = targetBySource.get(resolved);
      const repositoryPath = path.relative(root, resolved).split(path.sep).join("/");
      const outsideCatalog = !resolved.startsWith(`${source}${path.sep}`) && !repositoryPath.startsWith("../");
      const fallback = outsideCatalog ? `https://github.com/wamukat/kanbalone/blob/main/${repositoryPath}` : htmlPath(href);
      return `href="${destination ? relative(destination) : fallback}${suffix}"`;
    });
  const navigation = screens.map(screen => `<li><a ${screen.file === target ? 'aria-current="page"' : ""} href="${escape(relative(screen.file))}">${escape(screen.name)}</a></li>`).join("");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — Kanbalone UIカタログ</title><link rel="stylesheet" href="${escape(relative("catalog.css"))}"></head>
<body><aside><a class="catalog-home" href="${escape(relative("index.html"))}">UI部品カタログ</a><a href="${escape(relative("current-contracts.html"))}">現行の部品契約</a><label for="catalog-filter">画面を探す</label><input id="catalog-filter" type="search" autocomplete="off"><nav aria-label="画面別一覧"><ul>${navigation}</ul><p id="catalog-no-results" role="status" hidden>該当する画面がありません。</p></nav><a href="${escape(relative("style-source.html"))}">基礎スタイル</a><a href="${escape(relative("evidence/index.html"))}">観測範囲・原画像</a></aside><main>${body}</main><script src="${escape(relative("catalog.js"))}"></script></body></html>`;
  await mkdir(path.dirname(path.join(output, target)), { recursive: true });
  await writeFile(path.join(output, target), html);
}

await writeFile(path.join(output, "catalog.css"), `
:root{font-family:system-ui,sans-serif;color:#202b26;background:#f7f8f7;font-size:14px;line-height:1.6}
*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:250px minmax(0,1fr)}
a{color:#176b59;text-underline-offset:3px}a:focus-visible,input:focus-visible{outline:3px solid #43a68b;outline-offset:3px}
aside{position:sticky;top:0;height:100vh;overflow:auto;background:white;border-right:1px solid #dce2de;padding:20px;display:flex;flex-direction:column;gap:12px}
.catalog-home{font-size:18px;font-weight:700}aside label{font-size:12px}aside input{width:100%;padding:8px;border:1px solid #bcc8c1;border-radius:6px;font:inherit}
nav ul{list-style:none;padding:0;margin:0}nav a{display:block;padding:6px 4px}nav [aria-current]{font-weight:700;background:#e3f0eb}
main{padding:28px;min-width:0}h1{font-size:26px;line-height:1.3}h2{font-size:21px;margin-top:36px}h3{font-size:17px;margin-top:30px}
p,li{overflow-wrap:anywhere}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;background:white;font-size:13px;margin:20px 0}
th,td{border:1px solid #dce2de;padding:9px 12px;text-align:left;vertical-align:top;min-width:110px;max-width:560px;overflow-wrap:anywhere}th{background:#edf2ef}
code{font-family:ui-monospace,monospace;font-size:.92em;background:#edf2ef;padding:1px 3px;white-space:normal;overflow-wrap:anywhere}pre{padding:16px;background:#edf2ef;overflow:auto}pre code{white-space:pre;padding:0}
img{max-width:100%;height:auto;border:1px solid #dce2de}blockquote{border-left:3px solid #bcc8c1;margin-left:0;padding-left:16px;color:#4d5e54}
@media(max-width:850px){body{grid-template-columns:1fr}aside{position:static;height:auto;border-right:0;border-bottom:1px solid #dce2de}nav ul{columns:2}main{padding:18px}}
`);
await writeFile(path.join(output, "catalog.js"), `const field=document.querySelector('#catalog-filter');field.addEventListener('input',()=>{const q=field.value.trim().toLocaleLowerCase();let count=0;for(const item of document.querySelectorAll('nav li')){item.hidden=!item.textContent.toLocaleLowerCase().includes(q);if(!item.hidden)count++;}document.querySelector('#catalog-no-results').hidden=count!==0;});\n`);
console.log(`Built ${pageFiles.length} catalog pages in dist/ui-catalog`);
