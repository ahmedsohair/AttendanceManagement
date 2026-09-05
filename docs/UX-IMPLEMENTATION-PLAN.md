# ExamPulse UX Implementation Plan

## Status and Scope

- Status: user approved implementation beginning with B1 on 5 September 2026; each batch requires review and verification before staging integration.
- Prepared: 4 September 2026. Source: `docs/UX-AUDIT.md`, UX-01 through UX-14.
- Checkout: `C:\dev\AlgoAttendance`, `hardening/staging`, baseline `84c770da1890fee3f06b82efd03c1f3ee4a0a47f`.
- Scope: existing Next.js admin portal and web scanner. Native iOS/Android applications remain excluded.
- Audit evidence combines deployed-staging observations and baseline source inspection. The deployed SHA is unknown; exact-checkout runtime and physical-device verification remain incomplete. This plan does not upgrade those observations into release acceptance.
- Implementation owner: coding agent after approval. User supplies safe test access and physical-device acceptance. Each batch remains open until its verification evidence is recorded.
- Phase 8 observability and the unresolved dependency-audit release gate are separate workstreams. UX work does not require a new monitoring platform and must not bypass the existing release gate.

## Design Constraints

### Agreed Sequencing

Updated user decision (5 September 2026): begin UX/UI work while the remaining Phase 8 operational checks are pending. This supersedes the earlier sequencing preference to finish Phase 8 first. Phase 8 remains open; this does not waive the release gate or deferred physical-device acceptance.

Implement behaviour-sensitive UX repairs under the main agent's supervision, starting with B1 in a separate worktree. Use Impeccable for subsequent bounded visual polish, with before/after screenshots. Preserve ExamPulse's identity and core functionality. Review diffs and regression tests before integration; the delegated agent must not independently deploy or change business rules, API contracts, scanner lifecycle, or dependencies without review. Start scanner identity binding before polishing that review interface.

Preserve the established brand, typography, colors, card vocabulary, and page structure. This is workflow repair, not a redesign.

Preserve lifecycle grouping, count-to-audit links with exam scope, URL-based filters/pagination, semantic tables, expected versus actual room distinctions, searchable staff checkboxes, native details/summary disclosures, visible focus, and explicit save/dirty feedback. Keep the mobile admin navigation row.

For scanners, preserve recognizable result categories, manual lookup during OCR initialization, connection/outbox status, visible room context, camera lifecycle safeguards, browser Back handling, and rapid next-student recovery. Do not restore blocking live-state refreshes after marking.

Attendance uniqueness, atomic transactions, idempotency, outbox ownership/retries, redirect incident recording, mismatch semantics, code activation, authorization, and email delivery must not change. Only UX-01 requires a confirmed server-side change: repair a scoped read-model hydration gap. UX-10 may need minimal prerequisite data passed to the existing view, not new publication rules. No schema migration is currently justified.

## Evidence and Estimation

Source checks confirm that `readExamSessionStoreFast` omits assignment hydration while `readExamSetupStoreFast` supplies it; the scanner review input changes `studentId` without invalidating `lastLookup`; and `UpdatePasswordForm` does not terminate the no-session check. Other findings retain the audit's evidence strength and require focused reproduction during implementation.

Effort is engineering time including targeted tests and review, excluding credentials, deployment waits, and physical-device scheduling. S = about 0.5-1 day; M = 1-2 days; L = 2-4 days. Ranges are estimates, not commitments. Per-finding estimates overlap within batches and must not be added mechanically.

Risk describes regression exposure, not audit severity: low = presentation/local semantics; medium = asynchronous UI, shared layout, authentication lifecycle, or scoped data hydration. No finding is downgraded because its implementation looks small.

## Finding-to-Implementation Map

All paths below are relative to the checkout. Component filenames without a directory are under `apps/admin/src/components/`.

