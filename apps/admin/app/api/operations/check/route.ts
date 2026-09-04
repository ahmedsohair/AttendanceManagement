import { getOperationsSnapshot } from "@/lib/ops-monitoring";
import { getSupabaseAdmin } from "@/lib/supabase";
import { dispatchOperationsAlerts, validOperationsSecret } from "@/lib/ops-alerts";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const response = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (process.env.OPS_MONITORING_ENABLED !== "true" || process.env.OPS_ALERTS_ENABLED !== "true") return response({ status: "disabled" }, 404);
  if (!validOperationsSecret(request.headers.get("authorization"), process.env.OPS_CHECK_SECRET)) return response({ status: "unauthorized" }, 401);
  const recipient = process.env.OPS_ALERT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !apiKey || !from) return response({ status: "not_configured" }, 503);
  try {
    const snapshot = await getOperationsSnapshot();
    const db = getSupabaseAdmin();
    const signal = AbortSignal.timeout(20000);
    const results = await dispatchOperationsAlerts(snapshot.alerts, {
      claim: async (key) => {
        signal.throwIfAborted();
        const { data, error } = await db.rpc("ops_claim_alert", { p_key: key }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(1500)]));
        if (error) throw error;
        return data as string | null;
      },
      send: async (key, claimId) => {
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `ops-${claimId}` },
          body: JSON.stringify({ from, to: [recipient], subject: `ExamPulse operations: ${key.replaceAll("_", " ")}`,
            text: `Operational check: ${key}\nEnvironment: ${process.env.VERCEL_PROJECT_PRODUCTION_URL || "local/unidentified"}\nWindow ending: ${snapshot.capturedAt}\nReview the administrator Health page and EXAM_DAY_RUNBOOKS.md.\nThis is an observed warning, not proof of an outage. Scanner observations are sampled. No student details are included.` })
        });
        if (!result.ok) throw new Error("Provider did not accept alert.");
        const body = await result.json();
        if (typeof body.id !== "string" || !body.id) throw new Error("Provider acceptance unconfirmed.");
      },
      finish: async (key, claimId, state) => {
        const { error } = await db.from("ops_alerts").update({ state }).eq("key", key).eq("claim_id", claimId).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(1500)]));
        if (error) throw error;
      }
    });
    return response({ status: results.unknown ? "delivery_unconfirmed" : "checked", ...results }, results.unknown ? 502 : 200);
  } catch { return response({ status: "monitoring_unavailable" }, 503); }
}
