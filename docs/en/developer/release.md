# Release guide

Prepare and publish releases from GitHub Actions. Run both workflows from `main`; pushing a tag does not publish a release.

## Team operating rules

### Branches and merging

- Keep `main` releasable. Do not maintain a long-lived `develop` branch or permanent release branches.
- Start a short-lived `codex/<ticket>-<topic>` branch from current `main` and open a PR with one purpose. Documentation and CI changes follow the same process.
- Merging requires passing **Required checks** and user acceptance in chat. GitHub approval counts are not required; the agent checks review findings, CI results and the accepted diff, then performs the merge. If the content changes after acceptance, explain the changes and obtain acceptance again. AI review alone does not constitute user acceptance. Update against current main, normally squash merge, and delete the work branch after merging.
- Do not use administrator bypass for routine work. For an incident requiring an exception, the repository owner records the reason, verification results and follow-up PR. Do not skip acceptance in chat or routinely push directly to main.
- Use the Actions-created `codex/release-VERSION` branch for release preparation. Hold unrelated main merges from preparation until the target SHA is fixed, then resume normal development.
- Hotfixes also use a short-lived branch from main, a PR and a patch release. Resolve unreleasable changes on main first. Supporting an older release independently requires a separate decision; the current workflow only publishes SHAs contained in main.

### Responsibilities and verification timing

| When | Owner | Required work and record |
| --- | --- | --- |
| Before opening an implementation PR | Author | Run relevant local tests and exercise the changed behavior. Record steps, results and limitations. For UI changes, check affected Japanese and English screens, consistency with existing screens, and before/after images. |
| Before merging an implementation PR | User accepts; agent verifies and operates | Review the diff, CI results and manual verification record. E2E success alone does not establish visual or interaction quality. |
| Release preparation PR | Release owner and reviewer | Review changes since the previous published version; complete the version, bilingual notes and migration guide. Record the full merged SHA. |
| After dry-run, before publication | Release owner | Run the candidate image artifact locally in isolation and verify principal changes and basic operations. Record the SHA, dry-run URL, candidate artifact ID, image IDs and results in the preparation PR, then decide whether to publish that artifact. |
| After publication | Release owner | Check tags, bilingual notes and published image. Run the published version in isolation and check its version and basic operations. Add the Release URL to the preparation PR. |

Implementation testing does not replace release-candidate verification. For the local pre-publication check, use the verified loading procedure below and run `localImageId` from `loaded-image.json`, using a dedicated port and volume. Do not overwrite an existing runtime.

For changes affecting the database, storage format or upgrade procedure, prepare test data with the previous published version, back it up, upgrade to the candidate, compare its contents and verify restoration from the backup before publishing. For UI/API-only changes, record why this does not apply. Use only consistent copies of real user data, and keep personal information out of screenshots and logs.

Publication uses the exact image from the locally verified dry-run artifact. A change to the version or SHA requires a new dry-run. For any replacement artifact, repeat local verification and confirm approval before publication. After publication, check that the public tags resolve to the verified image.

### Release notes and publication decisions

- Describe user-visible changes and compatibility/migration effects in implementation PRs. Finish both languages in `docs/releases/vVERSION.md` in the preparation PR and review them before merging. Do not wait until after publication to write notes.
- Cover changes, breaking behavior, migration steps and known limitations concisely; explicitly state when an item does not apply. Publication uses this file.
- The release owner selects the scope and version. From v1 onward, use patch for compatible fixes, minor for compatible features and major for incompatible changes. Clearly document incompatibilities before v1 as well; validate the first v1 and substantial migrations with an RC first.
- Once review, dry-run, local checks and publication approval are complete, the release owner runs `publish=true` with the approved candidate artifact ID. The publication workflow creates the tag.
- CI does not automatically verify local-check records or the human publication decision. The owner checks the preparation PR record before dispatching. GitHub workflow-run approval and approval to publish the product are separate decisions.
- Updating local or user runtimes is separate from publication. Back up, update and verify those environments when an update is requested.

## Repository setup

Before the first release, a repository administrator must verify:

- The `main` branch rules require a PR and the **Required checks** status check, with zero required GitHub approvals. User acceptance in chat is an operating rule.
- Actions can create pull requests and the repository permits the workflow permissions used below.
- GHCR permits this repository to publish its package, and consumers can pull it without authentication.
- Optionally, configure repository variable `RELEASE_APP_ID` and secret `RELEASE_APP_PRIVATE_KEY` for an installed GitHub App with repository contents and pull request write permissions.

