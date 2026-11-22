"""Create four isolated source copies for the position seek/index comparison."""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path.cwd()
OUTPUT = ROOT / "coverage/subsecond-data/seek-variants"
REVISION = subprocess.check_output(
    ["git", "rev-parse", "--verify", (sys.argv[1] if len(sys.argv) > 1 else "origin/main") + "^{commit}"], text=True
).strip()


def edit(path, old, new):
    text = path.read_text()
    assert text.count(old) == 1, (path, old)
    path.write_text(text.replace(old, new))


def use_position_seek(directory):
    pagination = directory / "src/db-modules/ticket-pagination.ts"
    edit(
        pagination,
        "options: PageOptions & { reuseTotal?: true },",
        "options: PageOptions & { reuseTotal?: true; fixedOrderKeys?: string[] },",
    )
    replace = '''      const clauses = keys.map((key, i) => {
        const equals = keys.slice(0, i).map((previous, j) => { params.push(cursor.keys[j]!); return `${previous.expression} = ?`; });
        params.push(cursor.keys[i]!);
        return `(${[...equals, `${key.expression} ${key.direction === "ASC" ? ">" : "<"} ?`].join(" AND ")})`;
      });
      sql += ` AND (${clauses.join(" OR ")})`;'''
    seek = '''      const fixed = options.fixedOrderKeys;
      if (fixed) {
        // The request filters already pin these columns, but their values remain in the cursor.
        const variable = keys.map((key, index) => ({ expression: key.expression, index }))
          .filter(({ expression }) => !fixed.includes(expression));
        sql += ` AND (${variable.map(({ expression }) => expression).join(", ")}) > (${variable.map(() => "?").join(", ")})`;
        params.push(...variable.map(({ index }) => cursor.keys[index]!));
      } else {
''' + "\n".join("  " + line for line in replace.splitlines()) + '''
      }'''
    edit(pagination, replace, seek)
    edit(
        pagination,
        "export function listTicketPage(sqlite:",
        '''function fixedPositionKeys(filters: ListTicketsFilters): string[] {
  const fixed = [];
  if (typeof filters.laneId === "number") fixed.push("t.lane_id");
  if (typeof filters.archived === "boolean" || !filters.includeArchived) fixed.push("t.is_archived");
  return fixed;
}

export function listTicketPage(sqlite:''',
    )
    edit(
        pagination,
        'return readTicketPage(sqlite, boardId, filtered, { limit, cursor }, keys, query, "t.*",',
        '''const fixedOrderKeys = order === "position_asc" ? fixedPositionKeys(filters) : undefined;
  return readTicketPage(sqlite, boardId, filtered, { limit, cursor, fixedOrderKeys }, keys, query, "t.*",''',
    )
    for current_options in ("{ ...options, reuseTotal: true }", "options"):
        reference = f"return readTicketPage(sqlite, boardId, filtered, {current_options}, orderKeys(order), query, referenceProjection,"
        if reference in pagination.read_text():
            with_fixed_keys = current_options[:-2] + ", fixedOrderKeys }" if current_options.startswith("{") else "{ ...options, fixedOrderKeys }"
            edit(
                pagination,
                reference,
                f"""const fixedOrderKeys = fixedPositionKeys(filters);
  return readTicketPage(sqlite, boardId, filtered, {with_fixed_keys}, orderKeys(order), query, referenceProjection,""",
            )
            break
    else:
        raise AssertionError("List reference pagination call changed")


def use_position_index(directory):
    edit(
        directory / "src/db-modules/ticket-pagination-revision.ts",
        "CREATE INDEX IF NOT EXISTS tickets_paging_id_idx ON tickets(board_id, id);",
        """CREATE INDEX IF NOT EXISTS tickets_paging_id_idx ON tickets(board_id, id);
    CREATE INDEX IF NOT EXISTS tickets_paging_position_idx ON tickets(board_id, lane_id, is_archived, position, id);""",
    )


for variant in ("control", "tuple-only", "index-only", "tuple-and-index"):
    directory = OUTPUT / variant
    directory.mkdir(parents=True, exist_ok=False)
    archive = subprocess.Popen(
        ["git", "archive", REVISION, "src", "public", "package.json", "tsconfig.json"], stdout=subprocess.PIPE,
    )
    assert archive.stdout is not None
    subprocess.run(["tar", "-xf", "-", "-C", str(directory)], stdin=archive.stdout, check=True)
    archive.stdout.close()
    assert archive.wait() == 0
    os.symlink(ROOT / "node_modules", directory / "node_modules")
    if variant in ("tuple-only", "tuple-and-index"):
        use_position_seek(directory)
    if variant in ("index-only", "tuple-and-index"):
        use_position_index(directory)
    print(REVISION, variant, directory)
