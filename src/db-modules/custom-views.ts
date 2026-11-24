import type Database from "better-sqlite3";

export const customViewSorts = ["position_asc", "priority_desc", "content_activity_desc"] as const;
export type CustomViewSort = typeof customViewSorts[number];
export type CustomViewRule = {
  boardId: number;
  mode: "all" | "tags";
  tagIds: number[];
  laneMode?: "all" | "selected";
  laneIds?: number[];
};
export type CustomViewDefinition = {
  name: string;
  scope: "all" | "selected";
  boardIds: number[];
  rules: CustomViewRule[];
  completion: "open" | "done" | "all";
  showBody: boolean;
  showLatestComment: boolean;
  sort?: CustomViewSort;
};

type ConfiguredRule = Required<CustomViewRule>;
type ConfiguredDefinition = Omit<CustomViewDefinition, "rules" | "sort"> & { rules: ConfiguredRule[]; sort: CustomViewSort };
type CustomViewRow = { id: number; version: number; definition: string };
type CustomView = ConfiguredDefinition & Pick<CustomViewRow, "id" | "version">;

export function withCustomViewDefaults(definition: CustomViewDefinition, current?: ConfiguredDefinition): ConfiguredDefinition {
  const { name, scope, boardIds, rules, completion, showBody, showLatestComment, sort } = definition;
  const previous = new Map(current?.rules.map(rule => [rule.boardId, rule]));
  return {
    name, scope, boardIds, completion, showBody, showLatestComment,
    sort: sort ?? current?.sort ?? "position_asc",
    // Older clients omit both lane fields. Keep restrictions on the same board until explicitly changed.
    rules: rules.map(({ boardId, mode, tagIds, laneMode, laneIds }) => ({
      boardId, mode, tagIds,
      laneMode: laneMode ?? previous.get(boardId)?.laneMode ?? "all",
      laneIds: laneIds ?? previous.get(boardId)?.laneIds ?? [],
    })),
  };
}

function mapView({ id, version, definition }: CustomViewRow): CustomView {
  return { ...withCustomViewDefaults(JSON.parse(definition) as CustomViewDefinition), id, version };
}

export function migrateCustomViews(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS custom_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL DEFAULT 1,
      definition TEXT NOT NULL CHECK(json_valid(definition))
    );
    CREATE TABLE IF NOT EXISTS custom_view_revision (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      revision INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO custom_view_revision VALUES(1, 0);
  `);
  // A read snapshot must become stale even when an import or cascade changes several tables at once.
  // Exclude unrelated updates such as a board's activity timestamp.
  const relevantColumns = {
    boards: ["name", "position"],
    lanes: ["board_id", "name", "position"],
    tags: ["board_id", "name", "color"],
    tickets: ["board_id", "lane_id", "position", "title", "body_markdown", "is_resolved", "is_archived", "priority"],
    comments: ["ticket_id", "body_markdown", "created_at"],
    ticket_tags: ["ticket_id", "tag_id"],
  };
  for (const [table, columns] of Object.entries(relevantColumns)) {
    for (const event of ["INSERT", "UPDATE", "DELETE"]) {
      const whenChanged = event === "UPDATE" ? `WHEN ${columns.map(column => `OLD.${column} IS NOT NEW.${column}`).join(" OR ")}` : "";
      sqlite.exec(`CREATE TRIGGER IF NOT EXISTS custom_view_${table}_${event.toLowerCase()}
        AFTER ${event} ON ${table} ${whenChanged}
        BEGIN UPDATE custom_view_revision SET revision = revision + 1 WHERE id = 1; END;`);
    }
  }
}

export function listCustomViews(sqlite: Database.Database): Pick<CustomView, "id" | "name" | "version">[] {
  return sqlite.prepare("SELECT id, version, json_extract(definition, '$.name') AS name FROM custom_views ORDER BY id")
    .all() as Pick<CustomView, "id" | "name" | "version">[];
}

export function getCustomView(sqlite: Database.Database, id: number): CustomView | null {
  const row = sqlite.prepare("SELECT id, version, definition FROM custom_views WHERE id = ?").get(id) as CustomViewRow | undefined;
  return row ? mapView(row) : null;
}

export function createCustomView(sqlite: Database.Database, definition: CustomViewDefinition) {
  return sqlite.transaction(() => {
    const configured = withCustomViewDefaults(definition);
    if (!validReferences(sqlite, configured)) return "invalid_reference" as const;
    const row = sqlite.prepare("INSERT INTO custom_views (definition) VALUES (?) RETURNING id, version, definition")
      .get(JSON.stringify(configured)) as CustomViewRow;
    return mapView(row);
  }).immediate();
}

export function updateCustomView(sqlite: Database.Database, id: number, expectedVersion: number, definition: CustomViewDefinition) {
  return sqlite.transaction(() => {
    const current = getCustomView(sqlite, id);
    if (!current) return "missing" as const;
    if (current.version !== expectedVersion) return "conflict" as const;
    const configured = withCustomViewDefaults(definition, current);
    if (!validReferences(sqlite, configured, current)) return "invalid_reference" as const;
    const row = sqlite.prepare(`UPDATE custom_views SET definition = ?, version = version + 1
      WHERE id = ? AND version = ? RETURNING id, version, definition`)
      .get(JSON.stringify(configured), id, expectedVersion) as CustomViewRow;
    return mapView(row);
  }).immediate();
}

export function deleteCustomView(sqlite: Database.Database, id: number, expectedVersion: number) {
  return sqlite.transaction(() => {
    const { changes } = sqlite.prepare("DELETE FROM custom_views WHERE id = ? AND version = ?").run(id, expectedVersion);
    return changes ? true : failedWrite(sqlite, id);
  }).immediate();
}

function failedWrite(sqlite: Database.Database, id: number): "missing" | "conflict" {
  return sqlite.prepare("SELECT 1 FROM custom_views WHERE id = ?").get(id) ? "conflict" : "missing";
}

function validReferences(sqlite: Database.Database, definition: ConfiguredDefinition, current?: ConfiguredDefinition): boolean {
  // Retain references removed from the catalog so a saved view can warn about them. New
  // references must already exist so a guessed ID cannot bind to data added in the future.
  const previousBoards = new Set([...(current?.boardIds ?? []), ...(current?.rules ?? []).map(rule => rule.boardId)]);
  const previous = new Map(current?.rules.map(rule => [rule.boardId, { tags: new Set(rule.tagIds), lanes: new Set(rule.laneIds) }]));
  const boardExists = sqlite.prepare("SELECT 1 FROM boards WHERE id = ?");
  const tagOnBoard = sqlite.prepare("SELECT 1 FROM tags WHERE id = ? AND board_id = ?");
  const laneOnBoard = sqlite.prepare("SELECT 1 FROM lanes WHERE id = ? AND board_id = ?");
  const boardIds = new Set([...definition.boardIds, ...definition.rules.map(rule => rule.boardId)]);
  return [...boardIds].every(id => previousBoards.has(id) || boardExists.get(id)) && definition.rules.every(rule => {
    const retained = previous.get(rule.boardId);
    return rule.tagIds.every(id => retained?.tags.has(id) || tagOnBoard.get(id, rule.boardId))
      && rule.laneIds.every(id => retained?.lanes.has(id) || laneOnBoard.get(id, rule.boardId));
  });
}
