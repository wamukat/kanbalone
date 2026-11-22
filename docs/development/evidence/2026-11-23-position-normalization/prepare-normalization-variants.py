import io
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile


root = Path("coverage/subsecond-data/normalization-variants")
root.mkdir(exist_ok=True)
product = sys.argv[1] if len(sys.argv) > 1 else "de3406197f3efe8e790608003d6b74c91625ba92"
dependencies = Path("node_modules").resolve()
archive = subprocess.check_output(["git", "archive", product, "src", "public", "package.json", "tsconfig.json"])
control = root / "control"
control.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    source.extractall(control, filter="data")

target = Path("src/db-modules/ordering.ts")
original = (control / target).read_text()
split = "export function normalizeVisibleAndArchivedTicketPositions"
header, old_body = original.split(split)
assert "UPDATE tickets SET position = ? WHERE id = ?" in old_body
assert old_body.count("ORDER BY is_archived ASC, position ASC, id ASC") == 1

guard = old_body.replace(
    "UPDATE tickets SET position = ? WHERE id = ?",
    "UPDATE tickets SET position = ? WHERE id = ? AND position IS NOT ?",
).replace("stmt.run(index, row.id)", "stmt.run(index, row.id, index)")
skip = old_body.replace("SELECT id FROM tickets", "SELECT id, position FROM tickets").replace(
    "Array<{ id: Id }>",
    "Array<{ id: Id; position: number }>",
).replace("rows.forEach((row, index) => stmt.run(index, row.id));", """rows.forEach((row, index) => {
    if (row.position !== index) stmt.run(index, row.id);
  });""")
bulk = '''(sqlite: Database.Database, laneId: Id): void {
  sqlite.prepare(`
    WITH ranked AS MATERIALIZED (
      SELECT id, ROW_NUMBER() OVER (ORDER BY is_archived ASC, position ASC, id ASC) - 1 AS new_position
      FROM tickets WHERE lane_id = ?
    )
    UPDATE tickets SET position = ranked.new_position FROM ranked
    WHERE tickets.id = ranked.id AND tickets.position IS NOT ranked.new_position
  `).run(laneId);
}
'''
for label, body in {"guard": guard, "skip": skip, "bulk": bulk}.items():
    path = root / label
    shutil.copytree(control, path, dirs_exist_ok=True, ignore=shutil.ignore_patterns("node_modules"))
    (path / target).write_text(header + split + body)
for label in ("control", "guard", "skip", "bulk"):
    link = root / label / "node_modules"
    if not link.exists():
        link.symlink_to(dependencies, target_is_directory=True)
