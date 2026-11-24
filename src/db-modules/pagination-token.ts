import { createHmac, timingSafeEqual } from "node:crypto";

function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function encodePaginationToken(secret: string, cursor: object): string {
  const value = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${value}.${sign(secret, value)}`;
}

export function decodePaginationToken(secret: string, value: string): unknown {
  if (value.length > 4096) return;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined || !/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(signature)) return;
  const expected = Buffer.from(sign(secret, body));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}
