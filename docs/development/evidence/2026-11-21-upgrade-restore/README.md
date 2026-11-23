# Upgrade, backup and restoration verification

[PR #20](https://github.com/wamukat/kanbalone/pull/20)

## Candidate and environment

- Date: 2026-11-21.
- Candidate application: unreleased main `c6a5aafe44c5dcb559ac79fdd73805877c5efbc8` (package version still `0.11.0`, **not** the published v0.11.0 image).
- Candidate image: `sha256:e02da13cb31401f07abc737609b92d72e9a52d94a5e5283a730b60a7838288cd`.
- Docker: Rancher Desktop, Linux/amd64 images; Node 26.13.1 test runner.
- Fixture: two synthetic boards; completed/open/archived tickets, parent/child links, blockers/related tickets, tags and their reasons, comments, events, remote provenance and PR references. v0.11.0 also has populated/empty Groups.
- No existing user DB was mounted. The running Kanbalone image and data were not upgraded.

## Reproduction

Build the candidate at the recorded SHA with version/revision labels, as described in the [migration guide](../../../en/migration-guide.md#automated-upgrade-verification), then run:

```bash
RELEASE_VERSION=0.11.0 \
RELEASE_SHA=c6a5aafe44c5dcb559ac79fdd73805877c5efbc8 \
node scripts/verify-upgrade-restore.mjs kanbalone:upgrade-check
```

1. Seed each published source image through its API. Add synthetic remote-sync records while stopped, without credentials or provider requests.
2. Stop all writers, leaving committed WAL data. Copy DB/WAL/SHM together, record hashes and check backup integrity.
3. For v0.9.35, inject a migration failure. Confirm exact schema/data rollback, then remove the injected trigger.
4. Start the candidate. Compare every old stored field, allowing only documented completion migration changes; check API reads and database integrity.
5. Restart and compare exact snapshots to detect migration reapplication.
6. Write after upgrading and confirm persistence after stopping.
7. Preserve the upgraded DB separately; restore the original DB/WAL/SHM set and restart the original image. Require exact baseline equality and absence of the post-backup write.
8. Remove only the run's temporary containers/storage.

## Evidence

`report.json` records each source image ID/digest, backup file sizes/hashes, checks and cleanup results. `snapshot-summary.json` records row counts and hashes of the full before/after/restored snapshots. Full synthetic snapshots and injected-failure logs are available locally in `coverage/upgrade-restore/` and are retained by CI as artifacts for 30 days.

Observed: all six cases passed, including cleanup. Unit/API tests: 164 passed; TypeScript build and documentation generation passed.

The matrix is three source releases × Docker volume/bind mount. Expected migration differences are new completion lanes and movement/order/update timestamps/activity for legacy completed tickets, plus empty Group storage for pre-Group releases. All other old values must remain intact; restored snapshots must exactly equal the originals.

## Limits and follow-up

- These are representative Linux/amd64 Docker paths, not a guarantee for all earlier releases or deployment configurations.
- Volume uses the default image user; bind mount uses the host UID/GID because this host rejects `chown` on shared mounts.
- Failure injection covers the completion migration transaction, not disk exhaustion or every migration statement.
- Provider state is synthetic. Authentication, actual remote synchronization, live copying and native/ARM installations are outside this test.
- Local candidate acceptance and the first Release workflow dry run were separate from the upgrade and restoration tests. This task does not publish a release.
- No UI changes: data snapshots, image digests and logs are the evidence, rather than screenshots.
