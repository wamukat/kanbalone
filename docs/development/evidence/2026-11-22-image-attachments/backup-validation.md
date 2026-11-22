# Database and image backup validation

Executed on 2026-11-22 by the backup implementation agent using synthetic data and isolated containers. The normal instance was not changed.

- Backup CLI: `node scripts/kanbalone-backup.mjs backup <db-file> <new-backup-dir>`; restore: `node scripts/kanbalone-backup.mjs restore <backup-dir> <new-data-dir>`.
- Unit tests: 16 backup tests passed. The affected run also passed 4 attachment API tests and 8 upgrade comparison tests (28 total), build, public type checking, and documentation build.
- v0.11.0 to the intermediate candidate: both named volume and bind mount cases passed. The live SQLite snapshot and PNG restored with matching Markdown and HTTP image bytes. An image added after backup remained in the original data and was absent from the restored data. Original-version rollback was also verified. See [the report](backup-upgrade-report.json).
- The intermediate report's `target.sha` is the base commit supplied as an image label, **not** the implementation revision. That image was `sha256:20f075f213240c9d8ad65f3979dea33092651a206c6354c2a090551f5207c849`.
- After shared MIME/size validation was added, the rebuilt production image was `sha256:ab9c4b1a4cde44a6b9b86c5b066aa317d1493a797b4d9d998ec2fe3cfc055b73`. The implementation agent ran the packaged CLI and Fastify inside an isolated `--rm --network none` container: live WAL snapshot → restore → identical ticket Markdown/HTML and 84-byte PNG response. Invalid MIME caused CLI exit 1 and left no destination or stage directory.
- The independent reviewer separately reproduced rejection of invalid MIME and metadata over 10 MiB in both backup and restored bundles with recalculated DB checksums. See code-review.md for independent verification.

These are development candidate checks, not release authorization or verification of a published artifact. Local Docker tests cover Linux/amd64, two mount modes, and representative fixtures; they do not establish behavior under disk exhaustion, host crashes, all filesystems, or OS clipboard interactions. No live user data was migrated.
