import test from "node:test";
import assert from "node:assert/strict";
const script = "../scripts/verify-upgrade-restore.mjs";
const { compareUpgrade } = await import(script);

function fixture() {
  return {
    integrity: [{ integrity_check: "ok" }],
    foreignKeys: [],
    tables: {
      boards: [{ id: 1, name: "Board" }],
      lanes: [{ id: 1, board_id: 1, name: "Todo", is_completion_lane: 0 }],
      tickets: [
        {
          id: 1,
          board_id: 1,
          lane_id: 1,
          position: 0,
          is_archived: 0,
          is_resolved: 0,
          group_id: 1,
          body_markdown: "Keep",
        },
      ],
      groups: [{ id: 1, name: "Keep Group" }],
      comments: [{ id: 1, ticket_id: 1, body_markdown: "Keep comment", updater: null }],
      activity_logs: [],
    },
  };
}

test("upgrade reconciliation accepts unchanged data", () => {
  compareUpgrade(fixture(), fixture(), false);
});

for (const [name, corrupt] of [
  [
    "lost ticket",
    (s: any) => {
      s.tables.tickets = [];
    },
  ],
  [
    "changed comment",
    (s: any) => {
      s.tables.comments[0].body_markdown = "Lost";
    },
  ],
  [
    "guessed historical updater",
    (s: any) => {
      s.tables.comments[0].updater = "API";
    },
  ],
  [
    "lost Group membership",
    (s: any) => {
      s.tables.tickets[0].group_id = null;
    },
  ],
  [
    "changed completion",
    (s: any) => {
      s.tables.tickets[0].is_resolved = 1;
    },
  ],
  [
    "unexpected lane",
    (s: any) => {
      s.tables.lanes.push({ id: 2 });
    },
  ],
  [
    "broken integrity",
    (s: any) => {
      s.integrity = [{ integrity_check: "corrupt" }];
    },
  ],
  [
    "foreign key violation",
    (s: any) => {
      s.foreignKeys = [{ table: "tickets" }];
    },
  ],
] as const) {
  test(`upgrade reconciliation rejects ${name}`, () => {
    const before = fixture(),
      after = structuredClone(before);
    corrupt(after);
    assert.throws(() => compareUpgrade(before, after, false));
  });
}
