# Early scanner model downloads - 19 October 2026

## Status and owner intent

Implemented locally after the owner approved downloading model assets as soon
as /scan opens, while preserving the existing login/room/scanner flow. Production
remains `5e2c182`; this follow-up has not been pushed or deployed. No migration,
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
  is ready. Its explicit asset descriptors pin the unchanged URLs; tests compare
  them with the installed pinned SDK. Detection and recognition stay unchanged.
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

Before release, compare the same public origin on a representative phone:
open /scan, enter a code normally, select a room and time the remaining wait.
Compare immediate room entry against a normal pause for code entry, then a repeat
visit. Verify slow/offline preload does not block login/manual use, Retry works,
and page exit/back/re-entry releases old requests. Do not mark real students for
this check. Retain production `5e2c182` as the application fallback if authorized
to deploy; a database rollback is not needed for this client-only change.

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
