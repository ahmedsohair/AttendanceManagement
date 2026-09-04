// Uses only explicit scheduler configuration, never repository .env files.
const url = process.env.OPS_CHECK_URL;
const secret = process.env.OPS_CHECK_SECRET;
if (url !== "https://exampulse-stagings.vercel.app/api/operations/check" || !secret || secret.length < 32) {
  console.error("Set the exact staging OPS_CHECK_URL and a 32+ character OPS_CHECK_SECRET.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.json();
    if (response.status !== 200 || body.status !== "checked") throw new Error("Check failed");
    console.log("Staging operational check succeeded. Review Health for provider acceptance and verify the alert inbox separately.");
  } catch {
    console.error("Staging operational check failed or was unavailable. Check Vercel/Supabase independently; do not assume silence means healthy.");
    process.exitCode = 1;
  }
}
