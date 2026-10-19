# Safari OCR WASM-only trial

Current follow-up: [SCANNER_OCR_STARTUP_20261019.md](SCANNER_OCR_STARTUP_20261019.md)
records the locally verified timeout/late-readiness recovery candidate and
asset-size investigation. It is not deployed or a successful physical iPhone
retest; the earlier report and reproduction below are historical baselines.

## Report - 18 October 2026

- Device: iPhone 14 Pro, iOS 18.3.2, Safari.
- Environment: `https://exampulse-stagings.vercel.app/scan`.
- Owner reports that opening a room loads for a few seconds, goes blank, then
  returns to room selection. No "Returned to room selection." message reported.
- Baseline staging release recorded as `45731b1`. The device's downloaded asset
  identity was not captured, so this is reported environment evidence, not a
  verified device trace of that SHA.
- A page restart is consistent with the symptom: selected room is component
  state, while the authenticated session can survive a reload. Browser-process
  termination or memory pressure remains a hypothesis, not a confirmed cause.

## Evidence and bounded change

- PaddleOCR.js 0.3.2 dynamically imports `onnxruntime-web`.
- The lockfile and installed dependency resolve ONNX Runtime Web 1.26.0. Our
  configured CDN version is also 1.26.0; no version mismatch was found.
- The default browser bundle references `ort-wasm-simd-threaded.jsep.*`.
  Configuring `backend: "wasm"` selects the execution provider but does not select
  the WASM-only JavaScript entry point.
- Add an exact browser Webpack alias from `onnxruntime-web` to
  `onnxruntime-web/wasm`. No dependency changes, model changes, batching changes,
  camera changes, backend changes, or migration are part of this trial.
- All scanner clients already request the WASM execution provider. The alias
  applies consistently to the web client rather than adding user-agent logic.
- The library also initializes its detection and recognition models concurrently.
  That is a separate possible contributor; it is deliberately unchanged so this
  trial tests one variable.

Upstream references:

- https://onnxruntime.ai/docs/tutorials/web/deploy.html
- https://github.com/microsoft/onnxruntime/issues/26827

The upstream crash reports primarily concern newer iOS/WebKit versions. They
justify a targeted trial but do not establish the cause on iOS 18.3.2. Desktop
browser testing cannot establish that this physical-device failure is fixed.

## Verification

- Isolated admin production build passed, including lint/type validation.
- Inspected every emitted browser JavaScript chunk: runtime chunk
  `7925.a324dcbc79a6ac52.js` references `ort-wasm-simd-threaded.wasm` and the plain
  `.mjs` loader. No JSEP, asyncify or JSPI runtime artifact references were found
  in browser chunks. The hashed plain WASM build asset is also emitted.
- Existing web regression suite: 93 passed (14 shared, 29 API/monitoring,
  20 server, 30 scanner).
- Existing real-scanner B3 browser suite: 8/8 passed with the production Next
  configuration. API calls and camera permission are mocked by that fixture;
  this verifies manual/review/back/error behavior, not successful OCR inference
  or physical iPhone memory behavior.
- No environment files copied. Build environment service variables cleared;
  browser fixture uses synthetic local configuration. No live business writes.
- Reproduce browser suite from the isolated worktree with
  `NODE_PATH` set to `apps/admin/node_modules`, `CIRCLE_NODE_TOTAL=2`, and
  `npx.cmd --no-install playwright test --config playwright.b3.config.mjs --timeout=120000`.
- Staging CI/deployment verification completed as recorded below. The real-device
  retest remains pending.

## Separate release-gate prerequisite

- Initial runtime-only commit: `e13c1cc`. GitHub run `39109255807` failed the
  critical dependency audit; the Vercel staging deployment also reported failure.
  Do not ask the owner to test that deployment as a verified release.
- Fresh npm audit found critical advisories affecting Next.js 15.5.21 and
  shell-quote 1.8.4. These findings are unrelated to the OCR alias and were not
  waived. A separate companion commit updates Next.js within the 15.5 line to
  15.5.28 and pins the shell-quote override to 1.11.0.
- Lockfile changes are limited to Next.js and its matching env/SWC packages,
  plus shell-quote. PaddleOCR and ONNX versions remain unchanged. This companion
  changes the framework, so the deployed trial is not a perfectly isolated
  one-variable comparison against the September build; preserve that limitation
  when interpreting the phone result.
- Fresh independent `npm ci --ignore-scripts --no-audit --no-fund` completed.
  The critical audit gate, all 93 web tests, the production build with lint/type
  checks, and all eight B3 browser tests passed again with Next.js 15.5.28.
- Reinspected the patched production browser output: chunk
  `3267.7a2682fd750804ff.js` references the plain WASM binary and loader. No
  extended runtime artifact references were found. Model/library versions remain
  unchanged. Hosted verification subsequently passed as recorded below; the
  physical retest is still required.
- Other advisory severities remain for separate triage.
- Dependencies are installed in `C:/dev/AlgoAttendance-scanner-security`, which
  has independent dependency directories. Main and older worktree shared
  dependency directories are not updated or removed.

