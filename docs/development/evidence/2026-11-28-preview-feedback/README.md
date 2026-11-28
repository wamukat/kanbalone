# Remote preview feedback — 2026-11-28

Desktop Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Synthetic Remote preview board / Todo lane in isolated temporary databases. Provider availability and delayed/error/success preview responses are simulated browser routes; no external service was contacted and no user data was changed.

Base: `cca07696876b0c18ddb8589de5c34d6ac8f20995`. Before captures serve that exact `app-editor-remote-import.js` via a test route in the candidate runtime. After uses the candidate module; its SHA-256 is recorded below. This is an isolated module comparison, not an older-release deployment.

## Sequence and result

Open New ticket → remote import → enter `https://github.com/example/repo/issues/1` → Preview, hold response. Comparable `before/after-{ja,en}-pending.png` show the original disabled Preview button and the replacement Loading... / 読み込み中… label. The existing button also exposes `aria-busy=true`; no permanent label was added.

Tests verify the busy button is disabled, changing the URL allows a distinct request, completion of the older request does not clear the newer busy state, a simulated 503 restores Preview and allows retry, and a successful retry enables Import. Closing/reopening invalidates the old request even when the same URL is reused. API inspection confirms preview-only operations created zero tickets. Existing remote-import tests cover provider availability, backlink submission, import persistence and duplicate handling.

## Validation and limits

Public JavaScript type checking and production build passed. Two locale-specific progress tests and five existing remote-import tests passed. Initial test-only issues (API envelope assertion and overlapping Playwright output paths) were corrected; only the three affected tests were rerun. Independent review is recorded in the PR.

Screenshots alone do not prove asynchronous ordering or persistence; assertions above provide that evidence. Real remote outages, human usability, screen-reader announcements and narrow/mobile layouts remain separate work. No backend/API changes; the full required CI suite runs on the PR.
