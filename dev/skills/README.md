# Project-maintenance skills

These skills are for contributors working on the Kanbalone repository. They are not application features or instructions for people using a deployed Kanbalone instance.

- `kanbalone-ticket-flow`: repository-specific implementation, tracking and release workflow. Its maintainer paths and board IDs must be adapted before use in another development environment.
- Consumer skills belong in the root `skills/` directory. Currently only `skills/kanbalone-api` is distributed to users.

`.gitattributes` excludes this directory from source archives. `.dockerignore` excludes development tools and all host-side skills from the Docker build context; the runtime Dockerfile also copies only application artifacts. To obtain development skills, use a repository checkout rather than the consumer release archive.

When adding a skill, choose its audience explicitly. Do not copy this directory into release assets or the public documentation site. Verify archive contents before release; `.gitattributes` does not filter Git clones or archives produced by arbitrary file-copy scripts.
