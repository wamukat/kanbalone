import { readFile } from "node:fs/promises";
import path from "node:path";
import { ident, parse, walk } from "css-tree";
import { build } from "esbuild";

// The toolbar measures its height at runtime in public/app-filters.js.
const runtimeTokens = new Set(["--shared-toolbar-height"]);

async function readStylesheets(entry) {
  const directory = path.dirname(path.resolve(entry));
  const { metafile } = await build({
    absWorkingDir: directory,
    entryPoints: [path.basename(entry)],
    outdir: "out",
    bundle: true,
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [{
      name: "ignore-non-stylesheet-assets",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (args.kind === "url-token") return { path: args.path, external: true };
        });
      },
    }],
  });
  return Promise.all(Object.keys(metafile.inputs).sort().map(async input => {
    const file = path.resolve(directory, input);
    return parse(await readFile(file, "utf8"), {
      filename: path.relative(process.cwd(), file),
      positions: true,
      parseCustomProperty: true,
    });
  }));
}

async function findMissingTokens(entry) {
  const definitions = new Set(runtimeTokens);
  const values = [];
  for (const sheet of await readStylesheets(entry)) {
    walk(sheet, node => {
      if (node.type === "Atrule" && ident.decode(node.name).toLowerCase() === "property") {
        const name = node.prelude?.children?.first;
        if (name?.type === "Identifier") definitions.add(ident.decode(name.name));
      }
      if (node.type === "Declaration") {
        const property = ident.decode(node.property);
        if (property.startsWith("--")) definitions.add(property);
        values.push(node.value);
        return walk.skip;
      }
    });
  }

  const missing = [];
  for (const value of values) {
    walk(value, node => {
      if (node.type !== "Function" || ident.decode(node.name).toLowerCase() !== "var") return;
      const first = node.children.first;
      if (first?.type !== "Identifier") return;
      const name = ident.decode(first.name);
      if (definitions.has(name)) return walk.skip;
      // With a fallback, walk its expressions to check any nested var().
      if (node.children.size === 1) {
        missing.push(`${node.loc.source}:${node.loc.start.line}: undefined CSS token ${name}`);
      }
    });
  }
  return missing;
}

const missing = await findMissingTokens(process.argv[2] ?? "public/styles.css");
if (missing.length) {
  console.error(missing.join("\n"));
  process.exitCode = 1;
}
