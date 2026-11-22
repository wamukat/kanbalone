import { t } from "./app-i18n.js";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const SUPPORTED_TYPES = new Set(Object.values(IMAGE_TYPES));
let nextDescriptionId = 0;

function mediaType(file) {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1).toLowerCase();
  return Object.hasOwn(IMAGE_TYPES, extension) ? IMAGE_TYPES[extension] : "";
}

function imageMarkdown(name, url) {
  const alt = name.replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[&\\[\]()<>*`_~]/g, char => `&#${char.charCodeAt(0)};`);
  return `![${alt}](${url})`;
}

// A replacement can have the same prefix or suffix as the original selection.
// Check the browser's edit range before inferring a range from the resulting text.
function changeAtSelection(previous, value, selection) {
  if (selection?.value !== previous) return null;
  let { start, end } = selection;
  const delta = value.length - previous.length;
  if (start === end && delta < 0) {
    if (selection.type.endsWith("Backward")) start += delta;
    if (selection.type.endsWith("Forward")) end -= delta;
  }
  const added = end - start + delta;
  if (start < 0 || end > previous.length || added < 0) return null;
  if (previous.slice(0, start) !== value.slice(0, start) || previous.slice(end) !== value.slice(start + added)) return null;
  return { start, end, added };
}

function textChange(previous, value, caret) {
  const delta = value.length - previous.length;
  let start = 0;
  while (start < Math.min(previous.length, value.length) && previous[start] === value[start]) start++;
  if (caret <= start && caret - delta >= 0 && previous.slice(caret - delta) === value.slice(caret)) {
    return { start: Math.min(caret, caret - delta), end: caret - delta, added: Math.max(delta, 0) };
  }
  let end = previous.length;
  while (end > start && end + delta > start && previous[end - 1] === value[end + delta - 1]) end--;
  return { start, end, added: end + delta - start };
}

export function createImageAttachments(api, showToast) {
  const editors = new WeakMap();
  const pendingInputs = new Set();

  function bind(input, isCurrent) {
    if (editors.has(input)) return;
    const description = document.createElement("span");
    const hint = document.createElement("span");
    const status = document.createElement("span");
    description.className = "image-attachment-feedback";
    hint.className = "muted";
    hint.id = `image-attachment-hint-${++nextDescriptionId}`;
    hint.textContent = t("Drop or paste an image (PNG, JPEG, GIF, WebP, up to 10 MiB)");
    status.className = "editor-save-state";
    status.dataset.imageUploadStatus = "";
    status.setAttribute("role", "status");
    description.append(hint, status);
    input.after(description);
    const describedBy = input.getAttribute("aria-describedby");
    input.setAttribute("aria-describedby", [describedBy, hint.id].filter(Boolean).join(" "));

    const batches = [];
    let previous = input.value;
    let selectionBeforeInput = null;
    let errorMessage = "";
    let composing = false;

    function syncStatus() {
      const pending = batches.length > 0;
      if (pending) pendingInputs.add(input);
      else pendingInputs.delete(input);
      status.dataset.kind = pending ? "saving" : errorMessage ? "error" : "";
      status.textContent = pending ? t("Uploading images…") : errorMessage;
    }

    function reset() {
      for (const batch of batches.splice(0)) batch.controller.abort();
      previous = input.value;
      selectionBeforeInput = null;
      errorMessage = "";
      composing = false;
      syncStatus();
    }

    function rebase(start, end, added, insertedImages = false) {
      const shift = added - (end - start);
      for (const batch of batches) {
        if (!insertedImages && start === end && start === batch.start && start === batch.end) continue;
        if (end <= batch.start) {
          batch.start += shift;
          batch.end += shift;
        } else if (start < batch.end) {
          // The user edited the original selection. Preserve the new text.
          batch.start = batch.end = start + added;
        }
      }
    }

    function syncText() {
      const selection = selectionBeforeInput;
      selectionBeforeInput = null;
      if (input.value === previous) return;
      const knownChange = changeAtSelection(previous, input.value, selection);
      const change = knownChange ?? textChange(previous, input.value, input.selectionStart);
      if (!knownChange) {
        // With an unknown edit range, keep existing text instead of replacing it.
        for (const batch of batches) batch.end = batch.start;
      }
      rebase(change.start, change.end, change.added);
      previous = input.value;
    }

    async function upload(file, signal) {
      const name = file.name || t("Attached image");
      const contentType = mediaType(file);
      if (!SUPPORTED_TYPES.has(contentType)) {
        return { error: t("Unsupported image type: {name}. Use PNG, JPEG, GIF, or WebP.", { name }) };
      }
      if (file.size > MAX_BYTES) return { error: t("Image exceeds 10 MiB: {name}.", { name }) };
      try {
        const { url } = await api("/api/attachments", {
          method: "POST",
          headers: { "content-type": contentType },
          body: file,
          signal,
        });
        if (!/^\/api\/attachments\/[a-f0-9]{64}$/.test(url)) throw new Error("Invalid image attachment URL");
        return { markdown: imageMarkdown(name, url) };
      } catch (error) {
        if (error?.status === 413) return { error: t("Image exceeds 10 MiB: {name}.", { name }) };
        if (error?.status === 400 || error?.status === 415) {
          return { error: t("Invalid image: {name}. Try another PNG, JPEG, GIF, or WebP.", { name }) };
        }
        return { error: t("Could not upload {name}. Drop or paste it again to retry.", { name }) };
      }
    }

    function insertReadyBatches() {
      if (composing || !isCurrent() || !input.isConnected) return;
      syncText();
      while (batches[0]?.results) {
        const { start, end, results } = batches.shift();
        const markdown = results.flatMap((entry) => entry.markdown ? [entry.markdown] : []).join("\n");
        const errors = results.flatMap((entry) => entry.error ? [entry.error] : []);
        errorMessage = [errorMessage, ...errors].filter(Boolean).join(" ");
        if (!markdown) continue;
        const replaceEnd = errors.length > 0 ? start : end;
        const editingAtRange = input.selectionStart === start && input.selectionEnd === end;
        input.setRangeText(markdown, start, replaceEnd, editingAtRange ? "end" : "preserve");
        if (editingAtRange && replaceEnd !== end) {
          input.setSelectionRange(start + markdown.length, end + markdown.length);
        }
        rebase(start, replaceEnd, markdown.length, true);
        previous = input.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      syncStatus();
    }

    function begin(files) {
      syncText();
      if (batches.length === 0) errorMessage = "";
      const batch = {
        start: input.selectionStart,
        end: input.selectionEnd,
        controller: new AbortController(),
        results: null,
      };
      batches.push(batch);
      syncStatus();
      Promise.all(files.map((file) => upload(file, batch.controller.signal))).then((results) => {
        if (batch.controller.signal.aborted) return;
        if (!input.isConnected || !isCurrent()) { reset(); return; }
        batch.results = results;
        insertReadyBatches();
      });
    }

    function acceptsInput() {
      return isCurrent() && !input.readOnly && !input.disabled && !input.closest("[hidden], [inert]");
    }

    input.addEventListener("beforeinput", (event) => {
      selectionBeforeInput = {
        value: input.value,
        start: input.selectionStart,
        end: input.selectionEnd,
        type: event.inputType ?? "",
      };
    });
    input.addEventListener("input", syncText);
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => {
      composing = false;
      queueMicrotask(insertReadyBatches);
    });
    input.addEventListener("paste", (event) => {
      if (!event.clipboardData || !acceptsInput()) return;
      const clipboard = event.clipboardData;
      const files = Array.from(clipboard.files);
      const images = files.filter((file) => mediaType(file).startsWith("image/"));
      const uploadFiles = images.length > 0 ? images : clipboard.types.includes("text/plain") ? [] : files;
      if (uploadFiles.length === 0) return;
      event.preventDefault();
      begin(uploadFiles);
    });
    input.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = acceptsInput() ? "copy" : "none";
    });
    input.addEventListener("drop", (event) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      if (acceptsInput()) begin(files);
    });

    editors.set(input, { reset, pending: () => batches.length > 0, description });
  }

  function isPending(input) {
    return editors.get(input)?.pending() === true;
  }

  function canSave(input) {
    if (!isPending(input)) return true;
    showToast(t("Please wait until the image upload finishes"), "error");
    return false;
  }

  return {
    bind,
    isPending,
    hasPending: () => pendingInputs.size > 0,
    canSave,
    reset: (input) => editors.get(input)?.reset(),
    setHidden: (input, hidden) => {
      const editor = editors.get(input);
      if (editor) editor.description.hidden = hidden;
    },
  };
}