| Finding / audit severity | Actual workflow | Primary type; secondary type | Likely files / boundary | Dependencies | Intent skills | Risk / effort | Batch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 / P1 | Admin inspects and changes an exam's existing room staffing | State/error handling; workflow/interaction | `apps/admin/src/lib/repository.ts` (`readExamSessionStoreFast`, `userWithAssignments`), `apps/admin/app/sessions/[id]/page.tsx`, `exam-assignment-wizard.tsx` | None; must precede trustworthy UX-10 readiness calculations | blueprint, fortify | Medium / M | B2 |
| UX-02 / P1 | Invigilator corrects OCR/manual ID and acts on the review | State/error handling; workflow/interaction | `web-scanner-app.tsx`: lookup, review edit, mark/redirect/override handlers; scanner request tests | None; prerequisite for UX-06 and safe review interaction work | journey, fortify | Medium / S-M | B1 |
| UX-03 / P2 | Identify fields during setup, scanning, filtering, staff management, and recovery | Accessibility; UX writing | `new-exam-import-form.tsx`, `exam-assignment-wizard.tsx`, `web-scanner-app.tsx`, login/recovery forms, `apps/admin/app/{attendance,incidents,mismatches,invigilators}/page.tsx` | Scanner labels follow B1 state semantics; layout coordinated with UX-04, dialog with UX-05 | include, articulate | Low-Medium / L across all surfaces | B2-B5, explicitly partitioned below |
| UX-04 / P2 | Admin finds assignment/filter controls on phone or narrow desktop | Responsive design; accessibility | `apps/admin/app/globals.css`, assignment wizard, incidents/audit page wrappers | UX-03 label layout; assignment snapshot fixes verified before layout acceptance | transpose, include | Medium / M | B2 assignment area; B4 audit/shared containment |
| UX-05 / P2 | Enter, navigate, cancel, and leave a scanner review sheet | Accessibility; workflow/interaction | `web-scanner-app.tsx`, `.web-review-sheet` in `apps/admin/app/globals.css` | B1 action-state contract; coordinate UX-08 and scanner portion of UX-03 | include, journey, fortify | Medium / M | B3 |
| UX-06 / P2 | Compare returned identity with the presented student card | Workflow/interaction; information architecture | `web-scanner-app.tsx`, existing `LookupResult` allocation fields | UX-02 must bind the rendered identity to eligibility | journey, articulate | Low / S | B1 |
| UX-07 / P2 | Follow team-leader direction for a wrong-room student | Workflow/interaction; UX writing and visual emphasis | `web-scanner-app.tsx`, wrong-room action group | UX-02 action binding; UX-06 identity context | journey, articulate | Low / S | B1 |
| UX-08 / P2 | Submit access code/manual lookup using Enter | Workflow/interaction; accessibility | `web-scanner-app.tsx`, login/manual/re-lookup groups | UX-02 guards; UX-05 focus/cancel behaviour | journey, include | Low-Medium / S | B3 |
| UX-09 / P2 | Recover admin access with missing/invalid or delayed session context | State/error handling; UX writing | `update-password-form.tsx`; inspect `apps/admin/app/auth/callback/route.ts` contract before changes | None; coordinate authentication labels in UX-03 | fortify, articulate | Medium / S-M | B5 |
| UX-10 / P2 | Decide whether an empty/incomplete draft is ready to publish | State/error handling; UX writing | `exam-assignment-wizard.tsx`, exam detail and setup caller, existing publication validation | UX-01 for committed staffing truth; use known data, not fabricated readiness | fortify, articulate | Low-Medium / S-M | B2 |
| UX-11 / P2 | Dismiss a duplicate/not-found result without losing apparently saveable notes | Workflow/interaction; UX writing | `web-scanner-app.tsx`, textarea and `resetForNextScan` | UX-02 review-state model; coordinate cancellation in UX-05 | articulate, journey | Low / S | B1 |
| UX-12 / P3 | Open scanner signed out versus lose an established session | UX writing; state/error handling | `web-scanner-app.tsx`, bootstrap and unauthorized handling | Coordinate B3 login form; do not treat service failure as signed-out success | fortify, articulate | Low-Medium / S | B3 |
| UX-13 / P3 | Understand when a duplicate student was already marked | UX writing; visual design/polish | `web-scanner-app.tsx`, `apps/admin/src/lib/audit-time.ts` | None; bundle with duplicate-state presentation, not a global date rewrite | articulate | Low / S | B1 |
| UX-14 / P3 | Locate mismatch investigation within Attendance and return to exam context | Information architecture | `admin-nav.tsx`, `apps/admin/app/mismatches/page.tsx`, existing audit-page breadcrumb pattern | No functional dependency; verify alongside audit filters/layout | organize | Low / S | B4 |

