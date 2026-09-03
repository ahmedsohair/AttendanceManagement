import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const expectedAppUrl = "https://exampulse-stagings.vercel.app";
const expectedSupabaseUrl = "https://bjoguceapwquyczbhlyp.supabase.co";
const productionAppUrls = new Set([
  "https://exampulse.xyz",
  "https://attendance-management-admin.vercel.app"
]);
const activeExamId = "10000000-0000-4000-8000-000000000001";
const roomId = (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outputPath = resolve("test-results", "staging-load-summary.json");

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeOrigin(value, name) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must contain only an HTTPS origin.`);
  }
  return parsed.origin.toLowerCase();
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(samples, startedAt, memoryBefore) {
  const durations = samples.map((sample) => sample.durationMs);
  const failures = samples.filter((sample) => !sample.ok);
  const memoryAfter = process.memoryUsage().rss;
  return {
    requests: samples.length,
    failures: failures.length,
    errorRate: samples.length ? failures.length / samples.length : 0,
    durationMs: Math.round(performance.now() - startedAt),
    latencyMs: {
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      maximum: Math.round(Math.max(...durations, 0))
    },
    processMemory: {
      beforeRssMiB: Math.round(memoryBefore / 1024 / 1024),
      afterRssMiB: Math.round(memoryAfter / 1024 / 1024),
      growthMiB: Math.round((memoryAfter - memoryBefore) / 1024 / 1024)
    },
    failureSamples: failures.slice(0, 10).map(({ studentId, status, error }) => ({
      studentId,
      status,
      error
    }))
  };
}

async function signIn(supabaseUrl, publishableKey, invigilatorNumber) {
  const paddedNumber = String(invigilatorNumber).padStart(2, "0");
  const codeNumber = String(invigilatorNumber).padStart(3, "0");
  const sequence = String(invigilatorNumber).padStart(4, "0");
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: `invigilator${paddedNumber}@example.com`,
    password: `AMS-T${codeNumber}-${sequence}`
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Unable to sign in seeded invigilator ${paddedNumber}: ${error?.message || "missing access token"}`);
  }
  return data.session.access_token;
}

