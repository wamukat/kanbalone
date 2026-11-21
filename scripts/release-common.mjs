import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value ?? "");
  if (!match || match[4]?.split(".").some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === "0")) {
    throw new Error("Use a version such as 1.0.0 or 1.0.0-rc.1 (without a leading v or build metadata)");
  }
  return { version: value, core: match.slice(1, 4).map(BigInt), prerelease: match[4] ?? null };
}
export function compareStableVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (a.prerelease || b.prerelease) throw new Error("latest must identify a stable version");
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  return 0;
}
export function validateSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error("RELEASE_SHA must be a complete lowercase 40-character commit SHA");
  return value;
}
export function command(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}
export function notesPath(version, root = process.cwd()) {
  parseVersion(version);
  return path.join(root, "docs/releases", `v${version}.md`);
}
export function validateNotes(text, version) {
  if (!text.includes(`# v${version}`) || !/^## 日本語\s*$/m.test(text) || !/^## English\s*$/m.test(text)) {
    throw new Error("Release notes must identify the version and contain 日本語 and English sections");
  }
  if (/RELEASE_NOTES_DRAFT|\bTODO\b|\bTBD\b|\[\[.+?\]\]/.test(text)) throw new Error("Review and complete the release-note draft before releasing");
  for (const heading of ["日本語", "English"]) {
    const section = text.split(`## ${heading}`)[1]?.split(/^## /m)[0]?.trim();
    if (!section || section.length < 30) throw new Error(`Release notes section ${heading} is empty or incomplete`);
  }
  return text;
}
export function verifyRelease({ version, sha, root = process.cwd(), run = command, mainRef = "origin/main" }) {
  parseVersion(version); validateSha(sha);
  const git = args => run("git", args, { cwd: root });
  if (git(["rev-parse", "HEAD"]) !== sha) throw new Error("Checkout does not match RELEASE_SHA");
  git(["merge-base", "--is-ancestor", sha, mainRef]);
  if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("Release checkout has modified tracked files");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const openapi = readFileSync(path.join(root, "docs/openapi.yaml"), "utf8");
  const apiVersion = /^info:\s*\n(?:(?:[ \t]+[^\n]*|\s*)\n)*?[ \t]+version:[ \t]*["']?([^\s"']+)/m.exec(openapi)?.[1];
  if (pkg.version !== version || apiVersion !== version) throw new Error("Release input, package.json and OpenAPI versions must match");
  const notes = validateNotes(readFileSync(notesPath(version, root), "utf8"), version);
  return { version, sha, prerelease: Boolean(parseVersion(version).prerelease), notes };
}
