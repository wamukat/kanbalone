import imagePolicy from "./image-policy.json" with { type: "json" };

export type ImageMediaType = keyof typeof imagePolicy.mediaTypes;
export const imageMediaTypes = Object.keys(imagePolicy.mediaTypes) as readonly ImageMediaType[];
export const imageByteLimit = imagePolicy.byteLimit;

function isPng(data: Buffer): boolean {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 45 || !data.subarray(0, 8).equals(signature)) return false;
  if (data.readUInt32BE(8) !== 13 || data.toString("latin1", 12, 16) !== "IHDR" ||
      !data.readUInt32BE(16) || !data.readUInt32BE(20)) return false;
  let hasImageData = false;
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    offset += 12 + length;
    if (offset > data.length) return false;
    if (type === "IDAT" && length > 0) hasImageData = true;
    if (type === "IEND") return length === 0 && hasImageData && offset === data.length;
  }
  return false;
}

function isJpeg(data: Buffer): boolean {
  if (data.length < 12 || data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9) return false;
  let hasFrame = false;
  for (let offset = 2; offset + 4 < data.length;) {
    if (data[offset++] !== 0xff) return false;
    while (data[offset] === 0xff) offset++;
    if (offset + 3 > data.length) return false;
    const marker = data[offset++];
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length - 2) return false;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8 || !data.readUInt16BE(offset + 3) || !data.readUInt16BE(offset + 5)) return false;
      hasFrame = true;
    }
    if (marker === 0xda) return hasFrame && length >= 6 && offset + length < data.length - 2;
    offset += length;
  }
  return false;
}

function isGif(data: Buffer): boolean {
  if (data.length < 14 || !["GIF87a", "GIF89a"].includes(data.toString("latin1", 0, 6)) ||
      !data.readUInt16LE(6) || !data.readUInt16LE(8)) return false;
  const paletteLength = (flags: number) => flags & 0x80 ? 3 * (2 << (flags & 7)) : 0;
  let offset = 13 + paletteLength(data[10]);
  let hasFrame = false;
  while (offset < data.length) {
    const marker = data[offset++];
    if (marker === 0x3b) return hasFrame && offset === data.length;
    if (marker === 0x2c) {
      if (offset + 9 > data.length || !data.readUInt16LE(offset + 4) || !data.readUInt16LE(offset + 6)) return false;
      offset += 9 + paletteLength(data[offset + 8]);
      const codeSize = data[offset++];
      if (!(codeSize >= 2 && codeSize <= 8) || !data[offset]) return false;
      hasFrame = true;
    } else if (marker === 0x21) {
      offset++; // Extension label precedes the block sequence.
    } else {
      return false;
    }
    while (offset < data.length && data[offset] !== 0) offset += 1 + data[offset];
    offset++;
  }
  return false;
}

function isWebp(data: Buffer): boolean {
  if (data.length < 26 || data.toString("latin1", 0, 4) !== "RIFF" ||
      data.readUInt32LE(4) !== data.length - 8 || data.toString("latin1", 8, 12) !== "WEBP") return false;
  let hasFrame = false;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.toString("latin1", offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > data.length) return false;
    if (type === "VP8 " && length >= 10 && data.readUIntBE(offset + 3, 3) === 0x9d012a) hasFrame = true;
    if (type === "VP8L" && length >= 5 && data[offset] === 0x2f) hasFrame = true;
    if (type === "ANMF" && length >= 24 && ["VP8 ", "VP8L", "ALPH"].includes(data.toString("latin1", offset + 16, offset + 20))) hasFrame = true;
    offset += length + (length % 2);
  }
  return hasFrame && offset === data.length;
}

const validateContainer: Record<ImageMediaType, (data: Buffer) => boolean> = {
  "image/png": isPng,
  "image/jpeg": isJpeg,
  "image/gif": isGif,
  "image/webp": isWebp,
};

export function validateImage(mediaType: unknown, data: Buffer): asserts mediaType is ImageMediaType {
  if (typeof mediaType !== "string" || !Object.hasOwn(validateContainer, mediaType)) {
    throw Object.assign(new Error("Unsupported image media type"), { statusCode: 415 });
  }
  if (data.length > imageByteLimit) throw Object.assign(new Error("Image exceeds 10 MiB"), { statusCode: 413 });
  if (!validateContainer[mediaType as ImageMediaType](data)) {
    throw Object.assign(new Error("Invalid image or media type mismatch"), { statusCode: 400 });
  }
}
