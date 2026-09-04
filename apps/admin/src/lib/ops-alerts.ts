import { createHash, timingSafeEqual } from "node:crypto";

export function validOperationsSecret(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ") || header.length > 512) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(secret));
}

export async function dispatchOperationsAlerts(keys: string[], dependencies: {
  claim: (key: string) => Promise<string | null>;
  send: (key: string, claimId: string) => Promise<void>;
  finish: (key: string, claimId: string, state: "accepted" | "unknown") => Promise<void>;
}) {
  let accepted = 0, unknown = 0, suppressed = 0;
  for (const key of [...new Set(keys)]) {
    const claimId = await dependencies.claim(key);
    if (!claimId) { suppressed++; continue; }
    let state: "accepted" | "unknown" = "accepted";
    try { await dependencies.send(key, claimId); accepted++; }
    catch { state = "unknown"; unknown++; }
    // Never claim successful delivery, and never retry an ambiguous provider request here.
    await dependencies.finish(key, claimId, state);
  }
  return { accepted, unknown, suppressed };
}
