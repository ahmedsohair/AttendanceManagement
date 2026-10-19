# Scanner prefetch rollback - 19 October 2026

## Current state

Production is now corrected release `51bb6528438699bd2634ab477835d9f0c35e2948`,
deployment `83vuD9cUDpjqrXX8RB7h4W2eSgk7`, Ready / Production / Current on
https://exampulse.xyz. After reporting the staging test working, the owner
explicitly requested production rollout on 20 October. Candidate gate
`39335059581` and repeat main gate `39338321599` passed. The production project
built from main with its production environment, then the exact staged
deployment was manually promoted to the production domains, undoing Instant
Rollback. No staging artifact was promoted across projects.

Public scanner bundle `/_next/static/chunks/app/scan/page-651ddcf4c05df443.js`
contains early model downloads and Retry, omits the rejected asset overrides,
and references the production Supabase project, not staging. Public login and
authentication guards passed. No database, attendance, account, credential,
email or scheduler changes occurred. Do not clear browser site data/outbox.

Retain prior working release `5e2c182`, deployment `6W36WRbULxgjx8GysDnHrstpZz4j`,
as the application fallback. Never re-promote failed `738d522` merely because it
built successfully. The old immutable dipvm4pm2 URL still serves the old code;
use https://exampulse.xyz/scan for the current production release.

## Historical rollback checkpoint - 19 October 2026

At this checkpoint production had been rolled back to working `5e2c182` deployment
`6W36WRbULxgjx8GysDnHrstpZz4j`. No database restore, attendance/account change,
credential change or email was performed. Do not clear browser site data/outbox.

Vercel Instant Rollback completed and the public /scan HTML references the old
bundle `/_next/static/chunks/app/scan/page-0a05b1a0ed768cc9.js`. That bundle retains
the loading panel and does not contain the new prefetch helper. The failed
deployment `738d522` / `CDshdyXMEcKY7AuT1sd1Pysud4Z1` is retained as incident
evidence, not approved for re-promotion.

GitHub main then still pointed to `738d522`: rollback reassigns production
domains, not Git history. Automatic production promotion was stopped until
rollback removal. Resuming required real scanner validation, which was completed
for the corrected candidate below before the later owner-approved rollout.

20 October test checkpoint: the owner requested a test deployment after the local
browser checks below. `51bb6528438699bd2634ab477835d9f0c35e2948` was pushed only
to `hardening/staging`, not main. Hosted Web release gate `39335059581` passed
all jobs. The staging test deployment is recorded at the end of this report;
that test request alone was not approval to remove production rollback. The
later explicit production request superseded that checkpoint, as recorded above.

## Report and confirmed cause

The owner reported immediate Scanning unavailable / manual-entry guidance after
the prefetch release and said Retry could not be used. The exact device/button
disabled state was not captured. Do not claim the literal disabled-button cause
has been independently reproduced.

The immediate initialization rejection was independently reproduced against the
actual installed PaddleOCR 0.3.2 SDK, without network/model initialization:

`text_detection_model_dir requires text_detection_model_name.`

The candidate passed explicit textDetectionModelAsset/textRecognitionModelAsset
overrides but no matching explicit model names. The library's configuration
resolver rejects this combination before model loading, even when lang and
ocrVersion are supplied. Retrying the same configuration cannot succeed.

The application's prior factory test mocked PaddleOCR.create and accepted the
invalid options. The URL/default-source compatibility test and read-only review
did not exercise the actual SDK configuration resolver. Hosted build/unit gate
success was therefore insufficient to validate scanner startup. This was an
application integration error, not evidence of a phone/network failure.

## Correction initially kept local

Remove the unnecessary explicit asset overrides. Keep the custom fetch hook;
the existing en/PP-OCRv5 defaults resolve to exactly the two prefetched mobile
assets. No model/accuracy, auth, attendance, camera or timeout change is needed.

Three regression checks now use the actual SDK with initialize:false:

- Reproduce the rejected asset-only configuration, without downloading models.
- Run the actual application's worker factory options through the real SDK's
  validator, verifying default model selection, asset URLs and injected fetch.
- Exercise immediate configuration failure and subsequent retry through the
  actual startup functions; the loading guard and error clear correctly.

These are real configuration/resolution tests, not full OCR inference or proof
that the owner's physical Retry-button report is resolved. The corrected source
was initially kept local; production then continued to serve the non-prefetch
working release. See the subsequent staging and production deployment records.

## Evidence and next acceptance

- Actual SDK reproduction and the 26-test startup suite passed locally.
- Full corrected candidate suite: 159 passed, zero failed (shared 14, API 31,
  server-unit 31, scanner 83). Next.js production build, lint/types and static
  generation passed. Mirrored candidate files matched the main checkout hashes.
