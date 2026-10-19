# Future improvements

Recorded 19 October 2026. This backlog is not deployment approval. Current
production acceptance is in [PRODUCTION_CUTOVER_20261019.md](PRODUCTION_CUTOVER_20261019.md).

## Invigilator self-service access recovery

Status: owner-deferred until after the exam. Keep administrator-controlled
replacement for now; existing active codes and assignment emails stay unchanged.

- Add Forgot your access code? to scanner login and a recovery link in assignment
  emails, so lost-code requests do not always require the travelling owner.
- Verify control of the existing registered email using an expiring, single-use
  recovery token. Do not change a working code merely on an unverified request.
- Rate-limit by account and requester, return non-enumerating responses, prevent
  replay/concurrent activation, and audit issuance/activation without logging
  codes or tokens. Do not store recoverable plaintext codes to enable resending.
- Preserve assignments, attendance/audit history and the explicit compromised-
  account containment procedure. Define existing-session behavior deliberately.
- Test unknown addresses, expired/reused links, repeated requests, mail failure,
  interrupted activation and existing-code validity before deployment.

Likely scope: scanner login, instruction-email template, recovery endpoint/UI,
mail transport, Auth/code lifecycle and security/integration tests. It is not
just a copy change. No implementation or production access change is authorized
by this backlog entry.

## OCR startup timeout and late readiness

Priority: near-term scanner reliability investigation; higher urgency than
self-service recovery. The owner reports repeated timeout followed by near-
instant success on Retry. This is separate from the unresolved iPhone blank-
page/process-restart report; one does not prove the cause of the other.

- Current deadline is 45 seconds around dynamic module loading and PaddleOCR
  initialization. It stops the caller waiting but does not cancel initialization.
- Retry reuses the same pending promise. This can explain a fast retry without
  proving that the network, compilation or model-session creation caused the
  original delay on the affected phone.
- Source-level reproduction confirms a second timing case: if initialization
  finishes after timeout but before Retry, the worker is stored without starting
  the scan loop; Retry then returns early because that worker exists. Other
  camera-resume actions can start it later, so this is a lifecycle gap, not proof
  of a permanently unusable scanner on every device.
- Make late readiness recover coherently while the current room/camera remains
  eligible. Clear stale errors, preserve manual mode/pause and hidden-tab rules,
  and do not start scanning after room exit, logout, teardown or cancellation.
- Measure cold/warm startup stages on representative phones before claiming a
  speed improvement: module import, runtime/model transfer and initialization.
  Consider delivery/cache/preload changes only after identifying the bottleneck;
  no new heavyweight background initialization or model change by default.
- Keep one in-flight initializer, manual lookup, attendance confirmation/outbox
  and server-side business rules unchanged. Increasing the timeout alone does
  not fix the lifecycle gap or make the model load faster.
- Verify delayed success before/after timeout and Retry, genuine failure/retry,
  manual-mode interaction, background/foreground, room changes and teardown.

Likely scope: `apps/admin/src/components/web-scanner-app.tsx`, OCR runtime helper,
scanner lifecycle/browser tests and coarse timing diagnostics. No scanner code,
dependencies, timeout value or deployment was changed in this investigation.
See [SCANNER_SAFARI_WASM_TRIAL.md](SCANNER_SAFARI_WASM_TRIAL.md) for the source
analysis and reproduction scope.
