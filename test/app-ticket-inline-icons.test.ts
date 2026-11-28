import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ticketInlineIcon } from "../public/app-ticket-inline-icons.js";
import { icon } from "../public/icons.js";
import { renderTicketHierarchyIcon } from "../public/app-ticket-hierarchy.js";
import { renderTicketStatusIcons } from "../public/app-ticket-status.js";

test("Repeated ticket SVG stays synchronized with canonical icons", () => {
  execFileSync(process.execPath, ["scripts/generate-ticket-inline-icons.mjs", "--check"]);
  for (const name of [
    "folder-up", "folder-tree", "ticket", "check", "archive", "trash-2",
    "priority-low", "priority-medium", "priority-high", "circle-alert", "octagon-alert", "lock", "list-checks",
  ]) {
    const markup = ticketInlineIcon(name);
    assert.match(markup, /class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"/);
    assert.doesNotMatch(markup, /<use/);
  }
  assert.equal(ticketInlineIcon("plus"), icon("plus"));
  assert.equal(ticketInlineIcon("toString"), icon("toString"));
});

test("Shared hierarchy and status preserve default SVG and accessible wrappers", () => {
  for (const ticket of [
    { id: 1, parentTicketId: null, hasChildren: true, isResolved: true, isArchived: true },
    { id: 2, parentTicketId: 1, hasChildren: false, isResolved: false, isArchived: false },
    { id: 3, parentTicketId: null, hasChildren: false, isResolved: true, isArchived: false },
  ]) {
    const replaceIcons = (html: string) => html.replace(/<svg class="icon" aria-hidden="true" focusable="false"><use href="\/icons.svg#([^"]+)"><\/use><\/svg>/g, (_, name: string) => ticketInlineIcon(name));
    for (const selectableParent of [false, true]) {
      const original = renderTicketHierarchyIcon(ticket, [ticket], { selectableParent });
      assert.match(original, /<use href="\/icons.svg#/);
      assert.equal(renderTicketHierarchyIcon(ticket, [ticket], { selectableParent, renderIcon: ticketInlineIcon }), replaceIcons(original));
    }
    for (const showResolved of [false, true]) {
      const original = renderTicketStatusIcons(ticket, { showResolved });
      assert.equal(renderTicketStatusIcons(ticket, { showResolved, renderIcon: ticketInlineIcon }), replaceIcons(original));
    }
  }
});
