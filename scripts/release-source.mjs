import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256File } from "./package-release-image.mjs";
import { command, parseVersion, validateSha } from "./release-common.mjs";

const releaseWorkflow = ".github/workflows/release.yml";
const candidateFiles = ["image.tar", "manifest.json"];

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && String(id) === String(value) ? id : null;
}

function writeCommandOutput(file, args, destination) {
  const output = openSync(destination, "wx");
  try {
    execFileSync(file, args, { stdio: ["ignore", output, "pipe"] });
  } finally {
    closeSync(output);
  }
}

function getResource(run, endpoint, description) {
  try {
    return JSON.parse(run("gh", ["api", endpoint]));
  } catch (error) {
    if (/\bHTTP (404|410)\b/.test(String(error.stderr))) {
      throw new Error(`${description} is missing, expired or unavailable in this repository`, { cause: error });
    }
    throw error;
  }
}

export async function downloadCandidate(directory, {
  repository, repositoryId, version, artifactId, root = process.cwd(),
  run = command, writeOutput = writeCommandOutput,
}) {
  parseVersion(version);
  const repoId = positiveId(repositoryId);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !repoId) {
    throw new Error("The current GitHub repository and its ID are required to verify the candidate");
  }
  const id = positiveId(artifactId);
  if (!id) throw new Error("Publish requires the candidate_artifact_id from the accepted dry-run");
  const actions = `repos/${repository}/actions`;
  const artifactEndpoint = `${actions}/artifacts/${id}`;
  const artifact = getResource(run, artifactEndpoint, `Candidate artifact ${id}`);
  if (artifact.expired !== false) throw new Error(`Candidate artifact ${id} has expired`);
  const prefix = `release-image-${version}-attempt-`;
  const attempt = artifact.name?.startsWith(prefix) && positiveId(artifact.name.slice(prefix.length));
  const origin = artifact.workflow_run;
  if (!attempt) {
    throw new Error(`Select a verified dry-run artifact named ${prefix}N from the current Release workflow`);
  }
  if (artifact.id !== id || !positiveId(origin?.id) || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest ?? "")) {
    throw new Error("Verified dry-run artifact metadata lacks the expected artifact ID, run ID or archive digest");
  }
  if (origin.repository_id !== repoId || origin.head_repository_id !== repoId || origin.head_branch !== "main") {
    throw new Error("Candidate artifact must come from main in this repository");
  }
  const workflow = getResource(run, `${actions}/workflows/release.yml`, "Release workflow");
  const source = getResource(run, `${actions}/runs/${origin.id}/attempts/${attempt}`, "Candidate workflow attempt");
  if (workflow.path !== releaseWorkflow || !positiveId(workflow.id) || source.workflow_id !== workflow.id ||
      source.path !== releaseWorkflow || source.id !== origin.id || source.run_attempt !== attempt ||
      source.repository?.id !== repoId || source.head_repository?.id !== repoId ||
      source.event !== "workflow_dispatch" || source.head_branch !== "main" || source.head_sha !== origin.head_sha) {
    throw new Error("Candidate artifact must come from the Release workflow dispatched on main in this repository");
  }
  if (source.status !== "completed" || source.conclusion !== "success") {
    throw new Error("The candidate dry-run attempt must have completed successfully");
  }
  validateSha(source.head_sha);
  try {
    run("git", ["merge-base", "--is-ancestor", source.head_sha, "origin/main"], { cwd: root });
  } catch (error) {
    throw new Error("The candidate workflow revision is outside main history", { cause: error });
  }

  const temporary = mkdtempSync(path.join(os.tmpdir(), "kanbalone-release-candidate-"));
  const archive = path.join(temporary, "candidate.zip");
  try {
    try {
      writeOutput("gh", ["api", `${artifactEndpoint}/zip`], archive);
    } catch (error) {
      throw new Error(`Could not download candidate artifact ${id}; check that it is still available`, { cause: error });
    }
    if (`sha256:${await sha256File(archive)}` !== artifact.digest) {
      throw new Error("Candidate artifact ZIP digest mismatch");
    }
    const entries = run("unzip", ["-Z1", archive]).split("\n").sort();
    if (entries.length !== candidateFiles.length || candidateFiles.some((file, index) => file !== entries[index])) {
      throw new Error("Candidate artifact must contain only image.tar and manifest.json");
    }
    mkdirSync(directory);
    try {
      // Stream only the two known files to fixed paths, without extracting archive paths.
      for (const file of candidateFiles) {
        writeOutput("unzip", ["-p", archive, file], path.join(directory, file));
      }
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return {
    runId: source.id,
    runAttempt: attempt,
    workflowSha: source.head_sha,
    artifactId: id,
    artifactDigest: artifact.digest,
  };
}