UX-03 is one audit finding with four delivery slices, not four new findings. It is complete only after B2 setup, B3 scanner, B4 audit filters, and B5 account/staff fields all pass. UX-04 is complete only after both assignment and audit containment pass. No batch is grouped solely by severity.

## B1. Trustworthy Student Review

1. **Goal:** ensure the student shown, eligibility shown, and action target always agree, with enough context for a quick card comparison.
2. **Findings:** UX-02 (P1), UX-06/07/11 (P2), UX-13 (P3).
3. **Intent:** journey for the correction/action flow; fortify for races and failures; articulate for exceptions and timestamps.
4. **Screens/workflows:** `/scan`, ready, wrong-room, duplicate, not-found, edited and failed re-lookup states.
5. **Likely files:** `web-scanner-app.tsx`; `apps/admin/src/lib/audit-time.ts` only if safe reuse needs a narrow adapter; scanner request/runtime tests and focused browser tests. No API changes expected.
6. **Proposed changes:**

- Bind each accepted review to normalized student ID, selected room/exam, and request generation. Editing invalidates actionable eligibility immediately; changing the ID back does not silently revive an old review.
- Present an explicit edited state: "Student number changed. Look up again before marking attendance." Disable consequential actions in rendering AND guard handlers against stale results, empty IDs, pending requests, or mismatched context.
- Build normal mark, redirect, and override requests from the same reviewed identity. Reject mismatched overrides; preserve the current fingerprint and idempotency rules.
- Discard results/finalizers from an older lookup after edits, cancellation, room changes, or newer requests. This includes stale `busy`/pending updates, not just stale result text.
- Show returned name and canonical ID, plus allocated zone; show expected room for wrong-room results. Do not fetch extra identity information or invent a name where absent. Show "Name unavailable" / "Zone unavailable" as needed.
- Make "Send to [expected room]" the primary wrong-room action. Use "Mark present in [current room]" for the exception, with "Records a room mismatch; the assigned room stays unchanged." Add concise direction to consult the room team leader. Do not introduce a team-leader role or approval system.
- Show comments only while preparing an action that actually saves them. Preserve the draft through an ID correction/re-lookup; when a result has no save action, hide the editor and explain that any retained draft note is not saved by Continue Scan. Clear it at next-student reset as today. Never silently imply the duplicate/not-found note has been recorded.
- Format duplicate time using the existing Australia/Sydney convention, including date and explicit timezone context. Handle invalid timestamps without a render crash. Do not change stored timestamps or add a backend request.

7. **Must remain unchanged:** normal one-click marking after a valid lookup; redirect/override capabilities and server validation; no auto-mark on lookup; comments on valid writes; OCR source attribution, outbox durability, idempotency, and next-student latency.
8. **Risk / effort:** medium / 2-3 days. Risk comes from shared scanner state and async request ordering, not the added identity text. Implement identity guards before presentation changes within this batch.
9. **Verification criteria:**

- Ready A -> edit B disables every mark/redirect/override immediately; direct handler invocation cannot send a stale request. Repeat from wrong-room A and after changing back to A.
- Re-lookup B produces a review/action body consistently targeting B. A delayed response for A cannot overwrite B or re-enable eligibility. Room switch, Cancel, lookup failure, and repeated clicks do not resurrect old state.
- Correct-room, wrong-room, missing-name/zone, duplicate, and not-found states render accurate identity context. No new lookup call is required to display it.
- Comments survive intended re-lookup, persist on the existing write paths, and are not offered as saveable on dismissal-only outcomes. Continue Scan performs no new write.
- Redirect remains an incident action; override retains original allocation and mismatch flag. Ordinary marking gains no extra confirmation or delay.
- Duplicate timestamps are readable in Sydney time around midnight and daylight-saving boundaries; malformed values have a safe fallback.

