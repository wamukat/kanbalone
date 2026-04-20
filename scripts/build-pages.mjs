import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "dist/pages");
const ASSET_DIR = path.join(OUT_DIR, "assets");
const BASE_PATH = (process.env.SOLOBOARD_PAGES_BASE_PATH ?? "").replace(/\/$/, "");
const SITE_ORIGIN = "https://wamukat.github.io";
const SITE_BASE_URL = `${SITE_ORIGIN}${BASE_PATH}`;

const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

const pages = [
  {
    lang: "ja",
    title: "Kanbalone ユーザーガイド",
    description: "Kanbalone の初回起動、ボード作成、チケット作成、整理方法を順番に説明します。",
    source: "docs/ja/user-guide.md",
    output: "ja/user-guide/index.html",
    path: "/ja/user-guide/",
    section: "user-guide",
    switchLabel: "English",
    switchHref: `${BASE_PATH}/en/user-guide/`,
  },
  {
    lang: "en",
    title: "Kanbalone User Guide",
    description: "Learn Kanbalone from first launch through board setup, ticket creation, and cleanup.",
    source: "docs/en/user-guide.md",
    output: "en/user-guide/index.html",
    path: "/en/user-guide/",
    section: "user-guide",
    switchLabel: "日本語",
    switchHref: `${BASE_PATH}/ja/user-guide/`,
  },
  {
    lang: "ja",
    title: "Kanbalone API ガイド",
    description: "Kanbalone のローカル JSON API、チケット操作、検索、SSE、OpenAPI 仕様を説明します。",
    source: "docs/ja/ai-api-guide.md",
    output: "ja/api/index.html",
    path: "/ja/api/",
    section: "api",
    switchLabel: "English",
    switchHref: `${BASE_PATH}/en/api/`,
  },
  {
    lang: "ja",
    title: "Kanbalone API 例",
    description: "curl で Kanbalone API を操作するための実例集です。",
    source: "docs/ja/api-examples.md",
    output: "ja/api-examples/index.html",
    path: "/ja/api-examples/",
    section: "api",
    switchLabel: "English",
    switchHref: `${BASE_PATH}/en/api-examples/`,
  },
  {
    lang: "ja",
    title: "Kanbalone データモデルと概念",
    description: "Kanbalone の Board、Lane、Ticket、Relation、Archive の考え方を説明します。",
    source: "docs/ja/concepts.md",
    output: "ja/concepts/index.html",
    path: "/ja/concepts/",
    section: "api",
    switchLabel: "English",
    switchHref: `${BASE_PATH}/en/concepts/`,
  },
  {
    lang: "en",
    title: "Kanbalone API Guide",
    description: "Learn the Kanbalone local JSON API for ticket operations, search, SSE, and OpenAPI usage.",
    source: "docs/en/ai-api-guide.md",
    output: "en/api/index.html",
    path: "/en/api/",
    section: "api",
    switchLabel: "日本語",
    switchHref: `${BASE_PATH}/ja/api/`,
  },
  {
    lang: "en",
    title: "Kanbalone API Examples",
    description: "Practical curl examples for using the Kanbalone API.",
    source: "docs/en/api-examples.md",
    output: "en/api-examples/index.html",
    path: "/en/api-examples/",
    section: "api",
    switchLabel: "日本語",
    switchHref: `${BASE_PATH}/ja/api-examples/`,
  },
  {
    lang: "en",
    title: "Kanbalone Data Model And Concepts",
    description: "Learn the Kanbalone Board, Lane, Ticket, Relation, and Archive model.",
    source: "docs/en/concepts.md",
    output: "en/concepts/index.html",
    path: "/en/concepts/",
    section: "api",
    switchLabel: "日本語",
    switchHref: `${BASE_PATH}/ja/concepts/`,
  },
];

