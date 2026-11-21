import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { notesPath, parseVersion } from "./release-common.mjs";

export function prepareRelease(version, root = process.cwd()) {
  parseVersion(version);
  const pkgFile = path.join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  const previous = pkg.version;
  parseVersion(previous);
  const notesFile = notesPath(version, root);
  if (existsSync(notesFile)) throw new Error("Release notes already exist; edit the existing preparation branch instead of overwriting them");
  const edits = new Map();
  pkg.version = version;
  edits.set(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const specFile = path.join(root, "docs/openapi.yaml");
  const spec = readFileSync(specFile, "utf8");
  const versionLine = /^(  version: )["']?[^\s"']+["']?$/m;
  if (!versionLine.test(spec)) throw new Error("Cannot locate OpenAPI info.version");
  edits.set(specFile, spec.replace(versionLine, `$1${version}`));
  for (const file of ["README.md", "README.ja.md", "docs/en/user-guide.md", "docs/ja/user-guide.md"]) {
    const full = path.join(root, file);
    // Only current installation examples; migration history and evidence are intentionally untouched.
    const text = readFileSync(full, "utf8").replaceAll(`ghcr.io/wamukat/kanbalone:v${previous}`, `ghcr.io/wamukat/kanbalone:v${version}`)
      .replaceAll(`refs/tags/v${previous}.tar.gz`, `refs/tags/v${version}.tar.gz`)
      .replaceAll(`kanbalone-${previous}/skills/kanbalone-api`, `kanbalone-${version}/skills/kanbalone-api`);
    edits.set(full, text);
  }
  for (const [file, text] of edits) writeFileSync(file, text);
  mkdirSync(path.dirname(notesFile), { recursive: true });
  writeFileSync(notesFile, `# v${version}\n\n<!-- RELEASE_NOTES_DRAFT: remove only after reviewing both language sections. -->\n\n## 日本語\n\n### 変更点\n\n[[利用者にとっての変更内容を記載]]\n\n### 更新時の注意\n\n[[破壊的変更・移行手順・既知の制約、または該当なしと記載]]\n\n## English\n\n### Changes\n\n[[Describe the user-visible changes]]\n\n### Upgrade notes\n\n[[Describe breaking changes, migration and known limitations, or state none]]\n`);
  return { previous, version, files: [...edits.keys(), notesFile].map(file => path.relative(root, file)) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(prepareRelease(process.argv[2] ?? process.env.RELEASE_VERSION), null, 2));
}
