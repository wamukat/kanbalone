import { attachmentIdPattern, imageDigest, type AttachmentStore } from "../attachments.js";
import { imageByteLimit, validateImage } from "../image-format.js";
import { renderMarkdown } from "../markdown.js";
import type { BoardExport } from "../types.js";

export const boardTransferByteLimit = 64 * 1024 * 1024;

function referencedImages(board: BoardExport): Set<string> {
  const ids = new Set<string>();
  const visit = (markdown: string) => {
    // Entity escapes may also produce a local URL. Skip the renderer for ordinary board text.
    if (!markdown || (!markdown.includes("attachments") && !markdown.includes("&"))) return;
    renderMarkdown(markdown, url => {
      const match = /^\/api\/attachments\/([a-f0-9]{64})(?:[?#].*)?$/.exec(url);
      if (match) ids.add(match[1]);
    });
  };
  for (const ticket of board.tickets) {
    visit(ticket.bodyMarkdown);
    for (const comment of ticket.comments) visit(comment.bodyMarkdown);
    for (const task of ticket.taskState?.tasks ?? []) visit(task.bodyMarkdown);
  }
  for (const group of board.groups ?? []) visit(group.descriptionMarkdown);
  return ids;
}

export function exportBoardImages(board: BoardExport, store: AttachmentStore): BoardExport {
  const ids = referencedImages(board);
  if (!ids.size) {
    if (board.formatVersion === 4 && Buffer.byteLength(JSON.stringify(board, null, 2)) > boardTransferByteLimit) {
      throw Object.assign(new Error("Board export exceeds 64 MiB. Use a database and attachments backup."), { statusCode: 413 });
    }
    return board;
  }
  const images = [...ids].map(id => {
    const image = store.metadata(id);
    if (!image) throw Object.assign(new Error("Board references a missing attachment: " + id), { statusCode: 409 });
    return image;
  });
  const output = {
    ...board, formatVersion: board.formatVersion === 4 ? 4 : 3,
    attachments: images.map(({ id, mediaType }) => ({ id, mediaType, dataBase64: "" })),
  };
  // Include the indentation used by the board download so that the saved file also fits a raw API import.
  const bytes = Buffer.byteLength(JSON.stringify(output, null, 2)) +
    images.reduce((total, image) => total + 4 * Math.ceil(image.byteSize / 3), 0);
  if (bytes > boardTransferByteLimit) {
    throw Object.assign(new Error("Board export exceeds 64 MiB. Use a database and attachments backup."), { statusCode: 413 });
  }
  output.attachments.forEach((entry, index) => {
    entry.dataBase64 = store.readVerified(images[index]).toString("base64");
  });
  return output;
}

export function importBoardImages<T>(board: BoardExport, store: AttachmentStore, importBoard: () => T): T {
  const hasManifest = Object.hasOwn(board, "attachments");
  if (board.formatVersion !== 3 && !(board.formatVersion === 4 && hasManifest)) {
    if (hasManifest) throw new Error("Attachment files require board export format 3 or 4");
    if (referencedImages(board).size) throw new Error("Board references attachments without a portable image manifest");
    return importBoard();
  }
  if (!Array.isArray(board.attachments)) throw new Error("Invalid board export attachment manifest");
  const remaining = referencedImages(board);
  const images = board.attachments.map(entry => {
    if (!entry || typeof entry.id !== "string" || !attachmentIdPattern.test(entry.id) || !remaining.delete(entry.id)) {
      throw new Error("Duplicate, invalid or unreferenced attachment ID");
    }
    if (typeof entry.dataBase64 !== "string" || entry.dataBase64.length > 4 * Math.ceil(imageByteLimit / 3)) {
      throw new Error("Invalid attachment data or size");
    }
    const bytes = Buffer.from(entry.dataBase64, "base64");
    if (bytes.toString("base64") !== entry.dataBase64 || imageDigest(bytes) !== entry.id) throw new Error("Attachment digest or encoding mismatch");
    validateImage(entry.mediaType, bytes);
    return { mediaType: entry.mediaType, bytes };
  });
  if (remaining.size) throw new Error("Referenced attachment missing from board export");
  return store.withWrites(put => {
    const imported = importBoard();
    for (const image of images) put(image.mediaType, image.bytes);
    return imported;
  });
}
