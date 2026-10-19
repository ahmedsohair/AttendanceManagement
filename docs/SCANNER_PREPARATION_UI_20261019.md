# Scanner preparation UI - 19 October 2026

## Status

Owner-approved refinement of the existing web scanner. Implemented and verified
locally on top of startup-recovery commit `7532cc4`; not pushed or deployed.
Production remains `d869264`. Self-service access recovery is still deferred.

## Experience

- An in-place navy preparation panel with a small student-card/scan-line SVG
  replaces the empty scanning frame while OCR loads. No new dependency, font,
  image download, animation library or canvas renderer is required.
- Engine and Models stages follow actual dynamic-import and OCR-creation
  callbacks. There is no fabricated percentage, countdown or almost-done claim.
- Three useful tips rotate every seven seconds without live announcements.
  Real stage/status changes use a polite, atomic live region.
- A 44-pixel pause control stops both decorative motion and tip rotation.
  Hidden tabs stop these activities; reduced-motion preference leaves a static
  illustration and tip. CSS also removes motion under that preference.
- Use manual entry focuses the existing student-number field. Existing Lookup,
  review, mark, pause and outbox behavior are untouched. No modal loader or
  minimum wait blocks attendance work.
- Long waits explain that setup continues and manual entry is available. Actual
  failures retain recovery guidance without pretending loading is progressing.
- Ready shows a checkmark acknowledgement for about 1.1 seconds, then disappears.
  It has no pointer interaction and does not delay OCR readiness or the scan loop.
  A worker already ready when entering another room does not flash a new loader.

## Verification

- Full web suite: **137 passed**, zero failed: shared 14, API 31, server-unit 31,
  scanner 61. Includes 23 startup/phase regression tests and eight new preparation
  rendering/accessibility-contract checks.
- Final Next.js 15.5.28 production build, lint/type checks and static generation
  passed in the independent dependency checkout. No dependencies were installed,
  pruned or changed. Source files were mirrored only for isolated verification.
- Impeccable's mechanical detector returned no findings for the changed scanner
  UI targets. Independent read-only review found no concrete regressions.
- The actual new component was mounted in a local, synthetic Next.js preview
  with the incumbent scanner CSS at 1024x900, 390x844 and 320x640. No horizontal
  overflow was observed and manual entry stayed enabled. The manual shortcut
  focused its field; the synthetic review hid preparation; slow/error states,
  pause/resume and automatic ready dismissal were checked through normal UI.
- This preview does not run a real camera, model initialization, production API
  lookup or attendance write. Reduced-motion handling was checked through code/
  CSS contracts; no physical-device or assistive-technology acceptance is implied.
  Cold/warm phone load measurements and hosted staging integration remain open.

Ignored screenshot evidence in the main checkout:
`test-results/ocr-preparation-20261019/desktop.png`, `mobile.png` and
`mobile-final.jpg`. These are explicitly local preview images, not production.
Logs and the isolated preview project are under the same dated directory in
`C:/dev/AlgoAttendance-scanner-security/test-results/`.
The preview's node_modules junction must not be installed/pruned or recursively
removed; preserve the workspace/link safety rules.

## Release boundary

No push, deployment, hosted configuration edit, migration, real email or live
business-data mutation occurred. Verify the combined recovery/panel candidate
on an authorized staging deployment with synthetic rooms before any production
update. The loading UI does not reduce model size or certify the unresolved
iPhone restart issue. See [SCANNER_OCR_STARTUP_20261019.md](SCANNER_OCR_STARTUP_20261019.md)
for the cold-start evidence and scoped recovery behavior.
