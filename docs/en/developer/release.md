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
| After dry-run, before publication | Release owner | Run the target image artifact locally in isolation; verify principal changes and basic operations. Record the SHA, Actions URL, image ID and results in the preparation PR, then decide whether to publish. |
| After publication | Release owner | Check tags, bilingual notes and published image. Run the published version in isolation and check its version and basic operations. Add the Release URL to the preparation PR. |

Implementation testing does not replace release-candidate verification. For the local pre-publication check, load `image.tar` from the dry-run artifact and run the image ID in `manifest.json`, using a dedicated port and volume. Do not overwrite an existing runtime.

For changes affecting the database, storage format or upgrade procedure, prepare test data with the previous published version, back it up, upgrade to the candidate, compare its contents and verify restoration from the backup before publishing. For UI/API-only changes, record why this does not apply. Use only consistent copies of real user data, and keep personal information out of screenshots and logs.

If the candidate SHA changes, repeat dry-run and the relevant local checks. Dry-run and publication build separately. Publication uses its own verified image without rebuilding, but this need not be identical to the manually checked dry-run image; perform the post-publication check too.

### Release notes and publication decisions

- Describe user-visible changes and compatibility/migration effects in implementation PRs. Finish both languages in `docs/releases/vVERSION.md` in the preparation PR and review them before merging. Do not wait until after publication to write notes.
- Cover changes, breaking behavior, migration steps and known limitations concisely; explicitly state when an item does not apply. Publication uses this file.
- The release owner selects the scope and version. From v1 onward, use patch for compatible fixes, minor for compatible features and major for incompatible changes. Clearly document incompatibilities before v1 as well; validate the first v1 and substantial migrations with an RC first.
- Once review, local checks and dry-run are complete, the release owner runs `publish=true`. Merging a PR or pushing a tag does not publish the product. The publication workflow creates the tag.
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

The workflow validates the target, version and release notes, then runs the shared checks and Chromium E2E tests. It builds a `linux/amd64` image and tests startup, API writes and persistence after restart using an isolated temporary volume.

Review the run and its `release-image-VERSION` artifact. It contains the tested image and `manifest.json` with its SHA, image ID and archive checksum. Dry-run creates no tag, GitHub Release or GHCR image. It does not test existing-user upgrades or backup restoration; those remain a separate release readiness requirement.

## 3. Publish

Run **Release** again with the same version and SHA, this time setting `publish` to `true`. This run repeats validation and builds its own image. Within that run, publication uses the exact tested image artifact without rebuilding it.

Publication creates the version tag and a draft GitHub Release, pushes `vVERSION` and `VERSION` image tags, and verifies an unauthenticated pull against the tested image identity and labels. It then publishes the bilingual notes and verification records. Stable releases newer than the current latest advance `latest`; prereleases such as RCs do not.

Confirm the published release notes, version tags and public image pull. CI logs, test reports and release artifacts are retained for 30 days. The publication record includes registry digests; these are distinct from the local Docker image ID.

## Failure and retry

- A failed validation stops publication. Fix the issue and prepare a reviewed commit before retrying.
- If publication partially succeeds, rerun the failed jobs in the same Actions run to reuse its verified image artifact. Existing tags, releases and images must match; conflicting contents stop the workflow.
- Do not move published tags or overwrite a version with a newly built image. If the artifact has expired, stop and investigate; use a new patch version when the original verified artifact cannot be recovered.
- Published-version defects require a new patch release. The workflow does not roll back users' databases or update their running containers.

## What CI checks

`ci.yml` runs for all PRs and pushes to `main`, without path filters. `verify.yml` performs frozen installation, `pnpm check` and Chromium E2E. CI also builds and smoke-tests Docker; **Required checks** fails if a prerequisite fails, is cancelled or is skipped.

The source archive check permits only the consumer skill `skills/kanbalone-api`. Development skills in `dev/skills` must not enter the archive; Docker excludes skills entirely. `pages.yml` publishes the documentation site separately from product releases.

See the [CI implementation and remaining rollout checks](../../ja/developer/release-ci-plan.md).
