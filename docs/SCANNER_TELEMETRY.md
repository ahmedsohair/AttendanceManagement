# Scanner Telemetry: Implementation and Activation

## Status

Implemented locally, default off. No staging or production flags have been changed. Unit/receiver tests are not proof of delivered staging logs, browser-process crash detection, alert delivery, or complete Phase 8 acceptance.

## What Is Collected

While `/scan` is mounted, the optional observer records fixed event categories: React boundary error, window runtime error, unhandled rejection, lookup, mark request, outbox sync request, OCR initialization, OCR prediction, and camera acquisition/track-ended failure. Original exceptions and results pass through unchanged.

Event metrics contain category, outcome (`ok`, `error`, `cancelled`), duration or null, coarse browser family, and coarse device family. User-agent parsing happens locally; the raw string is never sent. These are hints, not proof of device model or rendering engine; iPad desktop mode can appear as `other`. There are no student/room/exam IDs, access codes, tokens, photos, recognized text, error messages, stacks, or arbitrary URLs in the payload. The optional signed-in heartbeat additionally sends the existing browser device ID and bounded pending/conflict counts. The receiver removes the raw device ID before logging/storage and derives a user-scoped HMAC key using `OPS_HEALTH_SECRET` for the service-only heartbeat table.

The receiver logs `scanner.report`, sanitized report content, server reception time and a validated correlation request ID. Infrastructure may separately retain ordinary request metadata such as IP addresses; this application schema does not override provider retention/privacy controls.

## Bounds and Failure Isolation

- In-memory queue only, at most 20 metrics. Never uses the attendance outbox or local persistent storage.
- Up to three samples per event/outcome per minute; OCR prediction only one per outcome/minute. At most two batches/minute with a 30-second flush interval.
- Durations rounded to milliseconds and capped at ten minutes. Missing duration is null.
- Fetch uses same-origin credentials with a three-second abort. Failures, 401s, 429s, and offline sends are dropped, not retried. Unmount discards pending metrics; an in-flight fetch can finish or time out.
- Server accepts only same-origin authenticated admin/invigilator requests, JSON, 8 KiB maximum and 20 strictly validated metrics. Unknown payload keys are rejected. Stream reading has a three-second timeout.
- Server rate limits use a distinct `scanner-telemetry` scope: four reports/user/minute and 240/address/minute. They do not consume login/attendance limiter buckets. Collection adds auth/limiter database traffic when enabled; stage-load-test that cost before production use.
- Errors in the collector never feed the collector recursively. It makes no attendance or incident writes and has no email side effects.

## Measurement Limitations

Lookup/mark/sync durations cover the request coordinator call, not all UI work or outbox disk access. HTTP success is not necessarily a newly saved attendance record; domain outcomes remain in server request logs. OCR initialization combines waiting for engine/model readiness and includes the existing timeout; it does not separate model download from initialization. Prediction duration is inference only. Camera duration covers `getUserMedia`, not every video playback/background recovery path.

This is sampled, lossy diagnostics. Do not derive population failure rates or count connected scanners from event samples. Separate heartbeats describe recently reporting browser/user pairs, not guaranteed connectivity. Offline or suspended clients cannot update their queue counts; old counts are excluded after 90 seconds. Runtime events and React boundary events may describe the same error, so do not sum them as unique crashes. Errors before observer installation, after unmount, before authentication, or during browser-process termination may never reach the server. The reporter cannot prove Safari memory-pressure crashes are absent. Physical-device testing remains required.

## Staging Activation Gate

After the dependency release gate passes and the owner approves staging deployment, configure ONLY the `exampulse-stagings` project:

```text
NEXT_PUBLIC_SCANNER_TELEMETRY_ENABLED=true
SCANNER_TELEMETRY_ENABLED=true
```

Both are boolean configuration values, not secrets. The public flag is compiled into the client, so a new build is required. Without the server flag the endpoint returns 404. These instructions are not permission to push/deploy; no variables were added automatically. Do not use a production-backed local `.env.local` for testing.

Staging verification checklist:

- [ ] Identify the deployed commit and confirm synthetic staging Supabase target.
- [ ] With flags off, no telemetry request is issued and scanner behaviour is unchanged.
- [ ] With flags on, authenticate a synthetic invigilator; a controlled lookup produces a sanitized `scanner.report` within the flush interval.
- [ ] Inspect actual network payload and server log for absence of sensitive data.
- [ ] Trigger controlled boundary/runtime/rejection cases in a test harness; confirm reception without suppressing browser handling or changing recovery controls.
- [ ] Check signed-out, cross-origin, invalid/oversize payload, and rate-limit responses.
- [ ] Block telemetry endpoint and confirm marking, lookup, cancellation, OCR/manual entry, and queue recovery do not wait for it.
- [ ] Compare scanner/API latency and database load with collection on versus off across multiple devices.
- [ ] Test iPhone/Android camera-ended, background/foreground, OCR startup and sustained scanning; preserve prior physical-device acceptance requirements.
- [ ] Disable the server flag to stop reception; rebuild with public flag off to remove client sends if rolling collection back.

## Still Needed to Finish Phase 8

Business route completion timing, the protected health page, bounded shared storage, heartbeats, alert sender/cooldown, and opt-in scheduler are now implemented locally. See `PHASE_8_ACTIVATION.md` for configuration, thresholds, retention, controlled alerts and rollback. No live alert has been sent. Operational-alert recipient remains `ahmad.sohair@gmail.com`.

Remaining acceptance: deploy the approved revision to staging, verify actual telemetry/heartbeat reception and admin-only access, measure monitoring overhead, confirm alert inbox delivery and cooldown, enable and verify independent failure notification, and rehearse the runbooks including session containment. Camera playback/recovery and separate model download timings remain outside current metric coverage. Do not rely exclusively on the failing application's email/telemetry path to announce its own outage.

The npm audit was retried during this implementation and again failed on the registry audit endpoint timeout. No clean security audit or deployment clearance is claimed.
