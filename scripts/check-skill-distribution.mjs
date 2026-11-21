import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
export const CONSUMER_SKILL_FILES = [
  "skills/kanbalone-api/SKILL.md",
  "skills/kanbalone-api/agents/openai.yaml",
  "skills/kanbalone-api/references/api.md",
  "skills/kanbalone-api/scripts/kanbalone_api.py",
];

export function validateSkillArchiveEntries(entries) {
  const files = entries.filter((entry) => !entry.endsWith("/"));
  const skills = files.filter((entry) => /(?:^|\/)SKILL\.md$/i.test(entry));
  if (skills.length !== 1 || skills[0] !== CONSUMER_SKILL_FILES[0]) {
    throw new Error(`Unexpected skill distribution: ${skills.join(", ")}`);
  }
  if (entries.some((entry) => /^(?:dev\/skills|skills\/(?!kanbalone-api(?:\/|$)))/.test(entry) && entry !== "skills/")) {
    throw new Error("Development or unapproved skills are present in the source archive");
  }
  for (const required of CONSUMER_SKILL_FILES) {
    if (!files.includes(required)) throw new Error(`Missing consumer skill file: ${required}`);
  }
  // Keep the distributed payload explicit: helpers, documentation and metadata only.
  for (const entry of files.filter((entry) => entry.startsWith("skills/"))) {
    if (!CONSUMER_SKILL_FILES.includes(entry)) throw new Error(`Unapproved consumer skill file: ${entry}`);
  }
  return { skill: "kanbalone-api", files: CONSUMER_SKILL_FILES.length };
}

export async function checkSkillDistribution(ref = "HEAD", cwd = process.cwd()) {
  if (ref !== "HEAD" && !/^[0-9a-f]{40}$/.test(ref)) throw new Error("Archive target must be HEAD or a full commit SHA");
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  const sha = stdout.trim();
  const dir = await mkdtemp(path.join(tmpdir(), "kanbalone-distribution-"));
  try {
    const archive = path.join(dir, "source.tar");
    await exec("git", ["archive", "--format=tar", `--output=${archive}`, sha], { cwd });
    const result = await exec("tar", ["-tf", archive], { maxBuffer: 16 * 1024 * 1024 });
    return { sha, ...validateSkillArchiveEntries(result.stdout.trim().split("\n")) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkSkillDistribution(process.argv[2]).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
