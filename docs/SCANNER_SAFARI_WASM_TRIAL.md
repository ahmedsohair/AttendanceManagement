# Safari OCR WASM-only trial

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
- Staging CI/deployment verification and the real-device retest are pending.

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

## Rollback

Remove the exact client alias in `apps/admin/next.config.ts`, rebuild and deploy
to staging. No database or business-data rollback is required.
