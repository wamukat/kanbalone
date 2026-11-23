# Per-ticket UI/UX evidence — 2026-11-21

Open `index.html` for the 12 comparisons. `manifest.json` records versions, image hashes, capture times, fixture conditions, and persisted-state checks. PNGs are original captures.

Ticket image embeds use a loopback-only local evidence server (not an upload/attachment API):

```sh
python3 -m http.server 3472 --bind 127.0.0.1 --directory docs/development/evidence/2026-11-21
```

The images are also stored in this repository, so restarting this server restores the ticket embeds. They are not publicly accessible. Another computer needs its own copy/server or updated image URLs.

Reproduction: export tag v0.11.0 to a separate directory, link compatible node_modules, and start it with an isolated KANBALONE_DB_FILE on port3473; start the working tree with a different isolated database on3474. Run `seed-fixtures.py` only against empty disposable databases. Use 1280×844 light browser sessions (650×844 for the narrow layout case), no saved sidebar preference, and the steps in manifest.json. The duplicate remote import case uses `remote-fixture.mjs <source root> <fixture DB> <port>` on3475/3476; its duplicate response is intentionally synthetic. Do not use these scripts on user boards.

The screenshots prove visible differences. Persistence and failure/timing claims also require recorded API checks or regression tests. Group removal comparison confirms unchanged parent/child confirmation; it does not claim fewer actions.