- Full web/build logs are in the independent dependency checkout under
  `test-results/ocr-preparation-20261019/prefetch-incident-tests.log` and
  `prefetch-incident-build.log`.
- Ignored rollback screenshot in the main checkout:
  `test-results/production-cutover-20261019/prefetch-rollback.jpg`.
- Before another deployment, run the full browser OCR startup with synthetic
  data/camera or a dedicated staging device, including actual model/session
  creation, immediate failure/retry, manual entry, and cold/warm/page-exit cases.
  Do not equate initialize:false configuration tests with this acceptance.
- Ask the owner to reopen https://exampulse.xyz/scan to discard the failed page's
  in-memory code and verify the original scanner again. Preserve persisted queues.

Do not make further production mutations merely to collect better evidence.

## Full local browser follow-up - 20 October 2026

The corrected `51bb652` candidate now passes actual desktop-browser OCR
initialization and recognition, not just initialize:false configuration tests.
At this local-verification checkpoint production remained on `5e2c182`; those
checks did not push, deploy, remove rollback protection, change provider settings
or write live business data. Subsequent deployment records appear below.

### Isolation and evidence scope

- Ran the actual WebScannerApp and actual PaddleOCR/OpenCV/ONNX WASM stack at
  `http://127.0.0.1:3113/prefetch` in the in-app desktop browser, at 1280 x 960.
- Local fixture:
  `C:/dev/AlgoAttendance-scanner-security/test-results/ocr-preparation-20261019/preview`.
  Auth, assigned room, API responses and canvas camera are synthetic. Model
  archives, model/session initialization, preprocessing and prediction are real.
  No real access code or provider credentials were supplied. Attendance writes
  are rejected by the fixture; no mark attempts occurred.
- The harness permits only the two public model archives, the configured ORT
  CDN and embedded OpenCV data bytes. Final runs recorded zero unexpected
  network requests. No persistent site data or offline queues were cleared.
- The initial harness needed an exact auth-module replacement and corrected
  synthetic-number positioning inside the scan region. Those were fixture
  setup corrections, not new application regressions. Its first deny-all
  filter also intercepted embedded OpenCV data bytes; the final filter allows
  them without an external request.
- Application/helper and both changed regression-test files were SHA256-matched
  against the main checkout before acceptance. Scanner tests passed 83/83;
  the full web suite was also rerun successfully: shared 14, API 31,
  server-unit 31, scanner 83 (159 total, zero failed). The earlier production
  build result remains applicable; no application code changed during this
  follow-up.

### Observed browser results

- Opening the scanner starts two model requests before sign-in, with zero
  camera starts. Failed or deliberately pending downloads do not block the
  synthetic sign-in or assigned-room screen.
- Forced HTTP 503 model failures produce the actionable manual-entry state.
  Retry OCR is enabled and clickable after repeated failures; each retry makes
  another bounded attempt. Manual lookup and cancellation of its review work
  during failure, without an attendance submission.
- Enabling public model responses and pressing Retry completes real session
  initialization. Actual OCR reads synthetic `9991001` from the camera image
  and opens the student-review dialog through the normal lookup flow.
- Pausing during initialization stays paused; Resume starts recognition.
  A ready worker survives Back and room re-entry without new model requests.
- On a fresh component mount, two successful speculative requests are reused
  by foreground initialization; there is no second pair of archive requests.
- Unmounting with two held requests pending triggers both abort signals.
  Remounting starts fresh requests and sign-in remains usable. Leaving a room
  during initialization stops its camera track; releasing the held responses
  afterward leaves room selection intact, with no lookup or restarted camera.
  Re-entering that room then uses the ready worker.
- Holding model responses beyond the unchanged 45-second OCR wait shows Still
  preparing, not a false hard failure. Retry is enabled and joins the existing
  initializer without additional archive requests. Releasing those responses
  before the separate 60-second transfer limit completes initialization and
  automatically starts eligible scanning.

Screenshots in the main checkout's ignored
`test-results/ocr-preparation-20261019/` directory:
`full-browser-retry.jpg`, `full-browser-recognition.jpg`,
`full-browser-ready.jpg`, `full-browser-slow.jpg`.

This is not physical iPhone/Safari acceptance, a cache-cold phone benchmark,
an exam-load/capacity result or proof of lower peak memory. Hosted candidate
verification and representative-phone startup/Retry testing remain necessary
before another production promotion. Do not claim the original physical
disabled-button report was reproduced merely because the desktop recovery
checks passed.

