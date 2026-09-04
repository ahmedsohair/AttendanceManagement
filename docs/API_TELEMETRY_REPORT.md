# Local API Telemetry Report

Phase 8 diagnostic tool, not a live dashboard or alert service. It reads a local export only; it loads no `.env` files, contacts no backend, and changes no attendance data. No production log export has been verified with this tool yet.

## Input and Use

Requires the project's Node 22 runtime with TypeScript stripping. Supply UTF-8 JSONL, one application JSON log object per line, up to 10 MiB / 50,000 nonblank lines. Keep real exports outside the repository in restricted storage.

```powershell
npm.cmd run telemetry:summary -- "C:\Users\ahmad\ExamPulseLogs\requests.jsonl"
```

For machine-readable stdout without npm's script banner:

```powershell
node --experimental-strip-types .\scripts\summarize-api-telemetry.mjs "C:\Users\ahmad\ExamPulseLogs\requests.jsonl"
```

Input records are the `api.request` JSON messages emitted by the application. Provider exports that wrap those messages require explicit extraction of the message JSON first. Arbitrary prefixed text, nested provider envelopes, and legacy `[perf]` lines are not auto-parsed. Do not pass a log viewer screenshot or assume every provider export is compatible.

Use a single environment, deployment and known time window per input file; record those outside the summary. The current event schema does not contain event timestamps or deployment IDs, so the tool cannot verify that isolation or filter a time window. Do not combine overlapping exports. Request IDs are not guaranteed globally unique and are not used to deduplicate; every valid completion record counts once.

## Meaning

- Groups are route, HTTP method, and region. Dynamic route IDs remain `:id` and unknown regions remain `unknown`.
- Latency uses nearest-rank p50/p95/p99 on available valid durations, with sample/missing counts. Zero latency is valid; absent durations produce null percentiles, not zero. Small samples cannot establish reliable tail latency.
- Server error rate is HTTP 5xx completions divided by all accepted completions in that group. Authentication failures (401), forbidden (403), rate limits (429), all 4xx responses, and partial responses (207) are separate counts. These categories overlap where stated: 401/403/429 are included in total client errors.
- Outcome codes remain visible: `already_marked`, `wrong_room`, and `student_not_found` are not automatically treated as server failures. A 207 email partial failure is not silently counted as complete success.
- Separate `api.error` logs are ignored to avoid double counting alongside completion logs. Ignored count also includes unsupported/malformed records; malformed JSON lines are counted separately and included in ignored records.
- Output contains aggregate counts and allowlisted dimensions only, not request IDs, payloads, recipients, raw errors, student IDs, or query strings. The original input export may still contain sensitive data and must be handled accordingly.

Exit 0 means at least one valid request record was summarized, NOT that the system is healthy. Exit 2 means no usable completion records; exit 1 means input/usage failure. Always check accepted, ignored, malformed and missing-duration counts before interpretation. A process crash or lost log may produce no completion event and is invisible to these rates. This is not an independent availability check, full-request census, client performance measurement, or database latency breakdown.

## Validation and Remaining Work

Automated tests exercise percentile math, error/outcome separation, safe dimensions, missing samples, regions, CLI input failure, and a synthetic lookup/mark fixture. Tests are part of `npm.cmd run test:web`.

Still required: verify actual staging exports, complete route/client instrumentation, decide retention and time-window handling, build the operator-facing health view, configure notifications and thresholds from measured baselines, and prove alerts with controlled failures. None of those are marked complete by this report.
