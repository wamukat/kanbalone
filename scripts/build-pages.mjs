import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "dist/pages");
const ASSET_DIR = path.join(OUT_DIR, "assets");
const BASE_PATH = (process.env.SOLOBOARD_PAGES_BASE_PATH ?? "").replace(/\/$/, "");

const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

const pages = [
  {
    lang: "ja",
    title: "SoloBoard ユーザーガイド",
    source: "docs/ja/user-guide.md",
    output: "ja/user-guide/index.html",
    switchLabel: "English",
    switchHref: `${BASE_PATH}/en/user-guide/`,
  },
  {
    lang: "en",
    title: "SoloBoard User Guide",
    source: "docs/en/user-guide.md",
    output: "en/user-guide/index.html",
    switchLabel: "日本語",
    switchHref: `${BASE_PATH}/ja/user-guide/`,
  },
];

function rewriteAssetLinks(markdown) {
  return markdown.replaceAll("../assets/", `${BASE_PATH}/assets/`);
}

function renderPage({ lang, title, body, switchLabel, switchHref }) {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1f6f5f" />
    <title>${title}</title>
    <link rel="icon" href="${BASE_PATH}/assets/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${BASE_PATH}/assets/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="${BASE_PATH}/assets/apple-touch-icon.png" />
    <link rel="stylesheet" href="${BASE_PATH}/assets/pages.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${BASE_PATH}/">
        <img src="${BASE_PATH}/assets/app-icon.svg" alt="" width="40" height="40" />
        <span>SoloBoard</span>
      </a>
      <nav>
        <a href="${switchHref}">${switchLabel}</a>
        <a href="https://github.com/wamukat/SoloBoard">GitHub</a>
      </nav>
    </header>
    <main class="content">
      <div class="guide-hero">
        <img src="${BASE_PATH}/assets/app-icon.svg" alt="" width="96" height="96" />
      </div>
      ${body}
    </main>
    <footer class="site-footer">
      <a href="https://github.com/wamukat/SoloBoard">SoloBoard (v${packageJson.version})</a>
    </footer>
  </body>
</html>
`;
}

const css = `:root {
  --bg: #f3f2ea;
  --panel: #fffdf7;
  --text: #1c1c17;
  --muted: #686355;
  --line: #d7d1c2;
  --accent: #1f6f5f;
  font-family: "Avenir Next", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

a {
  color: var(--accent);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem max(1rem, calc((100vw - 980px) / 2));
  border-bottom: 1px solid rgba(104, 99, 85, 0.18);
  background: rgba(243, 242, 234, 0.94);
  backdrop-filter: blur(8px);
}

.brand,
.site-header nav,
.site-footer a {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--text);
  text-decoration: none;
}

.brand {
  font-weight: 700;
}

.brand img {
  border-radius: 8px;
}

.site-header nav {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.site-header nav a,
.site-footer a {
  color: var(--muted);
}

.site-header nav a:hover,
.site-footer a:hover {
  color: var(--accent);
}

.content {
  max-width: 980px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.guide-hero {
  display: flex;
  justify-content: center;
  margin: 0.4rem 0 1.2rem;
}

.guide-hero img {
  width: 6rem;
  height: 6rem;
  border: none;
  border-radius: 8px;
  box-shadow: none;
}

.content h1 {
  margin: 0 0 1rem;
  text-align: center;
  font-size: 2rem;
}

.content h2 {
  margin: 2.2rem 0 0.8rem;
  padding-top: 0.3rem;
  font-size: 1.35rem;
}

.content p,
.content li {
  line-height: 1.75;
}

.content img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.1rem auto 1.6rem;
  border: 1px solid rgba(104, 99, 85, 0.18);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(38, 35, 28, 0.08);
}

.content code {
  border-radius: 6px;
  background: rgba(31, 111, 95, 0.08);
  padding: 0.1rem 0.28rem;
}

.content pre {
  overflow-x: auto;
  padding: 1rem;
  border: 1px solid rgba(104, 99, 85, 0.16);
  border-radius: 8px;
  background: var(--panel);
}

.content pre code {
  background: transparent;
  padding: 0;
}

.site-footer {
  display: flex;
  justify-content: center;
  padding: 1.4rem 1rem 2rem;
  border-top: 1px solid rgba(104, 99, 85, 0.16);
}
`;

async function writePage(page) {
  const markdown = rewriteAssetLinks(await readFile(path.join(ROOT, page.source), "utf8"));
  const body = marked.parse(markdown);
  const outputPath = path.join(OUT_DIR, page.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderPage({ ...page, body }), "utf8");
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(ASSET_DIR, { recursive: true });
await cp(path.join(ROOT, "docs/assets"), ASSET_DIR, { recursive: true });
await cp(path.join(ROOT, "public/app-icon.svg"), path.join(ASSET_DIR, "app-icon.svg"));
await cp(path.join(ROOT, "public/favicon.svg"), path.join(ASSET_DIR, "favicon.svg"));
await cp(path.join(ROOT, "public/favicon-32.png"), path.join(ASSET_DIR, "favicon-32.png"));
await cp(path.join(ROOT, "public/apple-touch-icon.png"), path.join(ASSET_DIR, "apple-touch-icon.png"));
await writeFile(path.join(ASSET_DIR, "pages.css"), css, "utf8");

for (const page of pages) {
  await writePage(page);
}

await writeFile(
  path.join(OUT_DIR, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${BASE_PATH}/ja/user-guide/" />
    <title>SoloBoard User Guide</title>
    <link rel="canonical" href="${BASE_PATH}/ja/user-guide/" />
  </head>
  <body>
    <p><a href="${BASE_PATH}/ja/user-guide/">SoloBoard ユーザーガイド</a></p>
    <p><a href="${BASE_PATH}/en/user-guide/">SoloBoard User Guide</a></p>
  </body>
</html>
`,
  "utf8",
);
