import "server-only";
import { after } from "next/server";
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { validateScannerReport } from "./scanner-telemetry";
import { evaluateOperations } from "./ops-policy";

export function persistOperations(kind: "api" | "scanner", payload: unknown, health?: { userId: string; deviceId: string; pending: number; conflicts: number }) {
  if (process.env.OPS_MONITORING_ENABLED !== "true") return;
  try {
    after(async () => {
      try {
        const report = kind === "scanner" ? validateScannerReport({ ...(payload as object), ...(health ? { health: { deviceId: health.deviceId, pending: health.pending, conflicts: health.conflicts } } : {}) }) : payload;
        if (!report) return;
        const safePayload = kind === "scanner" ? { ...(report as object), health: undefined } : report;
        const key = health && (process.env.OPS_HEALTH_SECRET?.length || 0) >= 32
          ? createHmac("sha256", process.env.OPS_HEALTH_SECRET!).update(`${health.userId}:${health.deviceId}`).digest("hex") : null;
        const { error } = await getSupabaseAdmin().rpc("ops_ingest", {
          p_kind: kind, p_payload: safePayload, p_key: key,
          p_pending: health?.pending || 0, p_conflicts: health?.conflicts || 0
        }).abortSignal(AbortSignal.timeout(3000));
        if (error) throw error;
      } catch { console.warn(JSON.stringify({ event: "ops.ingest_failed" })); }
    });
  } catch { /* Diagnostics must not affect a completed attendance response. */ }
}

export async function getOperationsSnapshot() {
  const db = getSupabaseAdmin();
  const capturedAt = new Date().toISOString();
  const signal = AbortSignal.timeout(15000);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const started = performance.now();
  const events: {kind: string; payload: unknown}[] = [];
  // Explicit pages avoid the default PostgREST row cap. A fixed upper bound limits dashboard work.
  for (let offset = 0; offset <= 10000; offset += 1000) {
    const result = await db.from("ops_events").select("kind,payload").gte("created_at", since).lte("created_at", capturedAt)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999)
      .abortSignal(signal);
    if (result.error) throw new Error("Operational metrics unavailable.");
    events.push(...result.data);
    if (result.data.length < 1000) break;
  }
  const databaseMs = Math.round(performance.now() - started);
  const scanners = await db.from("ops_scanners").select("seen_at,pending,conflicts").gte("seen_at", new Date(Date.now() - 86400000).toISOString()).order("seen_at", { ascending: false }).limit(1000).abortSignal(signal);
  const sessions = await db.from("exam_sessions").select("id,name", { count: "exact" }).eq("status", "active").limit(100).abortSignal(AbortSignal.timeout(3000));
  const bounces = await db.from("email_deliveries").select("id", { count: "exact", head: true }).in("status", ["bounced", "complained"]).gte("updated_at", since).abortSignal(AbortSignal.timeout(3000));
  const delivery = await db.from("ops_alerts").select("key,claimed_at,state").order("claimed_at", { ascending: false }).abortSignal(AbortSignal.timeout(3000));
  if (scanners.error || sessions.error || bounces.error || delivery.error) throw new Error("Operational status unavailable.");
  const fresh = scanners.data.filter((row) => Date.parse(row.seen_at) >= Date.now() - 90000);
  const rows = events.slice(0, 10000);
  return {
    capturedAt, since, databaseMs, truncated: events.length > 10000,
    activeCount: sessions.count || 0, sessions: sessions.data,
    recentScanners: fresh.length, staleScanners: scanners.data.length - fresh.length,
    pending: fresh.reduce((n, row) => n + row.pending, 0), conflicts: fresh.reduce((n, row) => n + row.conflicts, 0),
    delivery: delivery.data,
    ...evaluateOperations({ records: rows.filter((r) => r.kind === "api").map((r) => r.payload),
      scannerReports: rows.filter((r) => r.kind === "scanner").map((r) => r.payload),
      databaseMs, bounces: bounces.count || 0, activeExams: sessions.count || 0, truncated: events.length > 10000 })
  };
}
