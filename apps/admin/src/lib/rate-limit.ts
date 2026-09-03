import "server-only";

import crypto from "node:crypto";
import { assertDevelopmentFallbackAllowed, getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getRequestId } from "./api-errors";

type RateLimitRule = {
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function getClientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getHashSecret() {
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error("Rate limiting is not configured.");
  }

  return secret;
}

function hashKey(scope: string, kind: string, value: string) {
  return crypto
    .createHmac("sha256", getHashSecret())
    .update(`${scope}:${kind}:${value}`)
    .digest("hex");
}

async function consumeLimit(keyHash: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_auth_rate_limit", {
    p_key_hash: keyHash,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
    p_block_seconds: rule.blockSeconds
  });

  if (error) {
    throw new Error(`Rate-limit check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Rate-limit check returned an invalid response.");
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0)
  };
}

export async function enforceAuthRateLimits(
  request: Request,
  scope: string,
  identity: string,
  rules: {
    address: RateLimitRule;
    identity: RateLimitRule;
  }
): Promise<RateLimitResult> {
  if (!isSupabaseConfigured()) {
    assertDevelopmentFallbackAllowed();
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const addressHash = hashKey(scope, "address", getClientAddress(request));
  const identityHash = hashKey(scope, "identity", identity.trim().toLowerCase());

  const addressResult = await consumeLimit(addressHash, rules.address);
  if (!addressResult.allowed) {
    console.warn("Authentication rate limit enforced.", {
      requestId: getRequestId(request),
      scope,
      dimension: "address",
      retryAfterSeconds: addressResult.retryAfterSeconds
    });
    return addressResult;
  }

  const identityResult = await consumeLimit(identityHash, rules.identity);
  if (!identityResult.allowed) {
    console.warn("Authentication rate limit enforced.", {
      requestId: getRequestId(request),
      scope,
      dimension: "identity",
      retryAfterSeconds: identityResult.retryAfterSeconds
    });
  }

  return identityResult;
}
