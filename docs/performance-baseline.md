# ExamPulse Production Performance Baseline

## Purpose

This document records production timings before hardening work begins. Measurements must be repeated after each performance-sensitive phase using the same method and comparable network conditions.

## Baseline Environment

- Captured: 27 August 2026
- Client location: Sydney, Australia
- Production URL: `https://exampulse.xyz`
- Vercel ingress region: Sydney (`syd1`)
- Vercel function execution region: Washington, D.C. (`iad1`)
- Supabase project region: Singapore
- Deployment state: production commit `be55c6f`

The production response included `X-Vercel-Id: syd1::iad1`, confirming that dynamic requests entered Vercel in Sydney and executed in Washington before reaching the Singapore database.

## Initial Unauthenticated Measurements

These measurements establish the public route and unauthenticated API baseline. They do not replace authenticated scanner workflow measurements.

| Operation | Samples | p50 | p95 | Maximum | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Load `/scan` | 10 | 0.364 s | 0.430 s | 0.430 s | Dynamic HTML, cache miss response |
| Read `/api/auth/me` without a session | 10 | 0.332 s | 1.283 s | 1.283 s | Expected HTTP 401 |
| Reject an invalid access code | 5 | 1.233 s | 2.043 s | 2.043 s | Expected HTTP 401; includes database-backed code lookup |

### Raw Results

`/scan` total request durations in seconds:

```text
0.420069
0.373448
0.343080
0.355875
0.430354
0.362551
0.365840
0.355378
0.372294
0.352347
```

`/api/auth/me` total request durations in seconds:

```text
1.282596
0.331135
0.338900
0.327952
0.330225
0.371968
0.317934
0.339535
0.320885
0.333655
```

Invalid `/api/mobile/access-login` total request durations in seconds:

```text
2.043110
1.414032
1.233495
1.137423
0.694223
```

## Authenticated Workflow Measurements Still Required

### Preliminary Staging Baseline

Captured on 27 August 2026 against `https://exampulse-stagings.vercel.app` using synthetic invigilator `invigilator01@example.com`. Each operation used 15 successful samples from Sydney. Requests entered through `syd1`, executed in `iad1`, and queried staging Supabase in Singapore.

| Operation | Samples | p50 | p95 | Maximum | HTTP status |
| --- | ---: | ---: | ---: | ---: | ---: |
| Valid access-code verification | 15 | 0.593 s | 1.150 s | 1.178 s | 200 |
| Assigned-room loading | 15 | 1.425 s | 1.947 s | 1.949 s | 200 |
| Room live-state refresh | 15 | 3.559 s | 4.244 s | 4.661 s | 200 |
| Student lookup | 15 | 2.117 s | 2.657 s | 2.925 s | 200 |

These are preliminary comparison samples, not the final 30-sample acceptance run. They already demonstrate the cost of multiple Washington-to-Singapore database round trips, especially in room authorization and live-state loading.

### Staging After Singapore Region Alignment

Commit `352af9e` configured the staging Vercel functions for Singapore (`sin1`). Response headers changed from `syd1::iad1` to `syd1::sin1`, while static assets remain globally distributed by Vercel's CDN. The same client, synthetic account, operations, and 15-sample method produced:

| Operation | Samples | p50 | p95 | Maximum | HTTP status | Median improvement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Valid access-code verification | 15 | 0.223 s | 0.250 s | 0.916 s | 200 | 62% |
| Assigned-room loading | 15 | 0.286 s | 0.335 s | 0.476 s | 200 | 80% |
| Room live-state refresh | 15 | 0.495 s | 0.700 s | 0.988 s | 200 | 86% |
| Student lookup | 15 | 0.338 s | 0.370 s | 0.437 s | 200 | 84% |

All 60 measured requests succeeded. Region alignment delivered the expected latency reduction without changing attendance logic. A final 30-sample run remains required before production promotion.

### Staging Acceptance Run

The final API acceptance run used 30 samples per operation after the `sin1` deployment. Attendance marking used 30 distinct, correct-room synthetic students so every sample executed the real successful write path rather than the duplicate shortcut.

| Operation | Samples | p50 | p95 | p99 | Maximum | HTTP status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Valid access-code verification | 30 | 0.210 s | 0.236 s | 0.242 s | 0.602 s | 200 |
| Assigned-room loading | 30 | 0.304 s | 0.396 s | 0.419 s | 0.481 s | 200 |
| Room live-state refresh | 30 | 0.489 s | 0.677 s | 0.746 s | 0.946 s | 200 |
| Student lookup | 30 | 0.393 s | 0.713 s | 0.985 s | 1.041 s | 200 |
| Correct-room attendance marking | 30 | 0.395 s | 0.497 s | 0.533 s | 1.219 s | 200 |

All 150 requests succeeded. The attendance benchmark added 30 deterministic staging attendance records and should be followed by re-running the synthetic seed before unrelated scenario testing.

- [x] Access-code verification with a valid dedicated test invigilator (preliminary staging baseline; final 30-sample run still required).
- [x] Assigned-room loading (preliminary staging baseline; final 30-sample run still required).
- [ ] Student lookup for found, not-found, already-marked, and wrong-room cases.
- [x] Correct-room attendance marking (30 successful synthetic writes on staging).
- [ ] Wrong-room redirect and override.
- [x] Room live-state refresh (preliminary staging baseline; final 30-sample run still required).
- [ ] Admin dashboard loading.
- [ ] Exam detail loading.
- [ ] Cold and warm function invocations identified separately.
- [ ] ONNX model load time on representative Android and iPhone devices.
- [ ] Browser memory behavior during at least 100 consecutive scans.

## Measurement Rules

- Use a dedicated test exam, test invigilator, and synthetic student records.
- Do not benchmark by repeatedly modifying a real active exam.
- Record browser, device, network type, deployment commit, and Vercel region.
- Capture at least 30 samples for ordinary API latency and at least 100 scans for scanner soak behavior.
- Report p50, p95, p99 where the sample size supports it, maximum, error count, and cold-start count.
- Repeat the same measurements immediately after moving functions to Singapore.

## Current Conclusion

The first measurements support region alignment as the lowest-risk initial performance change. Static delivery can remain globally cached while Node.js functions execute in Singapore near Supabase.
