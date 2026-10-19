# Early scanner model downloads - 19 October 2026

**Current production:** corrected `51bb652`, deployment
`83vuD9cUDpjqrXX8RB7h4W2eSgk7`, on https://exampulse.xyz/scan after the owner's
working staging test and explicit production approval on 20 October. Both
candidate gate `39335059581` and main gate `39338321599` passed. Public
scanner-bundle/login/auth-guard checks passed. Previous `5e2c182` is retained
for rollback; failed `738d522` must not be re-promoted.
Read [SCANNER_PREFETCH_INCIDENT_20261019.md](SCANNER_PREFETCH_INCIDENT_20261019.md)
for the incident, correction and current production evidence. Earlier release
success below is historical, not acceptance of the failed configuration.
The corrected local candidate passed real desktop-browser initialization,
recognition, failure/retry and lifecycle checks on 20 October; see the incident
follow-up for isolation details and remaining phone/hosted acceptance.
Staging test link: https://exampulse-stagings.vercel.app/scan. Hosted gate
`39335059581` passed; staging deployment `FYDdi12ZS7Awx6xAPkCpvNDxnpEL` is Ready.
The subsequent production promotion used a separate production-project build,
not this staging artifact. No database/configuration/business-data changes were
made. Physical-phone startup timing/memory measurements remain open.

## Status and owner intent

Implemented after the owner approved downloading model assets as soon as /scan
opens, while preserving the existing login/room/scanner flow. Subsequently the
owner explicitly requested a push so they could test it. `738d522` was deployed
and then rolled back after device testing found an SDK configuration error. No migration,
hosted setting, attendance write, account change or real email is involved.

The owner reported one successful production load of about 30 seconds total,
mostly displaying Models, without Retry. That is a useful observation, not a
controlled benchmark or evidence that downloads caused the entire delay.

## Behavior

- A mount effect on WebScannerApp starts the two existing PaddleOCR 0.3.2 mobile
  model archive downloads before authentication/room selection completes. It
  does not await them or import PaddleOCR, initialize OpenCV/ORT, create model
  sessions, open the camera or start scanning.
- Each URL has a shared in-flight/completed download for this mounted visit.
  PaddleOCR's supported custom fetch receives these same bytes when the camera
  is ready. The corrected local candidate uses the SDK's existing model defaults,
  not explicit asset overrides; actual SDK validation checks the resolved URLs.
  Detection and recognition stay unchanged.
- Only these two fixed public archives are prefetched. Requests use CORS,
  credentials omit and no-referrer, with no access code, token or application
  record in the request. Other SDK requests are not intercepted.
- Speculative failures are handled independently of auth/UI state. A foreground
  consumer can retry a failed speculative transfer once; a genuine foreground
  failure still propagates to the existing OCR recovery UI. No retry loop runs
  in the background. The existing 45-second OCR soft wait remains unchanged.
- Each network request has a 60-second deadline and a 24 MiB streamed byte cap.
  Missing/incorrect Content-Length does not bypass the reader's byte limit.
  Error/oversized bodies are canceled and their controllers aborted.
- Consumed archive references are removed; unconsumed bytes and pending requests
  are released/aborted on component unmount. Strict Mode cleanup cannot revive
  the old downloader. Immutable Blob parts avoid retaining a full raw-JS chunk
  array while assembling a completed archive, but browser peak memory is not
  measured or guaranteed by this implementation.

## Limits and release checks

This is per-visit overlap, not a new persistent Cache API/IndexedDB cache or
service worker. Normal HTTP caching may still apply. A fresh visit can download
about 21.5 MB of model archives even before sign-in, as the owner requested.
Model buffers still cost memory; deferring initialization does not mean zero
memory use. No particular number of seconds saved is claimed.

Login, room selection, manual entry, loading-panel copy, Retry, camera lifecycle,
attendance confirmation/outbox, model selection, WASM/thread settings and the
database/API rules are otherwise unchanged. No extra screen or mandatory task.

For owner acceptance, compare the same public origin on a representative phone:
open /scan, enter a code normally, select a room and time the remaining wait.
Compare immediate room entry against a normal pause for code entry, then a repeat
visit. Verify slow/offline preload does not block login/manual use, Retry works,
and page exit/back/re-entry releases old requests. Do not mark real students for
this check. The prior production `5e2c182` is retained as the application fallback;
a database rollback is not needed for this client-only change.

## Hosted release

- Exact SHA `738d522b16168d4744c2ae9b941648d6968f951b` passed branch release
  gate `39245428897` before main was fast-forwarded from `5e2c182`, without force.
  Repeat main gate `39245689194` passed. No source changes were made between
  those gates and deployment.
- Production Vercel deployment `CDshdyXMEcKY7AuT1sd1Pysud4Z1`, immutable URL
  `https://attendance-management-admin-e6vbltk4c.vercel.app`, reported Ready,
  Production, Current, with `https://exampulse.xyz` assigned; build duration 53s.
- Prior deployment `6W36WRbULxgjx8GysDnHrstpZz4j`, release `5e2c182`, was
  verified Ready before rollout and is the application rollback target.
- Post-deploy canonical checks passed: GET /login and /scan 200, unauthenticated
  GET /health 307 to login, GET /api/auth/me 401, and unauthenticated POST
  /api/operations/check 401 with no-store. The public scanner login rendered.
- The deployed bundle `/_next/static/chunks/app/scan/page-1b9186fc1e65eb1c.js`
  contains early-download code, both unchanged asset URLs, size guards,
  no-referrer configuration and the existing preparation panel. The removed
  unmeasured progress-bar label is absent.
- Evidence: ignored
  `test-results/production-cutover-20261019/prefetch-production-ready.jpg`.
  No new authenticated camera/OCR, memory or speed acceptance is claimed. The
  owner will test on their phone. Use `https://exampulse.xyz/scan`, not the
  previous immutable dipvm4pm2.vercel.app deployment, which cannot update.

## Verification evidence

- Full web suite: 156 passed, zero failed (shared 14, API 31, server-unit 31,
  scanner 80), including 16 new download/lifecycle contracts and the existing
  startup/pause/review/late-readiness regressions. TypeScript passed.
- The final exact-source Next.js 15.5.28 production build passed, including
  compilation, lint/types and static generation. Candidate source hashes matched
  the independent checkout before verification; generated dependency artifacts
  and its previously auto-patched lockfile were not copied into the candidate.
- Independent read-only review confirmed SDK compatibility and no normal-path
  duplicate download race. Its error-body/streamed-cap findings were fixed and
  confirmed, with regressions added. Its memory-copy concern prompted immutable
  Blob parts; actual low-memory device acceptance remains open.
- The actual WebScannerApp mounted in the isolated local preview with a stubbed
  signed-out auth endpoint. Code entry remained editable, Sign In enabled, and
  desktop 1024x900/mobile 390x844 had no horizontal overflow or browser errors.
  No real credentials were entered, no camera/model sessions were started and
  no hosted application API was called. This is not a phone speed benchmark or
  an authenticated end-to-end attendance test.
- Logs in the independent dependency checkout:
  `test-results/ocr-preparation-20261019/prefetch-tests-final.log`,
  `prefetch-model-tests.log` and build logs. Sources were explicitly mirrored;
  no dependency install/prune or environment-file copy was performed.
- Screenshot in the main checkout's ignored directory:
  `test-results/ocr-preparation-20261019/early-download-login.jpg`.

The preview project retains a node_modules junction. Do not recursively remove
it, install/prune through it or copy its generated lockfile/build info to main.
