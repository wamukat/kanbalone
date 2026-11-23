# Independent implementation review of image attachments

[Implementation PR](https://github.com/wamukat/kanbalone/pull/45)

Reviewed the working tree on 2026-11-22, based on `5ff44622f74c2116147d60c11be7f86fbc2208d2`. The reviewer exercised the application and backup helper with Node 26.13.1, temporary SQLite databases, generated data and isolated Chromium sessions. Each storage probe created and removed its own directories. The [evidence index](README.md) links the source fingerprint and capture matrix.

## Findings and independent checks

| Finding | Observed before the fix | Independent check after the fix |
| --- | --- | --- |
| Unsaved comment drafts | When an upload finished, the pending indicator cleared. Closing the dialog could then discard an image-bearing new or edited comment without confirmation. | Chromium exercised the composer and inline editor, kept both drafts through a dismissal attempt, saved the comments, and verified their images after reopening. |
| Selection replacement during a delayed upload | With `cow` selected for an image drop, pasting `cowbell` into the selection before the upload completed lost the first three characters. A synthetic input-event probe reproduced the loss. | Re-ran the Chromium regression with an actual text clipboard paste and an explicitly dispatched composition sequence. The full `cowbell` remained and the image Markdown followed it after composition ended. |
| Comment dismissal during a save | Code inspection showed that a read-only pending comment escaped the dirty check. A later POST failure could lose the draft after the dialog was dismissed. | Re-ran the Chromium comment test with a delayed POST and injected HTTP 500. Escape kept the dialog open, the error appeared, the Markdown survived, and a second save succeeded. The same guard checks inline PATCH inputs. |
| Unusable restored metadata | A database with valid PNG bytes and a mistyped media type passed backup and restore, but the restored image returned HTTP 500. | Tested an unsupported MIME type and a size one byte above 10 MiB. Each invalidity stopped both a live backup and a restore before the destination was published. Recomputed the fixture database checksum for each restore so the metadata checks themselves were exercised. |

## Storage and board transfer

- Inspected the four upload formats, HTTP response handling, 10 MiB limit, SHA-256 IDs, metadata migration, verified reads, content-addressed publication and write transaction.
- Imported a board with a reference-style Markdown link to a PNG in the body and an embedded GIF in a comment. The first URL included a query and fragment. The portable manifest contained both files.
- Injected a SQLite failure on the second attachment metadata insert. The destination had zero boards and zero attachment records, and both image GETs returned 404. Two complete, unreachable files remained on disk. Removing the injected failure and retrying the same import succeeded and reused the files.
- Took a live backup of that imported database, restored it in another directory and opened a fresh app instance. The ticket and comment Markdown matched exactly. Both HTTP downloads matched their original fixture bytes.
- Reviewed board format/version handling, the browser's export path, attachment reference collection, backup staging/publication, WAL snapshot handling, container packaging and the migration instructions.

## Result

All four findings were addressed and independently rechecked. The reviewed implementation has no outstanding code blocker.

## Boundaries

The format checks inspect image containers. The probes used real PNG and GIF files and did not exercise every decoder or arbitrary image corruption. Power loss, native OS file dragging, hardware IME and human usability were outside these checks. The Chromium runs used the project's isolated test app. See the capture and visual review records for screenshot evidence.
