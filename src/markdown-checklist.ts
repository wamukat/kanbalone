import { randomUUID } from "node:crypto";
import { marked, type Tokens } from "marked";

// Locate task markers without treating fenced code, HTML or escaped Markdown as
// tasks. A second lexical pass carries source offsets; only unchanged task tokens
// are accepted. The original Markdown is always used for the rendered output.
export function markdownTaskOffsets(markdown: string): number[] {
  const nonce = `kanbalone-${randomUUID()}`;
  const annotation = new RegExp(`<!--${nonce}:(\\d+)-->`, "g");
  const annotated = markdown.replace(/^([\t >]*(?:[-+*]|\d+[.)])[\t ]+\[)([ xX])(\][\t ]+)/gm,
    (match, prefix: string, _state: string, _suffix: string, offset: number) => `${match}<!--${nonce}:${offset + prefix.length}-->`);
  const tasks = (source: string) => {
    const result: Tokens.ListItem[] = [];
    marked.walkTokens(marked.lexer(source), token => {
      if (token.type === "list_item" && token.task) result.push(token as Tokens.ListItem);
    });
    return result;
  };
  const original = tasks(markdown);
  const located = tasks(annotated);
  if (original.length !== located.length) return original.map(() => -1);
  return original.map((task, index) => {
    const candidate = located[index];
    const firstLine = candidate.raw.split("\n", 1)[0];
    const match = [...firstLine.matchAll(annotation)][0];
    if (!match || candidate.raw.replace(annotation, "") !== task.raw || candidate.checked !== task.checked) return -1;
    const offset = Number(match[1]);
    return /^[ xX]$/.test(markdown[offset] ?? "") && markdown[offset - 1] === "[" && markdown[offset + 1] === "]" ? offset : -1;
  });
}