function rewriteAssetLinks(markdown) {
  return markdown.replaceAll("../assets/", `${BASE_PATH}/assets/`);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navLink(href, label, active) {
  return `<a${active ? ' class="active"' : ""} href="${href}">${label}</a>`;
}

function renderPage({ lang, title, description, body, switchLabel, switchHref, path: pagePath, section }) {
  const pageUrl = `${SITE_BASE_URL}${pagePath}`;
  const imageUrl = `${SITE_BASE_URL}/assets/app-icon-512.png`;
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="#1f6f5f" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Kanbalone" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <title>${title}</title>
    <link rel="canonical" href="${pageUrl}" />
    <link rel="icon" href="${BASE_PATH}/assets/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${BASE_PATH}/assets/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="${BASE_PATH}/assets/apple-touch-icon.png" />
    <link rel="stylesheet" href="${BASE_PATH}/assets/pages.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${BASE_PATH}/">
        <img src="${BASE_PATH}/assets/app-icon.svg" alt="" width="40" height="40" />
        <span>Kanbalone</span>
      </a>
      <nav>
        ${navLink(`${BASE_PATH}/${lang}/user-guide/`, lang === "ja" ? "ユーザーガイド" : "User Guide", section === "user-guide")}
        ${navLink(`${BASE_PATH}/${lang}/api/`, "API", section === "api")}
        <a href="${switchHref}">${switchLabel}</a>
        <a href="https://github.com/wamukat/kanbalone">GitHub</a>
      </nav>
    </header>
    <main class="content">
      <div class="guide-hero">
        <img src="${BASE_PATH}/assets/app-icon.svg" alt="" width="96" height="96" />
      </div>
      ${body}
    </main>
    <footer class="site-footer">
      <a href="https://github.com/wamukat/kanbalone">Kanbalone (v${packageJson.version})</a>
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

.site-header nav a.active {
  color: var(--accent);
  font-weight: 700;
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

function buildApiIntro(page) {
  const openApiHref = `${BASE_PATH}/openapi.yaml`;
  const examplesHref = `${BASE_PATH}/${page.lang}/api-examples/`;
  const conceptHref = `${BASE_PATH}/${page.lang}/concepts/`;
  if (page.lang === "ja") {
    return [
      "このページは、Kanbalone の JSON API をブラウザで参照できるようにした公開解説です。",
      "",
      `- [OpenAPI YAML](${openApiHref})`,
      `- [API 例](${examplesHref})`,
      `- [データモデルと概念](${conceptHref})`,
      "",
    ].join("\n");
  }
  return [
    "This page is the public browser-readable guide for the Kanbalone JSON API.",
    "",
    `- [OpenAPI YAML](${openApiHref})`,
    `- [API examples](${examplesHref})`,
    `- [Data model and concepts](${conceptHref})`,
    "",
  ].join("\n");
}

async function readPageMarkdown(page) {
  const markdown = rewriteAssetLinks(await readFile(path.join(ROOT, page.source), "utf8"));
  return page.section === "api" ? `${buildApiIntro(page)}${markdown}` : markdown;
}

async function writePage(page) {
  const markdown = await readPageMarkdown(page);
  const body = marked.parse(markdown);
  const outputPath = path.join(OUT_DIR, page.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderPage({ ...page, body }), "utf8");
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(ASSET_DIR, { recursive: true });
await cp(path.join(ROOT, "docs/assets"), ASSET_DIR, { recursive: true });
await cp(path.join(ROOT, "public/app-icon.svg"), path.join(ASSET_DIR, "app-icon.svg"));
await cp(path.join(ROOT, "public/app-icon-512.png"), path.join(ASSET_DIR, "app-icon-512.png"));
await cp(path.join(ROOT, "public/favicon.svg"), path.join(ASSET_DIR, "favicon.svg"));
await cp(path.join(ROOT, "public/favicon-32.png"), path.join(ASSET_DIR, "favicon-32.png"));
await cp(path.join(ROOT, "public/apple-touch-icon.png"), path.join(ASSET_DIR, "apple-touch-icon.png"));
await cp(path.join(ROOT, "docs/openapi.yaml"), path.join(OUT_DIR, "openapi.yaml"));
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
    <meta name="description" content="Kanbalone user guide and API guide." />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Kanbalone" />
    <meta property="og:title" content="Kanbalone Guides" />
    <meta property="og:description" content="Kanbalone user guide and API guide." />
    <meta property="og:url" content="${SITE_BASE_URL}/" />
    <meta property="og:image" content="${SITE_BASE_URL}/assets/app-icon-512.png" />
    <meta name="twitter:card" content="summary" />
    <meta http-equiv="refresh" content="0; url=${BASE_PATH}/ja/user-guide/" />
    <title>Kanbalone Guides</title>
    <link rel="canonical" href="${SITE_BASE_URL}/" />
    <link rel="icon" href="${BASE_PATH}/assets/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <p><a href="${BASE_PATH}/ja/user-guide/">Kanbalone ユーザーガイド</a></p>
    <p><a href="${BASE_PATH}/ja/api/">Kanbalone API ガイド</a></p>
    <p><a href="${BASE_PATH}/en/user-guide/">Kanbalone User Guide</a></p>
    <p><a href="${BASE_PATH}/en/api/">Kanbalone API Guide</a></p>
  </body>
</html>
`,
  "utf8",
);