### B1 Implementation Evidence (5 September 2026)

- Implementation completed in isolated worktree `C:/dev/AlgoAttendance-ux-b1`, branch `ux/student-review-b1`, starting at `8a911757eff85a2337f211917a737d4416d3b219`. Implementation and unit-test commit: `1630d2d`. No edits to the main checkout, backend, migrations, dependencies, or deployment configuration are included.
- UX-02: synchronous generation ownership binds normalized ID, room/exam and OCR/manual source to the accepted review; edits invalidate immediately, including editing back. Handler claims reject mismatched context and caller-supplied identity fields. Lookup completion/finalization and both existing reset timers require current ownership. Committed writes finish their original outbox operation even after room/review invalidation; no blocking refresh or extra confirmation was introduced.
- UX-06/07/11/13: returned name/ID/zone and missing-field fallbacks; assigned-room context, primary redirect and secondary mismatch action with team-leader guidance; retained draft comments only editable on save-capable outcomes; duplicate date/time uses the existing Sydney formatter with explicit timezone and invalid-value fallback.
- Checks completed: `npm.cmd run test:web` passed (shared, API, server-unit, scanner suites); scanner suite passed 30/30 including new review ownership and Sydney midnight/DST cases. `npm.cmd run typecheck:web`, `git diff --check`, and `npm.cmd --workspace @algo-attendance/admin run build` passed. The build completed compilation, lint/type validation, all 22 static pages and tracing with service environment variables removed. See `docs/UX-B1-HANDOFF.md` for the bounded resume record.
- Browser evidence: local Chromium against `http://127.0.0.1:3111/scan`, implementation `1630d2d`; no backend configured. API calls are intercepted with synthetic responses and external browser requests are blocked. Camera access is mocked to fail deliberately, leaving manual lookup available. All nine cases passed, including direct invocation of captured stale handlers, failed re-lookup recovery, identity correction, missing fields, wrong-room action payloads, comments, cancellation, the 180/450ms timers, persisted IndexedDB request/metadata agreement, and leaving a pending write. Re-run with `npx.cmd --no-install playwright test --config playwright.b1.config.mjs`; the fixture lives in `e2e-b1/`, outside existing staging test discovery.
- Safety: only directory junctions to pre-existing root/admin `node_modules` were used. No environment files copied. Next.js's generated lockfile patch was reverted, and automatic lockfile patching is disabled in the local fixture. No production/staging mutations, pushes or deployments were performed.
- B1 remains **pending independent review and release acceptance**, not checked complete below. No visual screenshot comparison, responsive/zoom inspection, screen-reader, real OCR/camera, physical iPhone/Android, or exact-revision staging write-path acceptance is claimed. B2-B5 remain untouched.

## B2. Accurate Exam Staffing and Readiness

1. **Goal:** give administrators one trustworthy assignment baseline and prevent known-invalid draft readiness cues.
2. **Findings:** UX-01 (P1), UX-10 (P2), setup/assignment portion of UX-03 (P2), assignment portion of UX-04 (P2).
3. **Intent:** blueprint for loader/view ownership; fortify for committed/loading/empty/error states; include and articulate for fields; transpose for assignment layout.
4. **Screens/workflows:** `/sessions/new`, `/sessions/[id]`, setup and active assignment management, review/publish.
5. **Likely files:** `apps/admin/src/lib/repository.ts`; `apps/admin/app/sessions/[id]/page.tsx`; `new-exam-import-form.tsx`; `exam-assignment-wizard.tsx`; localized assignment rules in `apps/admin/app/globals.css`. Inspect setup caller and assignment/publish API contracts, but do not change them without demonstrated need.
6. **Proposed changes:**

