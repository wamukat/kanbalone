import { cp, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = path.join(import.meta.dirname, "..");
const source = path.join(root, "public");
const output = path.join(root, "dist", "public");
const sourceIndex = path.join(source, "index.html");
const entryPoints = ["app.js", "styles.css"];
const { metafile } = await build({
  absWorkingDir: source,
  assetNames: "[name]-[hash]",
  bundle: true,
  charset: "utf8",
  entryNames: "[name]-[hash]",
  entryPoints,
  format: "esm",
  loader: { ".png": "file", ".svg": "file", ".woff2": "file" },
  metafile: true,
  outdir: path.join(output, "generated"),
  plugins: [{
    name: "public-css-urls",
    setup({ onResolve }) {
      onResolve({ filter: /^\// }, ({ kind, path: url }) =>
        kind === "url-token" || kind === "import-rule" ? { path: url, external: true } : undefined
      );
    },
  }],
  target: "es2022",
});

const entryFiles = new Map(Object.entries(metafile.outputs).map(([file, value]) => [value.entryPoint, file]));
let html = await readFile(sourceIndex, "utf8");
for (const entry of entryPoints) {
  const filename = entryFiles.get(entry);
  const original = `="/${entry}"`;
  if (!filename || html.split(original).length !== 2) {
    throw new Error(`Could not find the generated file and one HTML reference for ${entry}`);
  }
  const url = path.relative(output, path.resolve(source, filename)).split(path.sep).join("/");
  html = html.replace(original, `="/${url}"`);
}

await cp(source, output, { recursive: true, filter: (file) => file !== sourceIndex });
const nextIndex = path.join(output, `.index-${process.pid}.html`);
await writeFile(nextIndex, html);
await rename(nextIndex, path.join(output, "index.html"));