Without the App, Prepare release uses `GITHUB_TOKEN`. Approve the resulting PR workflow runs when GitHub requests it. An App token avoids this extra run approval. See [GitHub's token behavior](https://docs.github.com/en/actions/concepts/security/github_token).

Adding workflow files does not configure branch protection, package visibility or the App. Confirm these settings separately.

## 1. Prepare the release PR

1. Open **Actions → Prepare release → Run workflow**, select `main`, and enter a version without `v`, such as `1.0.0-rc.1` or `1.0.0`.
2. The workflow creates `codex/release-VERSION` and a PR updating `package.json`, OpenAPI, current installation examples and `docs/releases/vVERSION.md`.
3. Complete the Japanese and English release notes. Explain user-visible changes, breaking API changes, migration steps and known limitations. Link a migration guide when needed. Remove placeholders and the `RELEASE_NOTES_DRAFT` marker only after reviewing both languages.
4. Review the diff, wait for **Required checks**, and merge the PR. Record the full 40-character commit SHA on `main` that contains the reviewed release.

If the preparation branch already exists, update its PR rather than overwriting it. If branch creation succeeded but PR creation failed, correct the repository setting or permission and open a PR from that existing branch. Historical migration examples and evidence retain their original versions.

## 2. Validate without publishing

Open **Actions → Release → Run workflow** on `main` and enter:

| Input | Value |
| --- | --- |
| `version` | Reviewed version, without `v` |
| `sha` | Full lowercase 40-character commit SHA on `main` |
| `publish` | `false` |
| `candidate_artifact_id` | Leave empty |

The workflow validates the target, version and release notes, then runs the shared checks and Chromium E2E tests. It builds a `linux/amd64` image and tests startup, API writes and persistence after restart using an isolated temporary volume.

After the run succeeds, download the `release-image-VERSION-attempt-N` artifact. Copy its numeric artifact ID from the run summary or the `/artifacts/ID` segment of the artifact URL. Record it alongside the dry-run URL. The artifact contains the tested image and `manifest.json` with its commit SHA, image ID and archive checksum. Dry-run creates no tag, GitHub Release or GHCR image.

The image job also verifies upgrades from v0.9.35, v0.10.0 and v0.11.0, including backup restoration, on isolated fixtures before packaging the image. Review the `upgrade-restore-RUN_ATTEMPT` artifact, then complete local candidate verification and any checks specific to your deployment. See the [migration verification procedure](../migration-guide.md#automated-upgrade-verification).

### Load the artifact locally

Keep the downloaded `image.tar` and `manifest.json` together. Supply the reviewed version and full commit SHA:

```bash
RELEASE_VERSION=1.0.0-rc.1 RELEASE_SHA=reviewed-40-character-sha \
  node scripts/load-release-image.mjs release-artifact
```

The loader verifies the archive checksum, approved version/SHA, the saved manifest-to-config digest relationship and the loaded filesystem layers. On success it writes `loaded-image.json`. Start its `localImageId` using a dedicated port and volume.

The CI `imageId` and local ID can differ across Docker image stores. In the practical check, CI used a manifest digest while the local store used its config digest. Do not guess an ID or substitute an image based only on matching labels; use the verified identity relationship. Keep the original `manifest.json` unchanged and record both IDs in the preparation PR. Only a single Linux/amd64 image is supported. See [Docker's image-store documentation](https://docs.docker.com/engine/storage/containerd/) for background.

## 3. Publish

After the release owner confirms the local verification results and approval for that artifact, open **Actions → Release → Run workflow** on `main`.

| Input | Value |
| --- | --- |
| `version` | Same version as the dry-run |
| `sha` | Same full commit SHA as the dry-run |
| `publish` | `true` |
| `candidate_artifact_id` | Numeric ID of the exact artifact verified locally |

Publication checks that the artifact came from a successful `Release` dry-run attempt on `main` in this repository. It verifies the download, manifest, archive and image against the requested version and SHA. It then publishes that image without repeating the build, shared tests, Chromium E2E, or upgrade and restore tests. Artifacts from the old release workflow are ineligible. Start with a new dry-run if the candidate was built with that workflow.

Publication creates the version tag and a draft GitHub Release, pushes `vVERSION` and `VERSION` image tags, and verifies an unauthenticated pull against the tested image identity and labels. It then publishes the bilingual notes and verification records. Stable releases newer than the current latest advance `latest`; prereleases such as RCs do not.

Confirm the published release notes, version tags and public image pull. Run the published image in isolation and record the results in the preparation PR. Archived check logs, test reports and release artifacts are retained for 30 days. The publication record identifies the source run and artifact and includes the registry digest, which is separate from the local Docker image ID.

## Failure and retry

- A failed source or integrity check stops publication. Check the recorded version, SHA and artifact ID. If the artifact has expired, was deleted or is ineligible, start a new dry-run and repeat local verification and approval only if the version has no Git tag, GitHub Release or registry tags. The publication run does not select a replacement or rebuild the image.
- Publication records the candidate artifact ID and checksums in the annotated Git tag when it creates the tag. After a partial failure, rerun the failed jobs or dispatch with the same version, SHA and artifact ID. Keep that ID even if a dry-run retry produced another artifact.
- Publication stops if an existing tag lacks the candidate record, as with tags created by the old workflow, or if an existing tag, Release or image conflicts with the candidate. If the original artifact becomes unavailable after a tag or draft Release was created or an image was pushed, stop and investigate. If it cannot be recovered, preserve the existing tag, Release and images and prepare a new version.
- Published-version defects require a new patch release. The workflow does not roll back users' databases or update their running containers.

## What CI checks

`ci.yml` runs for all PRs and pushes to `main`, without path filters. `verify.yml` performs frozen installation, `pnpm check` and Chromium E2E. CI also builds and smoke-tests Docker; **Required checks** fails if a prerequisite fails, is cancelled or is skipped.

The source archive check permits only the consumer skill `skills/kanbalone-api`. Development skills in `dev/skills` must not enter the archive; Docker excludes skills entirely. `pages.yml` publishes the documentation site separately from product releases.

See the [CI implementation and remaining rollout checks](../../ja/developer/release-ci-plan.md).