- Hydrate room assignments for the selected exam's room IDs using the setup loader's established pattern; include failure checks and bounded/paginated reads where required by existing repository limits. Do not load all attendance/assignments merely to populate badges.
- Build room badges, staff selection, assigned totals, and `savedAssignments` from that same committed snapshot. Retain local edits during appropriate refreshes; on scope changes reset deliberately. Keep the optimistic-concurrency baseline aligned with the snapshot, rather than masking conflicts.
- Represent assignment-load failure as failure, not "Unassigned." Distinguish genuine empty staffing, empty room list, unsaved local edits, saved staffing, and closed/read-only mode.
- Replace zero-room "All rooms assigned" with "No rooms available" and explain that a valid roster must be imported to create a populated exam. Link to the existing new-exam/import path with wording that it creates a new draft, not appends to this one.
- Disable publish for known unmet prerequisites: empty rooms, known zero allocations, missing staffing, or an operation in progress. Preserve existing save-before-publish sequencing for valid dirty assignments. If allocation readiness is not loaded by a caller, pass a minimal truthful prerequisite value or show it as unchecked; never infer zero from omitted data or invent a full client-side validator.
- Label Exam name, Exam date, **Exam start time**, Roster files, staff search, and inline staff creation controls. Associate file-format guidance and validation messages; retain current required columns and import behavior.
- Let assignment grid children shrink and switch to stacked panels at constrained content widths. Keep staff controls and actions visible without hiding room details or changing the overall admin shell.

7. **Must remain unchanged:** allocation/import contract, server-authoritative publication rules, assignment conflict detection and atomic saving, multiple staff/rooms, active-exam management, closed read-only state, email actions, and existing staff-picker/disclosure patterns.
8. **Risk / effort:** medium / 2-4 days. UX-01 is a real data-boundary repair, not merely relabeling an incorrect total. Minimal loader changes and scoped query tests are required; no schema redesign.
9. **Verification criteria:**

- Seeded assignments agree across setup, detail badges, checkboxes, totals, and invigilator room access, including multiple staff per room and one staff member in multiple rooms. Other exams' assignments do not leak into the selected exam.
- Query failure does not display a successful empty snapshot. Test enough assignment rows to detect provider result limits without creating an unbounded query.
- Save initially remains disabled when unchanged; an authorized disposable edit persists; stale concurrent edits are rejected/reconciled by existing safeguards, not overwritten.
- Zero-room, zero-allocation, partially staffed, valid staffed, dirty, active, and closed fixtures show truthful readiness. Invalid drafts cannot initiate publication from enabled UI. A valid draft still follows the established save/publish flow.
- All setup controls have persistent associated labels and described guidance/errors. At 390, 768, 899, 900, 910, and 1440px, assignment actions remain reachable with no page-wide overflow.

### B2 Implementation Evidence (5 September 2026)

- User-approved B2 implementation completed in `C:/dev/AlgoAttendance-ux-b2`, branch `ux/exam-staffing-b2`, commit `0d1331e9f37921dc3ea9ee43607f13d8c40a9bd9`, based on `72639aa306424fc58608f6333269fb8dff20dabd`. Detailed evidence, initial fixture failures and remaining gates: `docs/UX-B2-HANDOFF.md`.
- UX-01: shared exam-scoped staffing hydration with deterministic pagination, bounded IN chunks, row/page/deadline limits and failure propagation. Clean refreshes adopt one model; dirty refreshes retain edits and the original expected-assignment baseline. The committed save response remains authoritative. These multi-query reads are not claimed to be transactional snapshots.
- UX-10: explicit per-room allocation existence metadata, four-way bounded reads for drafts, truthful zero/unknown/missing-staff states and disabled invalid publication. HTTP failures cannot navigate as success; save failure prevents publication, while successful save then followed 303 behavior remains intact. Closed mode resets unsaved edits to supplied data.
- UX-03 setup and UX-04 assignment slices: persistent associated labels/guidance/errors; assignment-scoped content-width reflow without shell redesign or global overflow hiding.
- Final checks on implementation commit: `test:web` 93/93 (including 14 B2 cases), isolated Chromium browser tests 20/20, web typecheck and safe admin build passed. Browser fixtures checked 390, 768, 899, 900, 910 and 1440px with long content; this is not authenticated full-page or physical-device acceptance.
- No live mutations, migration/dependency changes, backend write-contract changes, integration, pushes or deployments. Parent final review, exact-revision staging, authorized disposable write-path verification and physical/assistive-technology acceptance remain open; B2 release acceptance is not checked off.