async function lookup(appUrl, token, task) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${appUrl}/api/attendance/lookup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        examSessionId: activeExamId,
        roomId: roomId(task.roomNumber),
        studentId: task.studentId
      }),
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json().catch(() => null);
    const requestId = response.headers.get("x-request-id");
    const result = payload?.result;
    const validResult = result?.studentId === task.studentId &&
      ["ready_to_mark", "already_marked"].includes(result?.status);
    const ok = response.ok && requestIdPattern.test(requestId || "") && validResult;
    return {
      ...task,
      ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      error: ok ? null : payload?.message || `Unexpected lookup result ${result?.status || "missing"}`
    };
  } catch (error) {
    return {
      ...task,
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runWorker(appUrl, token, tasks) {
  const samples = [];
  for (const task of tasks) samples.push(await lookup(appUrl, token, task));
  return samples;
}

function assertGate(name, summary, thresholds) {
  const failures = [];
  if (summary.errorRate > thresholds.maximumErrorRate) {
    failures.push(`error rate ${(summary.errorRate * 100).toFixed(2)}% exceeds ${(thresholds.maximumErrorRate * 100).toFixed(2)}%`);
  }
  if (summary.latencyMs.p95 > thresholds.maximumP95Ms) {
    failures.push(`p95 ${summary.latencyMs.p95} ms exceeds ${thresholds.maximumP95Ms} ms`);
  }
  if (summary.latencyMs.p99 > thresholds.maximumP99Ms) {
    failures.push(`p99 ${summary.latencyMs.p99} ms exceeds ${thresholds.maximumP99Ms} ms`);
  }
  if (summary.latencyMs.maximum > thresholds.maximumRequestMs) {
    failures.push(`maximum ${summary.latencyMs.maximum} ms exceeds ${thresholds.maximumRequestMs} ms`);
  }
  if (summary.processMemory.growthMiB > thresholds.maximumMemoryGrowthMiB) {
    failures.push(`RSS growth ${summary.processMemory.growthMiB} MiB exceeds ${thresholds.maximumMemoryGrowthMiB} MiB`);
  }
  if (failures.length) throw new Error(`${name} release gate failed: ${failures.join("; ")}.`);
}

async function main() {
  const appUrl = normalizeOrigin(requireEnvironment("STAGING_APP_URL"), "STAGING_APP_URL");
  const supabaseUrl = normalizeOrigin(requireEnvironment("STAGING_SUPABASE_URL"), "STAGING_SUPABASE_URL");
  const publishableKey = requireEnvironment("STAGING_SUPABASE_PUBLISHABLE_KEY");
  if (productionAppUrls.has(appUrl) || appUrl !== expectedAppUrl) {
    throw new Error(`Load test refused: expected ${expectedAppUrl}, received ${appUrl}.`);
  }
  if (supabaseUrl !== expectedSupabaseUrl) {
    throw new Error(`Load test refused: expected ${expectedSupabaseUrl}, received ${supabaseUrl}.`);
  }

  console.log("Signing in 20 synthetic staging invigilators...");
  const tokens = [];
  for (let index = 1; index <= 20; index += 1) {
    tokens.push(await signIn(supabaseUrl, publishableKey, index));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  console.log("Warming one lookup path per invigilator...");
  const warmupSamples = await Promise.all(tokens.map((token, index) => lookup(appUrl, token, {
    studentId: String(9000001 + (index % 10)),
    roomNumber: (index % 10) + 1
  })));
  const warmupFailures = warmupSamples.filter((sample) => !sample.ok);
  if (warmupFailures.length) {
    throw new Error(`Load test warm-up failed for ${warmupFailures.length} of ${warmupSamples.length} invigilators.`);
  }

  const concurrentTasks = Array.from({ length: 1000 }, (_, index) => {
    const roomIndex = index % 10;
    const invigilatorIndex = roomIndex + (Math.floor(index / 10) % 2) * 10;
    return {
      invigilatorIndex,
      studentId: String(9000001 + index),
      roomNumber: roomIndex + 1
    };
  });
  const tasksByInvigilator = tokens.map((_, index) =>
    concurrentTasks.filter((task) => task.invigilatorIndex === index)
  );
  const concurrentStartedAt = performance.now();
  const concurrentMemoryBefore = process.memoryUsage().rss;
  console.log("Running 1,000 unique lookups through 20 concurrent invigilator workers...");
  const concurrentSamples = (await Promise.all(tokens.map((token, index) =>
    runWorker(appUrl, token, tasksByInvigilator[index])
  ))).flat();
  const concurrentSummary = summarize(concurrentSamples, concurrentStartedAt, concurrentMemoryBefore);

  const soakTasks = Array.from({ length: 200 }, (_, index) => ({
    studentId: String(9000001 + ((index % 100) * 10)),
    roomNumber: 1
  }));
  const soakStartedAt = performance.now();
  const soakMemoryBefore = process.memoryUsage().rss;
  console.log("Running 200 sequential lookups through one representative device session...");
  const soakSamples = await runWorker(appUrl, tokens[0], soakTasks);
  const soakSummary = summarize(soakSamples, soakStartedAt, soakMemoryBefore);

  const thresholds = {
    concurrent: {
      maximumErrorRate: 0,
      maximumP95Ms: 1500,
      maximumP99Ms: 3000,
      maximumRequestMs: 10_000,
      maximumMemoryGrowthMiB: 128
    },
    soak: {
      maximumErrorRate: 0,
      maximumP95Ms: 1000,
      maximumP99Ms: 2000,
      maximumRequestMs: 10_000,
      maximumMemoryGrowthMiB: 64
    }
  };
  const report = {
    capturedAt: new Date().toISOString(),
    appUrl,
    supabaseUrl,
    workload: {
      concurrentInvigilators: 20,
      uniqueStudents: 1000,
      soakScans: 200,
      attendanceWrites: 0
    },
    thresholds,
    concurrent: concurrentSummary,
    soak: soakSummary,
    platformMetrics: {
      databaseConnections: "Record Supabase Database report peak for this timestamp.",
      functionDuration: "Record Vercel Functions p95 duration for /api/attendance/lookup at this timestamp."
    }
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ concurrent: concurrentSummary, soak: soakSummary }, null, 2));
  console.log(`Load evidence written to ${outputPath}`);
  assertGate("Concurrent lookup", concurrentSummary, thresholds.concurrent);
  assertGate("Sequential soak", soakSummary, thresholds.soak);
  console.log("Staging load and soak release gates passed. No attendance data was changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
