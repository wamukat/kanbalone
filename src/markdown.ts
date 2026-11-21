import { marked } from "marked";
import hljs from "highlight.js";
import sanitizeHtml from "sanitize-html";

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }) => {
  const language = (lang ?? "").trim().split(/\s+/)[0];
  const highlighted = language && hljs.getLanguage(language)
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  const languageClass = language ? ` language-${sanitizeClassName(language)}` : "";
  return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>\n`;
};

// Task state is content, not an editable form control. Keep raw HTML inputs disallowed.
renderer.checkbox = ({ checked }) =>
  `<span class="task-checkbox" role="img" aria-label="${checked ? "Completed" : "Not completed"}">${checked ? "☑" : "☐"}</span> `;

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

export function renderMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown ?? "") as string;
  const sanitizedHtml = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1",
      "h2",
      "img",
      "span",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "code",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      img: ["src", "alt", "title"],
      span: ["class", "role", "aria-label"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
  return linkifyTicketRefs(sanitizedHtml);
}

function sanitizeClassName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "");
}

function linkifyTicketRefs(html: string): string {
  const protectedTags = new Set(["a", "code", "pre"]);
  const activeProtectedTags: string[] = [];
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part) {
        return "";
      }
      if (part.startsWith("<")) {
        updateProtectedTagStack(part, protectedTags, activeProtectedTags);
        return part;
      }
      if (activeProtectedTags.length > 0) {
        return part;
      }
      return linkifyTicketRefsInText(part);
    })
    .join("");
}

function updateProtectedTagStack(tagHtml: string, protectedTags: Set<string>, activeProtectedTags: string[]): void {
  const tagMatch = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(tagHtml);
  if (!tagMatch) {
    return;
  }
  const tagName = tagMatch[1].toLowerCase();
  if (!protectedTags.has(tagName)) {
    return;
  }
  if (/^<\s*\//.test(tagHtml)) {
    const index = activeProtectedTags.lastIndexOf(tagName);
    if (index >= 0) {
      activeProtectedTags.splice(index, 1);
    }
    return;
  }
  if (!/\/\s*>$/.test(tagHtml)) {
    activeProtectedTags.push(tagName);
  }
}

function linkifyTicketRefsInText(text: string): string {
  return text.replace(/(^|[^\p{L}\p{N}_&])#([1-9]\d*)\b/gu, (_match, prefix: string, ticketId: string) => {
    return `${prefix}<a href="/tickets/${ticketId}">#${ticketId}</a>`;
  });
}