## B3. Accessible Scanner Input and Review Navigation

1. **Goal:** make repeated scanner input and cancellation predictable with keyboard, assistive technology, and browser Back.
2. **Findings:** UX-05/08 (P2), UX-12 (P3), scanner portion of UX-03 (P2).
3. **Intent:** include for semantics/focus, journey for submission and escape paths, fortify and articulate for signed-out/expired states.
4. **Screens/workflows:** scanner login, manual lookup during OCR startup, edited-ID lookup, every review state, session expiration.
5. **Likely files:** `web-scanner-app.tsx`; review styles in `apps/admin/app/globals.css`; existing scanner history/request/runtime tests. A small local review component is acceptable only if it reduces lifecycle duplication; no scanner rewrite or new UI framework.
6. **Proposed changes:**

- Use semantic forms for access-code and lookup groups with a single submit handler. Enter in an ID performs lookup, never marking. Enter in Comments remains a newline; do not nest forms or use global key listeners to submit.
- Add visible Access code, Student number, and Comment (optional) labels, stable associations, and linked errors. Keep numeric input affordances and existing input validation.
- Give the review named dialog semantics, inert background, focus containment and restoration. Prefer an existing supported dialog primitive or narrowly scoped native dialog; choose after checking current project patterns. Initial focus should expose the review heading/context without unexpectedly opening the phone keyboard.
- Route visible "Cancel review", Escape, and browser Back through the existing cancellation/reset contract. Allow lookup cancellation; prevent dismissal from implying cancellation of an already submitted mark. Do not abort durable outbox work or create a second history entry per rerender.
- Return focus to the manual field when it launched the lookup; for OCR return to a stable scanner control without opening the keyboard. Resume camera scanning once, using existing pause/resume logic.
- Initial unauthenticated bootstrap is neutral sign-in. Only loss of an established authenticated session uses expiry wording. Network/timeouts keep their separate recovery state and retain pending marks.

7. **Must remain unchanged:** manual availability during OCR load, camera ownership, outbox persistence, request deduplication, safe Back semantics, authentication enforcement, and one intentional submit per lookup/mark.
8. **Risk / effort:** medium / 2-3 days. Depends on B1's reviewed-identity contract. Focus/history/camera interactions require more validation than a form-only patch.
9. **Verification criteria:**

- Enter signs in or looks up exactly once; empty/busy input does not submit. Textarea Enter never marks, redirects, or submits a lookup.
- Every review variant has an accessible name; keyboard focus enters it, Tab/Shift+Tab stay within it, background controls cannot be activated, and dismissal restores meaningful focus.
- Visible cancel, Escape, and Back behave consistently in checking, reviewed, error, and submitting states. Delayed lookup results do not reopen dismissed reviews. No duplicate camera loops or pending-write loss.
- Fresh signed-out visit shows neutral copy; established-session expiration explains reauthentication; an unavailable backend is not mislabeled as expiration.
- Browser automation verifies semantic/keyboard cases. Physical iPhone/Android checks must cover soft keyboard, camera resume, Back/gesture, and background/foreground recovery before release acceptance.

## B4. Usable Admin Audit Workspace

1. **Goal:** keep investigative controls visible and preserve location/context while reviewing attendance, incidents, and mismatches.
2. **Findings:** audit portion of UX-04 (P2), audit-filter portion of UX-03 (P2), UX-14 (P3).
3. **Intent:** transpose and include for reflow; organize for location hierarchy; articulate for filter labels.
4. **Screens/workflows:** `/attendance`, `/incidents`, `/mismatches`, including scoped links from exam metrics and narrow-screen filtering/pagination.
5. **Likely files:** those three `apps/admin/app/*/page.tsx` files; `admin-nav.tsx`; `apps/admin/app/globals.css` (`.stack`, `.wide-card`, `.table-scroll`, `.table-filter-form`, relevant grid children). Check existing breadcrumb markup before extracting a component.
6. **Proposed changes:**