## Owner-requested test deployment - 20 October 2026

- Source: `51bb6528438699bd2634ab477835d9f0c35e2948`, hardening/staging.
- Hosted gate: https://github.com/ahmedsohair/AttendanceManagement/actions/runs/39335059581,
  success for quality/build, dependency audit, secret scan and temporary
  migration validation. This did not apply migrations to a hosted database.
- The push triggered an unused production-project Preview build
  `Ez2r3vaoCYFLBgqbT3cV65eJum4A` and staging build
  `13r6W5Uj9zE21wEqWAACQ2Aw8wPf`. The former remained Initializing and the latter
  remained queued through a bounded watch. Both were canceled, not deleted;
  no Ready deployment or production alias was canceled.
- Retried the staging build once using the same commit and existing Build Cache,
  without modifying project/environment settings. Current deployment:
  https://vercel.com/ahmadsohair-1977s-projects/exampulse-stagings/FYDdi12ZS7Awx6xAPkCpvNDxnpEL.
  Immutable URL:
  https://exampulse-stagings-7fbhpseiz-ahmadsohair-1977s-projects.vercel.app.
  Confirmed Ready / Current on the staging project, build duration 1m 41s,
  assigned to https://exampulse-stagings.vercel.app. The environment label
  Production belongs to this separate staging project, not exampulse.xyz.
- Canonical staging /scan returns HTTP 200 and references corrected bundle
  `/_next/static/chunks/app/scan/page-5b5ee5bfd96c83a7.js`. That bundle contains
  both prefetched model URLs and Retry OCR, contains neither rejected explicit
  asset override, and references staging project `bjoguceapwquyczbhlyp`, not
  production project `mtoyhpyxqhfwhcrysqon`. The public browser rendered the
  invigilator login, enabled access-code field and Sign In button without a
  configuration error. No access code was submitted; real hosted camera/OCR
  phone acceptance belongs to the owner.
- Ignored deployment proof:
  `test-results/ocr-preparation-20261019/staging-prefetch-deployment-ready.jpg`.
  Login proof: `test-results/ocr-preparation-20261019/staging-prefetch-login.jpg`.
- Production canonical /scan was independently checked: HTTP 200 and the
  working rollback bundle `page-0a05b1a0ed768cc9.js`. Main remains `738d522`;
  no production promotion, credential change or business-data write occurred.

## Owner-approved production rollout - 20 October 2026

The owner reported the staging candidate working and then said "ok send to
production". This is the authorization for the rollout, not a measured phone
performance result or renewed acceptance of the unrelated iPhone crash report.

- Main was fast-forwarded without force from `738d522` to exact tested
  `51bb652`. Local documentation edits were excluded from the release SHA.
- Repeat main gate:
  https://github.com/ahmedsohair/AttendanceManagement/actions/runs/39338321599,
  success; production build `83vuD9cUDpjqrXX8RB7h4W2eSgk7` Ready in 47 seconds.
- The production-project deployment was initially Staged, with custom-domain
  assignment skipped under rollback mode. Its protected immutable URL rendered
  the scanner login in the authenticated Vercel browser. An unauthenticated
  terminal request to that staged URL redirected to Vercel SSO; that was
  deployment protection, not an application failure. Protection was not disabled.
- Manually promoted that exact production deployment after both build and
  release gate passed. Vercel confirmed Ready / Production / Current with
  exampulse.xyz assigned. Immutable URL:
  https://attendance-management-admin-chhptd9f3.vercel.app.
- Canonical /scan and /login returned 200. The public scanner bundle was
  verified as described in Current state. GET /api/auth/me returned 401,
  GET /health returned 307 to /login?next=%2Fhealth, and unauthenticated POST
  /api/operations/check returned 401 with no-store. The actual canonical
  browser rendered invigilator login with enabled access-code/Sign In controls.
- No production credentials or access codes were entered for these checks,
  and no attendance workflow, roster import, message or database mutation was
  performed. Existing codes, business rules and persisted outboxes are unchanged.
- Application rollback target remains `5e2c182` /
  `6W36WRbULxgjx8GysDnHrstpZz4j`; it was retained, not deleted. No database
  restore is part of reverting this frontend-only optimization.
- Ignored evidence under `test-results/ocr-preparation-20261019/`:
  `corrected-prefetch-production-ready.jpg` and
  `corrected-prefetch-production-login.jpg`.

The production runtime/camera was not exercised with a real phone during this
promotion. Owner staging acceptance and the detailed real desktop OCR checks
remain the stated device/runtime evidence; do not invent cold-start timings,
peak-memory improvements or resolution of the separate iPhone blank-page issue.
