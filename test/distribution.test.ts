import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const script = "../scripts/check-skill-distribution.mjs";
const { checkSkillDistribution, validateSkillArchiveEntries, CONSUMER_SKILL_FILES } = await import(script);
const exec = promisify(execFile);

test("release source archive includes the API skill and excludes maintainer skills", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "kanbalone-archive-test-"));
  try {
    const files = [...CONSUMER_SKILL_FILES, "dev/skills/kanbalone-ticket-flow/SKILL.md", "dev/skills/README.md"];
    for (const file of files) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), "fixture\n");
    }
    await writeFile(path.join(directory, ".gitattributes"), "dev/skills export-ignore\n");
    await exec("git", ["init", "--quiet", directory]);
    await exec("git", ["add", "."], { cwd: directory });
    await exec("git", ["-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: directory });
    assert.equal((await checkSkillDistribution("HEAD", directory)).files, 4);
    // Check real git archive semantics, not merely directory naming.
    await writeFile(path.join(directory, ".gitattributes"), "");
    await exec("git", ["add", "."], { cwd: directory });
    await exec("git", ["-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "commit", "--quiet", "-m", "regression"], { cwd: directory });
    await assert.rejects(checkSkillDistribution("HEAD", directory), /Unexpected skill|Development/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("distribution refuses missing helper, nested skills, and unapproved payload files", () => {
  assert.throws(() => validateSkillArchiveEntries(CONSUMER_SKILL_FILES.slice(0, 3)), /Missing consumer/);
  assert.throws(() => validateSkillArchiveEntries([...CONSUMER_SKILL_FILES, "docs/internal/SKILL.md"]), /Unexpected skill/);
  assert.throws(() => validateSkillArchiveEntries([...CONSUMER_SKILL_FILES, "skills/kanbalone-api/private-token.txt"]), /Unapproved/);
});

test("archive ref rejects option and shell syntax before invoking git", async () => {
  for (const ref of ["--remote=x", "main;touch /tmp/unwanted", "main", "abc"]) {
    await assert.rejects(checkSkillDistribution(ref), /full commit SHA/);
  }
});