- Apply shrink rules at the correct grid/flex containment points, wrap filter groups, and keep horizontal overflow inside semantic table regions. Do not hide the document overflow to conceal inaccessible content.
- Add associated persistent labels to each rendered filter: Exam, Room, Attendance status or Incident type as appropriate, Sort order, and search fields. Preserve existing parameter names and GET submission semantics.
- Make Mismatch Present an Attendance subview with a visible parent/location cue and scoped return link. Use appropriate current-location semantics without claiming the Attendance URL is the current page on `/mismatches`.
- Retain the selected exam in breadcrumb/back destinations and existing scoped links. Do not create a new top-level navigation item or change report routes.
- Where touched, give each page a clear page-level heading; this is an unscored semantic adjunct from the audit, not a newly invented P2 finding.

7. **Must remain unchanged:** bounded server queries, audit columns including comments and both rooms, table headers, URL filters/pagination, clear/empty states, data ordering, exports, and mobile navigation row.
8. **Risk / effort:** medium / 1.5-2.5 days. Shared CSS can affect otherwise working Attendance containment; prefer scoped rules, and retest B2 after any common layout change.
9. **Verification criteria:**

- At 390, 768, 899, 900, 910, and 1440px, document width fits viewport; intentionally wide tables scroll within their own regions. All filter actions and pagination remain reachable by keyboard/touch.
- Test long names/emails, empty results, and a full page of rows. No columns are removed merely to meet width checks.
- Filters have correct accessible names and preserve current query behavior, including Clear and Next/Previous. Browser Back restores expected scoped browsing.
- Mismatch pages show Attendance context on direct navigation and exam-scoped arrival; return links retain exam scope and nav state remains correct on all other routes.
- Recheck assignment boards, login, and scanner to ensure shared CSS does not regress B2/B3 or existing layouts. Include zoom/reflow and a screen-reader spot check.

## B5. Clear Credential and Recovery Forms

1. **Goal:** make credential administration and recovery fields understandable, with terminal recovery states instead of indefinite progress.
2. **Findings:** UX-09 (P2), remaining account/staff portion of UX-03 (P2).
3. **Intent:** fortify for recovery states, include for field associations, articulate for honest status/error copy.
4. **Screens/workflows:** `/login`, `/reset-password`, `/update-password`, `/invigilators` search/create/edit. Scanner authentication is owned by B3, not duplicated here.
5. **Likely files:** `admin-login-form.tsx`, `reset-password-request-form.tsx`, `update-password-form.tsx`, `apps/admin/app/invigilators/page.tsx`; inspect `invigilator-code-panel.tsx` for existing controls that must remain stable. Recovery callback is a contract dependency, not a planned rewrite.
6. **Proposed changes:**

- Model recovery as checking, valid context, no valid context, check failed, submitting, and updated. A resolved null session must show "No valid recovery session. Request a new reset email." Reserve "Password updated" for actual success.
- Distinguish network/check failures from a missing link. Provide retry/request-new-link actions as appropriate; bound an unresolved check using existing request timing conventions without discarding a legitimate later recovery event.
- Prevent an older `getSession` response from overriding a newer recovery/auth event. Revoke ready state if session becomes invalid; unsubscribe and ignore results on unmount. Preserve the existing callback exchange and server/auth security boundaries.
- Add persistent Email address, Password, New password, Confirm new password, Full name (optional), and Search invigilators labels where applicable. Associate validation text, retain autocomplete, native form submission and disclosures, and keep credentials out of new logs.
- Use consistent field spacing and the existing visual system; avoid a new shared form abstraction unless simple reuse is genuinely needed.

7. **Must remain unchanged:** password policy, account roles, non-enumerating reset responses, code generation/activation and existing-session behavior, email actions, authentication callback/token handling, and staff search semantics.
8. **Risk / effort:** medium / 1-2 days. Labels are low risk; asynchronous recovery transitions require focused auth tests. Independent of B1/B2, but must not overlap edits to the scanner.
9. **Verification criteria:**