## Physical retest and release gate

Use the staging URL and synthetic exam/student data. Record the deployment SHA
and confirm the browser loads the current deployment before comparing results.

1. Open staging in a fresh Safari tab and sign in. Select a room and wait for
   OCR readiness; note the last visible loading message if it fails.
2. Confirm that scanning a synthetic ID and manual lookup both work. Complete
   ten consecutive lookups. Record any blank page, reload, or room reset.
3. Return to room selection with the on-screen control and reopen the room twice.
   Confirm OCR remains usable without duplicate initialization or a reset.
4. Background/foreground Safari, then lock/unlock the phone and check recovery.
5. Repeat the core scan/manual flow on Android to check for a runtime regression.

Do not label the iPhone issue fixed or approve production promotion until the
reported device passes. Capture a screen recording and Safari/WebKit diagnostics
if it still fails; the next controlled comparison is camera/manual operation
without OCR initialization. Do not mask restarts by automatically reentering the
room and reloading the failing runtime.

## Staging deployment verified - 18 October 2026

- Runtime change `e13c1cc` and separate security prerequisite `9d53294` are
  integrated on `hardening/staging`. Deployed trial SHA:
  `9d5329478e0a1df06e8725badca7c30f68e802ac`.
- GitHub run `39109782219` passed all five jobs: critical dependency audit,
  type-check/tests/build, secret scan, temporary database migrations and release
  gate. https://github.com/ahmedsohair/AttendanceManagement/actions/runs/39109782219
- Vercel staging deployment `4EEpPXm55RQU9qh5b581nTy1XzPb` reports success.
  https://vercel.com/ahmadsohair-1977s-projects/exampulse-stagings/4EEpPXm55RQU9qh5b581nTy1XzPb
- `/scan?trial=9d53294` returns HTTP 200. Followed the hosted scan page's dynamic
  import to PaddleOCR chunk `1313.440bc242dc8bfd13.js`, which requests runtime
  chunk 3267. The hosted Webpack map resolves that chunk to
  `3267.cb68457c951f0744.js`; its HTTP 200 response references the plain
  `ort-wasm-simd-threaded.wasm` and `.mjs` loader, with no extended runtime
  artifact reference. The deployed hash differs from the Windows local build;
  verification used the hosted dependency chain, not the local filename.
- This is build/deployment artifact verification, not successful OCR inference
  on the affected iPhone. Physical acceptance remains failed/pending retest.
- Owner retest link:
  https://exampulse-stagings.vercel.app/scan?trial=9d53294
  Close the old scanner tab and use a fresh Safari tab on the same phone and OS.
  The query label helps distinguish this test link; it is not a runtime feature
  flag or proof of the cached device's downloaded build identity.
- No production branch push/promotion, live business-data mutation or migration.
  Main checkout dependencies remain older than the updated manifest; use the
  independently installed security worktree for exact-version local verification.

## Rollback

Remove the exact client alias in `apps/admin/next.config.ts`, rebuild and deploy
to staging. No database or business-data rollback is required.

## OCR timeout follow-up - 19 October 2026

The owner again reports a slow OCR load, timeout, then near-instant success on
Retry. Source inspection of production release `d869264` finds a 45,000 ms
deadline in `web-scanner-app.tsx`. `withTimeout` uses `Promise.race`; it does not
abort the original `PaddleOCR.create` operation. `loadOcrWorker` retains the same
in-flight promise, and Retry awaits that promise rather than necessarily starting
a new download. This explains how quick retry completion is possible. The exact
slow stage on the owner's phone has not been measured.

There is also a late-completion lifecycle gap: the success callback stores the
worker but does not start the scan loop or clear the earlier timeout message.
If that happens before Retry, `retryOcrLoad` returns immediately because the
worker exists. The Retry control can also disappear on a subsequent render.
Camera resume/reentry has separate loop-start paths; do not describe this as
proof of a permanent failure or as the cause of the iPhone process-reset report.

A local controlled reproduction extracted the actual timeout, loader and Retry
functions from source, stripped TypeScript annotations with Node's built-in
utility, and substituted only dependencies plus a 5 ms test deadline. Both
timing paths reproduced: Retry while pending reuses one initializer and starts
the loop; completion before Retry stores the worker but leaves the loop stopped,
and Retry returns without starting it. Ignored fixture:
`test-results/ocr-startup-20261019/reproduce-timeout.mjs`.
This is a lifecycle reproduction, not mobile performance/network/inference data.

Track the scoped fix and representative cold/warm timing checks in
[FUTURE_TODOS.md](FUTURE_TODOS.md). Manual access-code recovery remains explicitly
deferred until after the exam; scanner startup is a separate near-term issue.
No runtime source, dependencies, timeout value, hosted configuration or production
business data changed during this investigation. Earlier physical-device release
gates in this historical trial are superseded by the owner's explicit rollout
deferrals in [PRODUCTION_CUTOVER_20261019.md](PRODUCTION_CUTOVER_20261019.md), not
by a newly successful iPhone test.
