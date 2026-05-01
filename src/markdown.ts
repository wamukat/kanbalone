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

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

export function renderMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown ?? "") as string;
  return sanitizeHtml(rawHtml, {
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
      span: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

function sanitizeClassName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "");
}
