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

- [x] Access-code verification with a valid dedicated test invigilator (preliminary staging baseline; final 30-sample run still required).
- [x] Assigned-room loading (preliminary staging baseline; final 30-sample run still required).
- [ ] Student lookup for found, not-found, already-marked, and wrong-room cases.
- [ ] Correct-room attendance marking.
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
