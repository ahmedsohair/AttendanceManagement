import crypto from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeAccessCode(input: string) {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = compact.startsWith("AMS") ? compact.slice(3) : compact;
  const body = withoutPrefix.slice(0, 8);

  if (!body) {
    return "";
  }

  return `AMS-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ""}`;
}

export function generateAccessCode() {
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    body += alphabet[crypto.randomInt(alphabet.length)];
  }

  return normalizeAccessCode(body);
}

export function hashAccessCode(input: string) {
  const normalized = normalizeAccessCode(input);
  if (!normalized) {
    return "";
  }

  return crypto.createHash("sha256").update(normalized).digest("hex");
}
