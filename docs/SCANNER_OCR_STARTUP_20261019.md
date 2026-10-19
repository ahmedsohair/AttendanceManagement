# OCR startup recovery - 19 October 2026

Follow-up: the owner-approved, locally verified loading-panel refinement is
recorded in [SCANNER_PREPARATION_UI_20261019.md](SCANNER_PREPARATION_UI_20261019.md).
It adds truthful phase feedback and lightweight motion, not a model-speed claim.

## Status and scope

The owner approved a focused fix after reporting repeated OCR timeout followed
by near-instant Retry success. The candidate is prepared and tested locally;
it has not been pushed or deployed. Production remains release `d869264`.
No attendance/Auth/API contracts, model versions, dependencies, database schema,
hosting settings, CPU-thread settings or production records were changed.

This fixes startup recovery and truthful state, not model transfer size or a
proven phone performance bottleneck. The separate iPhone blank-page/restart
issue remains owner-deferred and unverified.

## Why a cold load is substantial

Installed PaddleOCR 0.3.2 performs browser-side OpenCV/runtime setup, fetches two
model tar archives in parallel, unpacks them, and creates detection/recognition
sessions. The scanner begins this after camera permission and video playback.
OCR initialization itself does not wait on an attendance lookup/database query.

Evidence from the independently installed dependency checkout:

- Detector archive: `4,830,208` bytes; recognizer archive: `16,712,192` bytes.
  Total `21,542,400` bytes, about 21.5 MB, before transfer compression. These
  sizes came from metadata-only HEAD requests to the exact configured model
  URLs, not full downloads or measurements on the owner's phone.
- The OpenCV dependency embeds its WASM in a roughly 10.38 MB source artifact.
  The final candidate build's largest JS chunk is 10,295,190 bytes raw and
  3,356,949 bytes with local gzip estimation; it contains WASM/base64 and image
  I/O symbols. This gzip size is not a measured Vercel transfer size.
- The locally installed selected ONNX SIMD WASM is 13,022,405 bytes, plus a
  24,180-byte loader. These are local artifact sizes, not a captured phone GET.
  Its CDN HEAD advertised immutable one-year caching.
- The SDK's model loader uses ordinary `fetch` and `arrayBuffer`, without an
  explicit persistent model Cache API/IndexedDB layer. OpenCV/ORT module promises
  and the scanner's worker are retained in memory. Browser HTTP caching may
  still help; a missing Cache-Control header in model HEAD responses does not
  prove those GET responses are uncacheable or that models always re-download.

Implementation evidence: installed
`@paddleocr/paddleocr-js/dist/index.mjs`, especially `loadModelAsset` and
`initialize`, in `C:/dev/AlgoAttendance-scanner-security/apps/admin/node_modules`.
Only three bounded public asset HEAD checks were made. Their desktop latencies
are not a phone download benchmark. No production browser/network timing trace
has isolated module loading, model transfer, unpacking or session creation on
the affected phone. Do not claim the backend is slow or that caching is fixed.

## Candidate change

- Keep the existing 45-second wait deadline. The shared initializer continues
  after that deadline; Retry reuses it rather than creating duplicate workers.
- Publish worker readiness as React state. An effect resumes the scan loop only
  for an active, signed-in room with a live camera in a visible tab, outside
  pause/student review. Normal resume handles paused late readiness.
- Separate OCR load warnings from attendance/backend messages. Late readiness
  clears only OCR's warning. A later actual initialization failure replaces a
  stale still-loading warning with its classified error.
- Guard camera acquisition/playback and Retry callbacks by camera generation;
  release a stream returned after room exit instead of reviving the old camera.
- Replace the unverified 20-40 second startup estimate and connection-blaming
  timeout copy with phase descriptions and the available manual-entry option.
- Do not move heavyweight initialization earlier, add a persistent cache,
  change WASM/GPU/thread configuration, or replace models in this patch. Those
  changes may affect iPhone memory and need separate measurement/acceptance.

## Verification

- Full web suite: **128 passed**, zero failed: shared 14, API 31, server-unit 31,
  scanner 52. The scanner total includes 22 new controlled startup regressions.
- Admin TypeScript check passed. Final candidate Next.js 15.5.28 production
  build, lint/type checks and static-page generation passed.
- Regression tests extract the actual component functions/effect body and
  substitute timers, state setters, camera promises and model initialization.
  They cover late readiness, Retry timing, actual late rejection, stream end,
  room exit, pause/review/background, teardown/disposal and camera/playback races.
  They do not mount React or replace a real browser/physical-phone test.
- Independent review found a late-failure messaging gap; it was corrected and
  re-reviewed with no remaining correctness findings. Ended/released-stream
  late-rejection tests were then added.
- Exact source changes were mirrored only into the clean independent dependency
  checkout for validation, without installing/pruning shared dependencies or
  reading local environment files. Provider/database/mail environment settings
  were blanked in validation processes; no live service checks were performed.
  That checkout retains the five mirrored candidate files, generated build info
  and an auto-patched lockfile from the first Next build. The lockfile/build info
  are not candidate changes and must not be copied back or committed. Subsequent
  builds used `NEXT_IGNORE_INCORRECT_LOCKFILE=1`. No checkout/link cleanup ran.

Local ignored logs in the dependency checkout:
`test-results/ocr-startup-20261019/web-tests-final.log` and `build.log`.
The old timeout reproduction fixture is historical evidence; use committed
`apps/admin/tests/scanner-ocr-startup.test.mjs` for the patched behavior.

## Before deployment and further optimization

Use an authorized staging deployment and synthetic invigilator/room, then check
cold and warm startup on representative Android and iPhone browsers. Confirm
automatic late readiness, manual lookup during loading, pause/review preservation,
Back, camera restart and background/foreground behavior. Do not treat local
controlled tests as a successful physical iPhone retest.

For a speed improvement, capture stage/resource timings and cache hits first.
Evaluate versioned persistent model caching and asset delivery separately from
earlier loading/preload or smaller-model options, preserving memory limits,
recognition accuracy, camera lifecycle and offline attendance safety. Do not
increase the timeout alone and report that as a speed optimization.
