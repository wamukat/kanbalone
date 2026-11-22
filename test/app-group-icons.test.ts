import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { groupRowIcon } from "../public/app-group-icons.js";
import { icon } from "../public/icons.js";
import { renderTicketHierarchyIcon } from "../public/app-ticket-hierarchy.js";
import { renderTicketStatusIcons } from "../public/app-ticket-status.js";

test("Group row SVG stays synchronized with canonical icons", () => {
  execFileSync(process.execPath, ["scripts/generate-group-icons.mjs", "--check"]);
  for (const name of ["folder-up", "folder-tree", "ticket", "check", "archive", "trash-2"]) {
    const markup = groupRowIcon(name);
    assert.match(markup, /class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"/);
    assert.doesNotMatch(markup, /<use/);
  }
  assert.equal(groupRowIcon("plus"), icon("plus"));
  assert.equal(groupRowIcon("toString"), icon("toString"));
});

test("Shared hierarchy and status preserve default SVG and accessible wrappers", () => {
  for (const ticket of [
    { id: 1, parentTicketId: null, hasChildren: true, isResolved: true, isArchived: true },
    { id: 2, parentTicketId: 1, hasChildren: false, isResolved: false, isArchived: false },
    { id: 3, parentTicketId: null, hasChildren: false, isResolved: true, isArchived: false },
  ]) {
    const replaceIcons = (html: string) => html.replace(/<svg class="icon" aria-hidden="true" focusable="false"><use href="\/icons.svg#([^"]+)"><\/use><\/svg>/g, (_, name: string) => groupRowIcon(name));
    for (const selectableParent of [false, true]) {
      const original = renderTicketHierarchyIcon(ticket, [ticket], { selectableParent });
      assert.match(original, /<use href="\/icons.svg#/);
      assert.equal(renderTicketHierarchyIcon(ticket, [ticket], { selectableParent, renderIcon: groupRowIcon }), replaceIcons(original));
    }
    for (const showResolved of [false, true]) {
      const original = renderTicketStatusIcons(ticket, { showResolved });
      assert.equal(renderTicketStatusIcons(ticket, { showResolved, renderIcon: groupRowIcon }), replaceIcons(original));
    }
  }
});