- Missing-session check terminates; valid recovery shows the form; check failure presents a recoverable error, not success. Delayed/reordered session and recovery events settle to the correct state.
- Failed password update never shows completion. Successful update clears sensitive inputs and preserves the existing return-to-login behavior. Invalidated session disables submission.
- All rendered account/staff inputs have persistent associated names and error guidance. Keyboard submit, native edit disclosures, focus indicators, autocomplete and busy guards remain functional.
- Mock auth states first. Later use a disposable staging recovery account with explicit authorization for actual email/password changes; never reset production credentials for verification.

## Execution and Verification Gates

Recommended order: **B1 -> B2 -> B3 -> B4 -> B5**. B2 may be implemented independently of B1, but keep the two P1 fixes ahead of lower-impact polish. B4 coordinates shared CSS with B2. Do not let two agents edit `web-scanner-app.tsx` concurrently. Use separate logical commits within batches where this makes correctness versus presentation changes easier to review.

Before implementation testing:

- Establish a process-only staging configuration or disposable isolated fixture. Both local `.env.local` files were reported to target production; do not run the local app against them or copy secrets into this plan/repository.
- Verify the backend project ID and local/deployed SHA before any authenticated interaction. Deployed-staging findings alone cannot certify a different local revision.
- Read-only permission from the audit is not authorization to mark attendance, publish, save assignments, send emails, or change passwords. Use mocked route responses for UI tests and explicitly authorized disposable synthetic data for mutation tests. Avoid running an existing broad staging suite without inspecting its side effects.
- Keep the existing dependency gate enforced. Local commits are not deployment approval; do not push/deploy as an implied part of this plan.

For every batch, record commit, test fixture, runtime SHA/backend, checks run, and remaining gaps. Run relevant unit/scanner tests, TypeScript checks and admin build after future code changes. Add focused browser regression cases; do not claim screen-reader or physical-device coverage from desktop resizing. The author of the implementation owns tests and documentation; the user owns manual device acceptance and access approval.

Success measures are concrete task outcomes rather than a new invented UX score: no actionable stale review, consistent assignment snapshots, one request per deliberate lookup, no false readiness, reachable controls, correctly named fields, and recoverable terminal states. Counter-metrics: no extra mark latency, no duplicate writes, no lost pending attendance, no new data leakage, no extra identity fetches, and no hidden audit columns.

### Completion Checklist

- [ ] B1 release acceptance: implementation and independent source review complete on 5 September 2026; 10/10 mocked browser tests passed, including a corrected small-phone review overflow. Agent unit/type/build evidence is recorded in `UX-B1-HANDOFF.md`. Live staging and physical acceptance remain open for UX-02, UX-06, UX-07, UX-11, UX-13.
- [ ] B2 release acceptance: UX-01, UX-10, UX-03 setup, UX-04 assignments implemented and locally mock-verified in `0d1331e`; 93 web and 20 browser tests passed. Parent final review, staging/write-path and physical acceptance remain open; see `UX-B2-HANDOFF.md`.
- [ ] B3 verified: UX-05, UX-08, UX-12, UX-03 scanner.
- [ ] B4 verified: UX-14, UX-03 audit filters, UX-04 audit/shared containment.
- [ ] B5 verified: UX-09, UX-03 account/staff forms.
- [ ] UX-03 cross-surface checklist complete; UX-04 verified in both affected workflow families.
- [ ] Exact-revision staging evidence, required write-path tests, and physical-device acceptance recorded before release approval.

Unscored questions about exam-detail table size and import network-error recovery remain separate investigations, not extra implementation batches. Do not widen this plan into pagination architecture, roster editing, persistent duplicate notes, native apps, or a new design system without evidence and separate approval.

## Implement First: B1

Implement **Trustworthy Student Review** first, starting with UX-02's identity/action guard. It addresses a P1 decision-state error in the highest-repetition workflow, has a narrow web-client boundary, and can be demonstrated with mocked requests without changing production data. The identity and exception refinements then become safe to add on the same reviewed-result contract. It needs no migration and must not add a confirmation step to ordinary marking.

UX-01 remains P1 and B2 should follow immediately; this ordering does not reduce its severity. Its scoped server read-model and concurrency baseline need a different test fixture and belong in their own batch rather than being mixed into scanner work. If staffing changes are operationally imminent, B2 can take precedence on that operational basis, not because of cosmetic preference.
