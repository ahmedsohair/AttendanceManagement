# UX Audit

## Audit Baseline

- **Repository:** `C:\dev\AlgoAttendance`
- **Branch:** `hardening/staging`
- **Commit:** `84c770da1890fee3f06b82efd03c1f3ee4a0a47f`
- **Evaluation date:** 4 September 2026, Australia/Sydney (AEST, UTC+10).
- **Method:** Intent `/evaluate`; repository context, cognitive walkthroughs, rendered browser interaction, keyboard checks, DOM inspection, and targeted source corroboration. No implementation work.
- **Runtime actually evaluated:** `https://exampulse-stagings.vercel.app`, using the user's manually authenticated staging administrator and the repository's synthetic Test Invigilator 01 account. The user identified the backend as `bjoguceapwquyczbhlyp.supabase.co` and authorized read-only inspection.
- **Important version limitation:** the deployed staging commit has not been established. The user explicitly warned that it may lag this local commit. Findings below distinguish staging observations from corroborating code at the recorded baseline. They must not be described as a completed runtime verification of that exact commit.
- **Local runtime limitation:** the established `npm.cmd run dev:admin` workflow started Next.js 15.5.21 successfully. Inspection then established that both local environment files targeted the production Supabase project, not staging. The server was stopped before local UI testing or authentication. No local application requests were successfully inspected. A staging-only environment file outside the repository was requested for process-only configuration; it was not available during the recorded walkthrough. No environment file was edited, and production was not used for the audit.
- **Scope restrictions:** no attendance marking, redirects that log incidents, imports, assignment saves, publication, deletion, account creation/editing, access-code regeneration, emails, password resets, migrations, deployments, commits, or pushes. Lookup is a read-only operation despite using POST; its route and repository implementation were inspected before use.
- **Initial working tree:** no tracked changes; pre-existing untracked entries listed in the Final Safety Check. These are not audit output and were preserved.

**Report status:** evidence-backed audit of the accessible staging experience, cross-checked against the specified repository baseline. Local reproduction and native-device coverage remain incomplete. This is not release acceptance or an accessibility-conformance certification.

## A. Executive Assessment

ExamPulse has a coherent operational model: administrators prepare and publish exams, manage room access, and investigate attendance; invigilators select an assigned active room, look up students, and choose an attendance or exception action. The existing structure should be improved incrementally rather than redesigned.

The highest-impact problems concern correctness of information at decision points. The admin exam panel showed every room as unassigned while the synthetic invigilator could access TEST-01. The current exam-detail loader corroborates the cause: it supplies users without their assignments. Separately, editing a student number leaves the previous lookup's ready/wrong-room state and consequential actions active. These issues deserve priority over visual refinements.

Repeated scanner work also suffers from missing Enter submission, a review sheet without dialog/focus handling, and insufficient identity information. Admin filters and import fields lack persistent, associated labels. Some admin content expands the entire page beyond the viewport, hiding controls on small screens. Recovery and empty-draft states can communicate progress/readiness that has not actually been established.

The strengths are substantial: clear exam lifecycle sections; contextual links from counts to audit records; explicit expected versus actual room data; readable text status labels; searchable staff selection; visible save-state feedback; and a scanner that keeps manual lookup usable while OCR starts. Preserve these.

### Intent heuristic assessment

Scores use the skill's 0–4 problem scale: 0 no observed problem, 1 refinement, 2 meaningful recoverable friction, 3 major issue, 4 core-task catastrophe. They describe the inspected subset, not measured user failure rates.

| Heuristic | Score | Evidence |
| --- | ---: | --- |
| H1 System status | 3 | Incorrect assignment state (UX-01); indefinite recovery check (UX-09). Scanner connection and sync labels are a strength. |
| H2 Real-world language | 2 | Missing student identity (UX-06), raw duplicate timestamp (UX-13). Exam/room terminology is otherwise concrete. |
| H3 Control and freedom | 2 | Review sheet lacks a local cancel path in ready/wrong-room states and Escape handling (UX-05). Browser Back and Continue Scan provide partial recovery. |
| H4 Consistency | 2 | Field naming/accessibility and keyboard submission vary (UX-03, UX-08). Mismatch navigation is inconsistent (UX-14). |
| H5 Error prevention | 3 | Stale actionable lookup after ID edit (UX-02); misleading draft readiness (UX-10). |
| H6 Recognition over recall | 2 | Student identity absent; placeholder-only fields disappear as users type (UX-03, UX-06). |
| H7 Efficiency | 2 | Extra pointer/Tab actions per manual lookup (UX-08); page overflow (UX-04). |
| H8 Relevant presentation | 2 | Wrong-room exception receives strongest action emphasis (UX-07); comments appear where they are discarded (UX-11). |
| H9 Error recovery | 2 | Missing-session recovery state does not finish (UX-09). Not-found lookup instructions are helpful. |
| H10 Help | 1 | Spreadsheet column guidance and no-room instructions exist. Some state-specific explanations need refinement. |

Indicative **observed-subset heuristic score: 47.5/100**, calculated as `100 × (1 − 21/40)`. This is a transparent normalization of the heuristic scores, not a statistical product-health metric. Task completion, error rate, satisfaction, and real-world scanning speed were not measured; no composite task-success score is claimed. The local-runtime and write-path gaps make a whole-product numerical verdict inappropriate.

## B. Product Workflow Map

### Product and constraints established from the repository

The Next.js application combines the admin portal, API, and browser scanner. The Expo app is a separate native invigilator client. Shared types and attendance rules live in `packages/shared`. Roles are **admin** and **invigilator**; there is no implemented student self-service journey in the inspected routes.

Current routes are `/`, `/login`, `/reset-password`, `/update-password`, `/auth/callback`, `/sessions`, `/sessions/new`, `/sessions/[id]`, `/invigilators`, `/attendance`, `/mismatches`, `/incidents`, and `/scan`.

An imported exam starts as a draft. Required roster columns are `student_id`, `student_name`, `room`, and `zone`; `course_code` and `program` are optional in the current import guidance. Duplicate student IDs in an import are rejected. Publication requires rooms, allocations, and staffing under the current business rules. Active assigned rooms are exposed to invigilators. Closing ends active use; historical reporting remains available. Attendance is unique per exam/student. A wrong-room override preserves the original allocation and records the mismatch. Access codes are generated credentials, not retrievable plaintext passwords. Current email-job handling is more developed than some older README wording suggests.

The README and PROJECT_OVERVIEW supplied orientation; current routes, loaders, components, shared rules, and rendered states took precedence. Recent history emphasizes attendance integrity, typed deletion confirmation, scanner recovery, and privacy-safe telemetry. Historical screenshots and design fixtures were not treated as current UI evidence.

### Journey priorities and walkthrough results

Frequency is inferred from the workflow, not analytics. “Failure” below means an observed decision/interaction failure; it does not imply a submitted transaction failed.

| Journey | Importance / frequency / sensitivity | Inspected path and walkthrough outcome |
| --- | --- | --- |
| Invigilator starts a shift | High; once per login/room change; time-sensitive | Login → loading assigned rooms → TEST-01. Purpose and room action clear. Enter in code field does nothing; clicking Sign In works. **Hesitation** (UX-08). |
| Repeated student lookup | Highest repetition; per arriving student; error- and time-sensitive | Room → manual ID → Lookup → review. Read-only ready, wrong-room, already-marked, and not-found outcomes reached. Lookup works during OCR startup. Editing the ID retains stale eligibility: **failure at the decision state** (UX-02). |
| Resolve wrong room | Exception frequency unknown; consequential | TEST-01 lookup of 9000992 → expected TEST-02 / Zone D → redirect or override choices. Correct routing information is visible; override has strongest emphasis. **Hesitation** (UX-07). Neither action submitted. |
| Correct a misread / duplicate | Recurs when OCR/manual input is wrong or student already recorded | Edit ID → Lookup Edited ID → corrected result; duplicate → Continue Scan. Instructions support recovery; no student name and raw timestamp add friction. Comments on Continue Scan are discarded (UX-06, UX-11, UX-13). |
| Prepare an exam | High importance; per exam; error-sensitive | Add New Exam → inspect import fields and column contract; existing draft → assignments → Continue To Review. Import/publication not submitted. Empty draft falsely reports readiness (UX-10). **Incomplete transaction coverage.** |
| Manage room access | High importance; per exam and staffing change; time-sensitive near start | Active exam → expand assignments → select TEST-01 → search/picker. Recorded assignments appear absent despite actual scanner access. **Failure of displayed state** (UX-01). No checkbox or save changes submitted. |
| Manage staff credentials | Periodic; high consequence when used | Invigilators → search Test Invigilator 01 → keyboard-open edit disclosure. Findability and native disclosure work; labels need improvement. Creation, save, generation, and emailing excluded. |
| Monitor and investigate | High during operations; repeated checks | Dashboard counts → active exam → attendance, incidents, mismatch review → filters/empty results. Scoped links and explicit audit columns work. Small-screen overflow and unnamed filters impede operation (UX-03, UX-04). |
| Close/export/history | Per exam completion; consequential | Lifecycle list, closed-exam entry, Export XLSX and Close/Delete entry points inspected. No close/delete/export execution. Historical action coverage is limited to visible affordances. |
| Account recovery | Infrequent, but blocks entry when needed | Login → recovery pages; direct update-password without a session remains checking. Recovery link remains available. **Hesitation / unresolved status** (UX-09). No recovery email or password change. |

Native source shows a separate welcome/login/room/scanner flow and a manual path that can auto-mark a successful lookup. Native execution was deliberately not substituted for the web read-only walkthrough. No claim is made that the two clients have identical behavior.

## C. What Already Works Well

1. **Lifecycle grouping supports the job.** Active, draft, and closed exams are separated with different relevant actions. Draft review and historical export do not require remembering status codes.
2. **Summary counts are useful navigation.** Attendance, mismatch, and incident metrics link to the appropriate audit view. Exam-specific links carry `examSessionId`; the destination states the selected exam.
3. **Audit records expose the right distinctions.** Marked In and Expected Room are separate, alongside staff, comments, and time. A mismatch does not visually overwrite the original room allocation.
4. **Global audit pages support bounded browsing.** Attendance displayed 1–50 of 51 with Next; filters and pagination are represented in URLs. Empty results explicitly say no entries match, with a Clear action available.
5. **Staff disclosures work with the keyboard.** Enter on the native Edit invigilator summary opened the edit panel. A visible focus outline was observed. Do not replace this with a nonsemantic clickable container.
6. **Assignment editing already has useful foundations.** Room selection, named staff checkboxes, search, summaries, and disabled Save when unchanged are good patterns. Correct their data rather than rebuilding the workflow.
7. **Scanner state categories are recognizable.** Ready, wrong room, already marked, and not found have distinct headings and styling. Wrong-room text names the expected room and zone.
8. **Manual lookup remains available while OCR initializes.** During model startup the scanner still returned synthetic lookup results. This matters at exam entry, where camera readiness must not stop the queue.
9. **Operational status is visible.** Backend connected, room identity, last sync time, counts, and recent student chips make scanner context explicit. Assigned-room loading is distinct from an empty room list.
10. **Recovery instructions help.** Not-found text tells users to correct the number and look up again. Continue Scan clears the previous result and input. Returning to room selection worked and stopped the camera view.

## D. Findings by Severity

Evidence codes: **S** = observed staging UI/interaction; **D** = rendered DOM/keyboard evidence; **C** = corroborating source at the exact recorded commit. **C is not a claim of local runtime reproduction.** Each finding includes a future remediation direction, not an implemented change.

### P0 — Blocking / severe

No genuine P0 finding established. Write-path completion and physical-device acceptance were not tested, so this is not a guarantee that none exist.

### P1 — Major UX issues

#### UX-01 — Existing room assignments appear absent in the exam panel

- **Category / workflow:** information correctness and interaction design; `/sessions/[id]`, managing active-exam staffing.
- **Observed fact (S):** Staging Active Exam showed “0 assigned”; all ten room cards said “Unassigned.” Selecting TEST-01 displayed “No invigilator assigned to this room yet” and an unchecked Test Invigilator 01. The same synthetic invigilator subsequently signed in and was offered TEST-01 as its assigned active room.
- **Corroboration (C):** `readExamSessionStoreFast` in `apps/admin/src/lib/repository.ts` retrieves users but not `room_assignments`, then calls `userWithAssignments` without its second argument (default `[]`). `apps/admin/app/sessions/[id]/page.tsx` passes these users to `ExamAssignmentWizard`. In contrast, `readExamSetupStoreFast` explicitly hydrates assignments.
- **Interpretation / impact:** the administrator cannot trust the staffing summary. They may unnecessarily reassign staff or believe a room has no coverage. This also gives the editor the wrong baseline for unsaved-change/conflict handling. No claim is made that saving would silently erase assignments; saving was not tested and server conflict safeguards exist.
- **Frequency / lens:** every Supabase-backed detail-page staffing review with assignments; H1 visibility of status, H5 error prevention, cross-screen consistency.
- **Recommendation:** hydrate the committed assignment snapshot used by the detail page and editor from the same source; derive room badges, selected checkboxes, totals, and save-conflict baseline from that snapshot. Never render failed/unloaded assignments as an empty successful result.
- **Likely files:** `apps/admin/src/lib/repository.ts` (`readExamSessionStoreFast`, `userWithAssignments`), `apps/admin/app/sessions/[id]/page.tsx`, `apps/admin/src/components/exam-assignment-wizard.tsx`.
- **Complexity / routing:** **Medium**; `/blueprint` + `/fortify`. Scope is a shared data-to-UI boundary. Validate with actual existing assignments and concurrent-edit safeguards in an authorized test environment.

#### UX-02 — Editing the student ID leaves the previous result actionable

- **Category / workflow:** error prevention; `/scan`, repeated review and correction.
- **Observed fact (S, D):** in TEST-01, lookup of `9000991` showed Ready to mark. Changing the review input to `9000992` left the heading “Ready to mark,” message “Student is in the correct room,” and enabled Mark Present unchanged. Only Lookup Edited ID updated the result to Wrong room detected / expected TEST-02. No marking action was pressed.
- **Corroboration (C):** review input `onChange` updates `studentId` but not `lastLookup`; action visibility depends on `lastLookup`. Normal `markStudent()` uses the edited `studentId`, whereas wrong-room buttons explicitly pass `lastLookup.studentId`. Thus the visible edit and action target can diverge in different ways.
- **Impact:** a high-frequency correction step can show eligibility for one student while allowing an action for another, or retain an old wrong-room target after the number changes. Server validation does not make the stale confirmation trustworthy.
- **Frequency / lens:** any corrected ID after a completed lookup; H5 error prevention, H1 status, cognitive walkthrough understanding/feedback.
- **Recommendation:** explicitly track the ID associated with the displayed result. On an ID edit, invalidate eligibility and disable mark/redirect/override actions until a successful lookup for that exact normalized ID completes. Make every action consume the same reviewed identity. Preserve the typed ID and useful comment during re-lookup.
- **Likely file:** `apps/admin/src/components/web-scanner-app.tsx` (`lookupStudent`, review input, `markStudent`, wrong-room handlers).
- **Complexity / routing:** **Small** for the web state correction, with targeted validation; `/journey` + `/fortify`. Avoid changing attendance business rules or idempotency behavior.

### P2 — Meaningful improvements

#### UX-03 — Core fields and filters lack persistent associated labels

- **Category / workflow:** accessibility and comprehension; login/recovery, `/sessions/new`, staff forms, audit filters, scanner fields.
- **Observed fact (S, D):** Add New Exam's date, time, and file inputs have no label or `aria-label`; their accessible snapshot presents unnamed controls. All four Attendance selects have zero associated labels and no accessible-name attribute. Scanner fields and other text inputs depend on placeholders. Date/time purpose is not stated next to the controls; placeholder text disappears on entry.
- **Impact:** administrators must infer field purpose from position or current values; assistive-technology users cannot reliably distinguish unnamed filter controls. The problem repeats across setup, investigation, and scanner correction.
- **Frequency / lens:** every form interaction; recognition over recall, accessibility names, H4 consistency.
- **Recommendation:** add concise visible labels associated with stable input IDs: Exam name, Exam date, Start time, Roster files, Exam, Room, Attendance status, Sort order, Student number, Access code, and Comment where applicable. Retain placeholders as examples, not labels. Associate guidance/errors with the relevant control and keep required/optional wording explicit. Reuse a consistent field pattern without changing form submission semantics.
- **Likely files:** `new-exam-import-form.tsx`, `admin-login-form.tsx`, `reset-password-request-form.tsx`, `update-password-form.tsx`, `web-scanner-app.tsx`, `exam-assignment-wizard.tsx`; audit and invigilator route files under `apps/admin/app`.
- **Complexity / routing:** **Medium** across the application; `/include` + `/articulate`. No claim is made that every placeholder-only input has an empty computed accessible name; the unnamed date/time/select cases are directly evidenced.

#### UX-04 — Admin content overflows the page and hides controls

- **Category / workflow:** responsive usability and layout; incident review and exam assignments.
- **Observed fact (S, D):** at an actual 390×844 CSS-pixel viewport, Incidents had document `scrollWidth=853`. Search/filter controls and later record columns extended off the right edge; the entire page had a horizontal scrollbar. At 910×778, Incidents reached `scrollWidth=1153`, and the active assignment panel reached approximately 1226 pixels. The latter pushed summary/action content beyond the viewport. By comparison, Attendance contained its approximately 899-pixel table inside a roughly 501-pixel scroll region without the same page expansion.
- **Impact:** small-screen users must pan the whole page to find filter actions or record details. Near the 900px breakpoint, a fixed sidebar and multi-column panels leave insufficient working space. This is a usability issue, not a preference for a different visual style.
- **Frequency / lens:** every affected narrow-desktop/mobile visit; responsive reflow, task efficiency, H7.
- **Recommendation:** allow stacked/grid children to shrink (`min-width: 0` at the correct containment points), make filters wrap within the available panel width, and constrain overflow to the table region. Adapt the assignment board to its available content width rather than only the overall viewport. Preserve a single readable table with intentional horizontal scrolling where necessary; do not hide audit columns simply to remove overflow.
- **Likely files:** `apps/admin/app/globals.css` (`.stack`, `.wide-card`, `.table-scroll`, `.table-filter-form`, `.assignment-board`, grid children, responsive rules), `apps/admin/app/incidents/page.tsx`, detail assignment markup.
- **Complexity / routing:** **Medium**; `/transpose` + `/include`. Validate at 390px and around 900px as well as a full desktop width. The table's two-dimensional content and the surrounding page should be assessed separately.

#### UX-05 — Scanner review behaves visually as a modal but not as a keyboard dialog

- **Category / workflow:** accessibility and control/recovery; all `/scan` result sheets.
- **Observed fact (S, D):** the sheet dims the scanner and blocks it visually, but has no `dialog` element or `role="dialog"`. After opening a ready result, focus was on the body rather than in the sheet. Tabbing after Continue Scan left the review context. Escape from the student-number field did not dismiss the sheet. Ready and wrong-room sheets have no visible cancel/continue-without-action control inside the sheet; the pending lookup state does have Cancel Scan.
- **Impact:** keyboard users must rediscover the new task context and can traverse obscured controls. Users who decide not to act after a successful or wrong-room lookup must know a browser-back behavior rather than recognize an in-sheet escape route.
- **Frequency / lens:** every scanner review; H3 control, accessible focus order, recognition over recall.
- **Recommendation:** implement a named modal dialog or equivalent accessible dialog behavior: move focus to a meaningful point, contain Tab navigation, make the background inert, return focus appropriately, and support Escape when no submission is in flight. Provide a visible Cancel / Next student action in ready and wrong-room states. Preserve the existing browser Back behavior and request cancellation.
- **Likely files:** `apps/admin/src/components/web-scanner-app.tsx`, `.web-review-sheet` in `apps/admin/app/globals.css`.
- **Complexity / routing:** **Medium**; `/include` + `/journey`. Coordinate focus with camera pause/resume and the existing history handling; do not introduce duplicate resets.

#### UX-06 — The attendance review omits the student's returned identity

- **Category / workflow:** recognition and error prevention; ready and wrong-room review.
- **Observed fact (S):** ready review showed ID `9000991`, an optional comment box, “Student is in the correct room,” and actions. It did not show the student name or allocated zone. Wrong-room review included the expected room/zone but still omitted the name.
- **Corroboration (C):** lookup returns an allocation containing `studentName` and `zone`; the review renders only editable ID, status text, comment, and actions.
- **Impact:** an OCR/manual error that happens to match another valid student is harder to catch before marking. Showing returned identity gives the invigilator something to compare with the presented card instead of relying solely on digits.
- **Frequency / lens:** every successful lookup; H6 recognition, H5 error prevention.
- **Recommendation:** show the returned student name and canonical ID prominently; include allocated zone and expected room where relevant. Keep missing-data behavior explicit. This uses already-returned data and does not add an identity-verification workflow.
- **Likely file:** `apps/admin/src/components/web-scanner-app.tsx`, ready/wrong-room review rendering.
- **Complexity / routing:** **Small**; `/journey` + `/articulate`. Apply after UX-02 so the displayed identity is always tied to the current result.

#### UX-07 — Wrong-room override is more prominent than the normal redirect

- **Category / workflow:** action priority and consequential-action clarity; wrong-room result.
- **Observed fact (S):** the wrong-room sheet offered secondary-styled “Send To Room” and primary-styled “Mark Anyway.” The expected destination was in a paragraph, not in the redirect button label.
- **Impact:** the stronger affordance leads toward an exceptional attendance override even though the repository describes redirecting to the allocated room as the default response. “Mark Anyway” does not state that attendance is recorded in the current room with a mismatch flag. No accidental action was submitted or measured.
- **Frequency / lens:** wrong-room exceptions; H5 prevention, action hierarchy, H2 language.
- **Recommendation:** emphasize the normal action with a concrete destination, e.g. “Send to TEST-02.” Label the exception by its actual effect, e.g. “Mark present in TEST-01 with mismatch,” and explain that the allocation stays unchanged. Preserve explicit override capability; do not add a generic confirmation to every ordinary attendance mark.
- **Likely file:** `apps/admin/src/components/web-scanner-app.tsx`, wrong-room action group.
- **Complexity / routing:** **Small**; `/articulate` + `/journey`. No deceptive intent or dark-pattern severity is alleged.

#### UX-08 — Enter does not submit scanner login or manual lookup

- **Category / workflow:** repeated task efficiency and keyboard interaction; `/scan`.
- **Observed fact (S, D):** entering the synthetic access code and pressing Enter left the login unchanged; clicking Sign In worked. Enter after typing `9000991` in Manual student number did not open a review; clicking Lookup did. Scanner login/manual rows are not forms in the current implementation.
- **Impact:** manual fallback repeatedly requires an extra pointer action or Tab then Enter. This cost scales per student, making it more valuable than many cosmetic improvements. It is not a total keyboard blocker because the buttons can be focused.
- **Frequency / lens:** every manual lookup and scanner login; H7 efficiency, platform consistency.
- **Recommendation:** make each single-action input group a semantic form with the existing handler on submit; support Enter without duplicate requests. Preserve busy/empty-input guards and do not let Enter in the comment textarea mark attendance.
- **Likely file:** `apps/admin/src/components/web-scanner-app.tsx`.
- **Complexity / routing:** **Small**; `/journey` + `/include`. Coordinate with UX-02's result invalidation.

#### UX-09 — Recovery without a valid session remains in an indefinite checking state

- **Category / workflow:** error recovery and status; `/update-password`.
- **Observed fact (S, D):** opening the page without a recovery session displayed “RECOVERY COMPLETE,” “Choose New Password,” and “Checking your recovery session…” with no password form. A later observation still showed that state. “Request another recovery email” was available, so this was not an absolute dead end.
- **Corroboration (C):** `getSession()` returning no session leaves `ready=false` without a terminal missing-session state. The heading's completion claim is unconditional.
- **Impact:** someone following a missing/invalid recovery context cannot distinguish a completed check from a slow one; they may keep waiting despite needing a new link. This audit did not generate or expire a real recovery email.
- **Frequency / lens:** invalid/missing-session recovery visits; H1 status and H9 recovery.
- **Recommendation:** distinguish checking, valid session, missing/expired session, request failure, and password-updated success. When no session exists, show a terminal explanation and make requesting a new email the clear next action. Reserve completion wording for actual success.
- **Likely file:** `apps/admin/src/components/update-password-form.tsx`.
- **Complexity / routing:** **Small**; `/fortify` + `/articulate`. Preserve real recovery callback/auth behavior; validate with authorized disposable recovery sessions later.

#### UX-10 — Empty draft falsely communicates that setup is ready

- **Category / workflow:** state representation and error prevention; draft exam assignments/review.
- **Observed fact (S):** the existing Staging Draft Exam had zero rooms. It displayed “0 of 0 room(s) have staff assigned,” “All rooms assigned,” “No rooms available for this exam,” and enabled Continue To Review and Publish Exam. Continuing opened an empty Review & Publish panel. Publication was not attempted.
- **Corroboration (C):** `unassignedRooms.length === 0` produces the success badge even for an empty room list; `canPublish` checks draft/setup mode. Repository publication rules explicitly reject an exam with no rooms.
- **Impact:** conflicting readiness cues encourage a predictable failed attempt and do not explain what must be corrected. This existing synthetic empty draft may be uncommon in ordinary import usage; that limits its priority.
- **Frequency / lens:** empty/incomplete draft review; H1 status and H5 prevention.
- **Recommendation:** separate “no rooms” from “all rooms staffed”; show the actual unmet prerequisites, disable publication while known prerequisites fail, and give a route to the existing setup/import path without implying that a new import appends to this draft. Keep the server-side validation authoritative.
- **Likely file:** `apps/admin/src/components/exam-assignment-wizard.tsx`; draft detail/setup context.
- **Complexity / routing:** **Small** for empty-room state; **Medium** if a full prerequisite summary is chosen. Primary estimate: **Small**; `/fortify` + `/articulate`.

#### UX-11 — Comments are offered in outcomes where Continue Scan discards them

- **Category / workflow:** unnecessary input and expectation mismatch; already-marked/not-found scanner review.
- **Observed fact (S):** both outcomes offered Comments (optional) and Continue Scan. A temporary comment entered in the already-marked review disappeared when Continue Scan returned to the scanner. No saved-comment confirmation appeared.
- **Corroboration (C):** Continue Scan calls `resetForNextScan`, which clears `comment`; it does not invoke the mark/incident endpoint. Thus this field in that state has no persistence action. The audit did not submit any incident or mark.
- **Impact:** an invigilator may spend time documenting an exception and reasonably expect the note to accompany it. The interface does not explain that the note is abandoned.
- **Frequency / lens:** duplicate/not-found handling when a note is entered; H2 expectation matching, H7 efficiency, error prevention.
- **Recommendation:** remove/hide comment entry in states that only dismiss a result, or explicitly explain that the available action saves nothing. Do not invent a new incident-writing workflow as part of this fix; if persistent notes in these states are desired, that is a separate product decision.
- **Likely file:** `apps/admin/src/components/web-scanner-app.tsx`, shared review textarea and `resetForNextScan`.
- **Complexity / routing:** **Small**; `/articulate` + `/journey`.

### P3 — Polish / refinement

#### UX-12 — A fresh scanner visit can report an expired session

- **Category / workflow:** status copy; `/scan` before sign-in.
- **Observed fact (S):** an initially unauthenticated scanner visit showed “Your invigilator session has expired. Sign in again to continue.” No invigilator sign-in had occurred in the audit browser at that point.
- **Corroboration (C):** unauthorized handling assigns the expiry message, while bootstrap calls `/api/auth/me` even for a normal signed-out visit.
- **Impact / frequency:** low-friction but misleading on entry; suggests the user lost a prior session when they may simply not be signed in. H1/H2, `/fortify` + `/articulate`.
- **Recommendation:** treat initial unauthenticated bootstrap as neutral signed-out state; use expiry language when a previously authenticated session actually becomes invalid.
- **Likely file / complexity:** `apps/admin/src/components/web-scanner-app.tsx`, session restoration/unauthorized handler; **Small**.

#### UX-13 — Duplicate result exposes an unformatted timestamp

- **Category / workflow:** UX writing and scanability; already-marked review.
- **Observed fact (S):** `9000001` produced “Already marked at 2026-08-27T02:06:39.24913+00:00.” Admin audit tables show a human-readable local date/time instead.
- **Impact / frequency:** duplicate checks require parsing an ISO timestamp while handling a student. H2 language and H4 consistency. This is not evidence that the recorded time itself is wrong.
- **Recommendation:** use a concise, explicit timezone/date presentation suited to determining when attendance was recorded; retain precise machine time in detail if needed. Avoid silently mixing device-local and institutional time.
- **Likely files / complexity / routing:** `web-scanner-app.tsx`; existing `apps/admin/src/lib/audit-time.ts` provides an admin convention to consider; **Small**; `/articulate`.

#### UX-14 — Mismatch review loses the usual navigation location cue

- **Category / workflow:** information architecture consistency; `/mismatches`.
- **Observed fact (S, D):** navigating from an exam's Mismatch Present metric showed the correct exam scope, but no admin nav item was active and no breadcrumb was rendered. Attendance and Incidents provide those location cues.
- **Impact / frequency:** occasional exception investigation requires more recall to return to the parent context. Existing global navigation and browser Back remain available; this is not a navigation blocker.
- **Recommendation:** establish Mismatch Present as a recognizable subview of Attendance with a consistent active parent and breadcrumb/back context. A new top-level nav item is not necessary.
- **Likely files / complexity / routing:** `apps/admin/src/components/admin-nav.tsx`, `apps/admin/app/mismatches/page.tsx`; **Small**; `/organize`.

## E. Accessibility Findings

- **UX-03:** direct DOM evidence of unnamed date/time/file fields and select filters; widespread placeholder-only text entry. This is the main shared accessibility foundation to address.
- **UX-05:** no dialog semantics or managed focus in the scanner's visually modal review; Escape does not close it. Focus can leave the review context.
- **UX-04:** page-level horizontal overflow affects finding and operating controls at small widths. Keep essential table scrolling distinct from avoidable surrounding-page overflow.
- **UX-08:** Enter behavior is inconsistent with standard single-action forms; buttons remain keyboard-operable, so it is classified as efficiency rather than total keyboard exclusion.
- **Preserve:** native controls, actual table headers, associated staff checkboxes, native details/summary disclosures, visible keyboard focus observed on staff edit, textual status labels, and disabled pagination states.

DOM inspection also found admin pages beginning with level-two headings rather than a clear level-one page heading. This is a lower-priority semantic improvement to consider with field/dialog foundations; it is not evidence of a blocked task and is not scored as a separate significant finding.

No full screen-reader run, automated accessibility suite, contrast audit across all states, or touch-target conformance assessment was completed. No contrast failure or formal WCAG violation is asserted solely from appearance. The scanner login fitted 390px without horizontal overflow and had approximately 45px-high input and 41px-high sign-in button; these measurements alone do not establish an accessibility failure.

## F. Responsive/Mobile Findings

- **Measured sizes:** narrow desktop approximately 910×778 for admin; 390×844 for public/scanner and incident layout; 1440×900 for scanner room selection. Viewport overrides were verified using `innerWidth/innerHeight`; an override affected the selected browser tab, so requested sizes were not assumed to apply to every tab.
- **UX-04** is the principal responsive defect: Incidents at 390px expanded the document to 853px, and narrow-desktop assignment content also overflowed. The screenshot/DOM evidence showed offscreen controls, not merely wide table columns.
- Scanner login and the result sheet remained readable at phone width, with stacked manual lookup controls and distinct result headings. Identity and focus problems remain independent of layout (UX-05, UX-06).
- Small-screen admin navigation becomes a horizontally scrollable row. This provides a usable existing pattern to retain; it should not be conflated with the whole-page overflow defect.
- Native Android/iOS, Safari, soft-keyboard occlusion, landscape phones, actual camera-card accuracy, and assistive-technology touch interaction are unverified. Desktop browser resizing is not a substitute for device acceptance.

## G. Intent Anti-pattern Findings

No observed evidence of confirmshaming, fabricated urgency, deceptive consent, hidden charges, or deliberate manipulation. Attendance operational controls do not justify forcing commerce-oriented anti-pattern categories into this audit.

The genuine matches are from Intent's **common UX failures** category:

- **Inconsistent mental models:** UX-01's assignment summary contradicts actual assigned-room access; UX-02's edited identity contradicts the retained result; UX-11 invites input that the available completion action discards.
- **Silent loss / misleading feedback:** UX-11 clears the note without communicating that nothing was saved. This is a local UI expectation problem, not a claim of a failed persistence request.
- **Unresolved progress state:** UX-09 leaves missing recovery context looking like ongoing work. Because another-recovery link is visible, it is not an absolute dead-end page.

UX-07 is an action-priority problem, not evidence of a manipulative “dark nudge.” Severity is based on this product's actual task impact.

## H. Highest-impact Improvements

Ranking uses impact, repetition, error sensitivity, reach, and likely implementation cost qualitatively. It is not a fabricated numerical usage model.

| Rank | Improvement / findings | Why it ranks here; expected benefit | Complexity / scope / risk |
| --- | --- | --- | --- |
| 1 | Correct the assignment snapshot (UX-01) | Restores trust in staffing decisions and the editor's starting state; affects exam readiness and changes during operations. | Medium; data loader plus dependent views. Risk: assignment scope and optimistic-concurrency baseline must stay aligned. |
| 2 | Bind actions to the reviewed student identity (UX-02), then show name/zone (UX-06) | Prevents stale confirmation in the most error-sensitive repeated workflow; helps detect a valid but wrong OCR/manual ID. | Small core fix; local scanner state/rendering. Risk: preserve normalization, idempotency, wrong-room rules, and stale-response cancellation. |
| 3 | Make scanner review accessible and escapable (UX-05) | Benefits every review and makes cancellation recognizable without committing an attendance decision. | Medium; local but lifecycle-sensitive. Risk: focus/history/camera resets can conflict if handled independently. |
| 4 | Add persistent field labels (UX-03) | Shared benefit across almost every workflow; improves assistive-technology operation and removes guesswork. | Medium; cross-cutting. Low business-logic risk; avoid layout regressions in dense filters. |
| 5 | Enable Enter for scanner inputs (UX-08) | Removes repeated pointer/Tab friction from manual fallback at low cost. | Small; local. Guard duplicate submissions and textarea behavior. |
| 6 | Contain admin responsive overflow (UX-04) | Restores access to filters/actions on phones and narrow desktops. | Medium; shared CSS/layout. Risk: shrinking panels must not make table information unreadable. |
| 7 | Clarify exception actions and remove nonpersisting note fields (UX-07, UX-11) | Makes the normal wrong-room response easier to choose and avoids wasted note entry. | Small; scanner UI. Preserve all existing allowed actions; do not add incident writes. |
| 8 | Finish recovery/empty-readiness states (UX-09, UX-10, UX-12) | Avoids pointless waiting or predictable failed setup attempts. Less frequent than live attendance work. | Small individually; state-specific. Recovery auth/callback validation requires separate authorized testing. |

UX-13 and UX-14 can follow these changes as inexpensive consistency refinements; they should not displace correctness or accessibility work.

## I. Quick Wins

- Invalidate reviewed eligibility when the ID changes; disable consequential actions until re-lookup (UX-02).
- Show the returned student name/canonical ID in a valid review (UX-06), after identity binding is fixed.
- Enable Enter in scanner login/manual lookup forms (UX-08).
- Make the wrong-room destination explicit in the normal action and explain the override (UX-07).
- Hide comments where Continue Scan does not save them (UX-11).
- Resolve the no-session recovery state and avoid premature completion language (UX-09).
- Distinguish an empty draft from a fully staffed draft (UX-10).
- Format the duplicate timestamp and correct neutral-versus-expired entry copy (UX-12, UX-13).

Quick wins are recommendations only. No code, copy, style, or behavior was changed.

## J. Structural Improvements

1. **One reliable committed assignment model:** detail, setup, summary, and editor must receive consistent assignments (UX-01). This is a targeted data-boundary repair, not a repository architecture rewrite.
2. **Explicit scanner review state:** distinguish editing, checking, reviewed, and submitting; bind actions and visible identity to the same lookup (UX-02, UX-05, UX-06, UX-11). Keep camera and outbox mechanisms intact.
3. **Consistent accessible field/dialog patterns:** labels, errors, focus, and disabled-state explanations should be systematic rather than patched independently on each page (UX-03, UX-05).
4. **Responsive containment rules:** establish which element scrolls, which grid children can shrink, and how filter groups reflow (UX-04). Retain semantic data tables.
5. **Navigation hierarchy for exception review:** situate Mismatch Present within the established Attendance context (UX-14); avoid expanding top-level navigation without evidence.

Source review additionally raises investigation questions about the unpaginated exam-detail attendance table and import-form network-exception recovery. These were not exercised at sufficient volume or under a real failed submission, so they are **unscored follow-up questions**, not observed P1/P2 defects. Do not turn them into a large redesign without confirming user impact.

## K. Recommended Implementation Sequence

### Phase 0 — Close evidence gaps before treating this as exact-commit acceptance

Use the recorded checkout with process-only staging configuration from an external secure environment file. Confirm the staging project before starting the server. Reproduce significant findings from this commit and record any deployment differences. Do not run the repository's staging browser suite unchanged: it is explicitly staging-targeted and includes interactions beyond this audit's read-only scope.

### Phase 1 — Correct decision data

1. Repair assignment hydration and validate that detail/setup/scanner agree (UX-01).
2. Bind result identity and action target; cover edit → re-lookup and out-of-order responses (UX-02).
3. Add the already-returned identity context (UX-06).

Use narrowly targeted tests in the later implementation task for assignment snapshot correctness and wrong-room/edited-ID behavior. Any write validation needs an explicitly authorized disposable environment; this audit did not authorize it.

### Phase 2 — Establish accessibility and efficient input

1. Introduce associated labels and control-specific guidance (UX-03).
2. Implement review-dialog focus and safe cancel/escape behavior (UX-05).
3. Add Enter submission for single-action scanner fields (UX-08).

Validate keyboard traversal, focus return, browser Back, pending lookup cancellation, and no duplicate requests together. These changes share the scanner interaction boundary and should not be implemented as unrelated patches.

### Phase 3 — Improve responsive operation and exception clarity

1. Fix shrink/wrap/scroll containment in admin layouts (UX-04).
2. Clarify wrong-room action priority and remove nonpersisting comment entry (UX-07, UX-11).
3. Finish empty-draft and recovery states (UX-09, UX-10, UX-12).

Verify populated and empty pages at a full desktop width, around the 900px boundary, and 390px. Preserve audit columns and existing server prerequisites.

### Phase 4 — Finish consistency and device acceptance

Format duplicate timestamps and restore mismatch navigation context (UX-13, UX-14). Then use the existing device-acceptance plan on representative Android and iPhone browsers, including soft keyboard, background/resume, real card scanning, and canceled review. Re-evaluate with `/evaluate` after accepted changes.

This sequence is suitable for a separate implementation task. Specialist routing: `/blueprint` for UX-01; `/journey` and `/fortify` for scanner state; `/include` for fields/dialog; `/transpose` for overflow; `/articulate` for state/action language; `/organize` for UX-14. `/investigate` or `/measure` would be needed for real user-frequency and time-on-task evidence, not to justify the already-observed defects.

## L. Preserve / Do Not Change

- Keep the draft/active/closed lifecycle and its business rules.
- Keep attendance uniqueness, explicit wrong-room overrides, immutable allocation meaning, and audit metadata.
- Keep assigned-active-room scoping for invigilators.
- Keep camera scanning with manual fallback available during initialization/failure.
- Keep distinct lookup outcome headings and expected-room/zone guidance.
- Keep the existing outbox/idempotency foundations; no offline behavior was validated sufficiently to justify replacing them.
- Keep URL-based audit filters, bounded global pagination, clear empty results, and exam-scoped metric links.
- Keep labeled navigation, semantic tables, native input controls, checkbox labels, and keyboard-operable disclosures.
- Keep scoped assignment editing with explicit Save and visible unsaved/unchanged state; fix the committed input data first.
- Keep typed deletion confirmation and explanatory close warnings as established safeguards. Their final actions were not exercised.
- Keep the restrained shared admin styling and branding. The findings do not support a cosmetic redesign, extra dashboard widgets, student self-service, or new attendance workflows.

## M. Evaluation Coverage and Limitations

### Coverage ledger

| Area | Actually observed | Not claimed |
| --- | --- | --- |
| Admin entry | Rendered sign-in; user manually signed in to staging | Invalid-password/rate-limit submissions, local admin session |
| Dashboard | Populated metrics, active/draft/history entry points | Live change propagation or production latency |
| Exam list | Two active, one draft, one closed; actions and pagination affordances | Close, delete, publication, successful export |
| Active detail | Ten rooms, 51 marks, one mismatch, four incidents; staffing disclosure/picker | Assignment save, concurrent edit result, high-volume completeness |
| New exam | Required fields, column guidance, stepper | File selection/upload, import validation/error/success |
| Draft | Existing zero-room draft and Continue To Review | Publication or draft creation |
| Staff | 22-person list, search to one synthetic invigilator, keyboard edit disclosure | Create/save/delete/regenerate/email actions |
| Attendance | Populated first page (50/51), filter to no results, scoped navigation | Exhaustive sort/pagination combinations, absent-student roster workflows not present in these screens |
| Incidents | Four populated incident types, filters, desktop/phone overflow | Incident creation or editing |
| Mismatches | Scoped empty draft result and global navigation state; mismatch counts elsewhere | Full populated mismatch-page walkthrough |
| Scanner | Synthetic login; loading/assigned room; manual ready/wrong/duplicate/not-found; corrected ID; Enter; Escape/focus; comment dismissal; room return | Attendance submission, redirect logging, override, durable queue/sync/conflict, forced network failures |
| Camera/OCR | Startup/model-loading text; manual lookup during startup; camera entered and later stopped | OCR accuracy/performance, permission-denied recovery, background endurance, real student-card testing |
| Recovery | Missing-session update-password state; visible request-another-link route | Recovery email delivery, valid token, new password submission |
| Native app | Repository workflow mapping only | Rendered Expo/native UX or parity with web |

### Evidence handling and confidence

- Rendered staging behavior and DOM observations are the primary evidence. Source was used to identify likely causes and distinguish read operations from writes.
- Significant findings have concrete screen text, input sequences, or measurements. Recommendations and possible consequences are distinguished from observed outcomes.
- Screenshots were viewed for meaningful login, setup, assignment overflow, incident overflow, and review states. No screenshot or generated asset was added to the repository. The report includes textual reproduction evidence rather than relying on historical screenshot files. Camera imagery is not reproduced in this document.
- The exact staging deployment SHA is unknown. Source corroboration is strong for UX-01, UX-02, UX-03, UX-05 through UX-14; responsive behavior also needs exact-local-runtime verification. No staging-only observation is silently treated as a verified execution of the baseline commit.
- The synthetic dataset supports realistic small operational examples, not scale or prevalence claims. Some staging staff entries were not clearly synthetic; they were neither edited nor used as report examples. No real student data was requested or imported.
- Authentication itself necessarily creates/refreshes auth session state and may produce auth/rate-limit telemetry. “Read-only” here means no application business-data mutations or outbound emails; it is not a claim that sign-in causes zero provider bookkeeping.
- No state was manufactured through patched code, fake app UI, route interception, or test fixtures. No attempt was made to bypass authentication.
- No tests were run that write staging data. Existing tests and device plans were read as context, not represented as newly passing.
- Successful/failed write feedback, outbox synchronization, email delivery, and concurrency behavior remain untested under the user's restrictions. These gaps cannot be filled by extrapolating from source.

## Final Safety Check

- No application source code was intentionally modified.
- No tests, configuration, dependencies, schemas, migrations, environment files, infrastructure, or generated application assets were intentionally modified.
- Next.js startup automatically patched `package-lock.json` with optional SWC entries. This incidental change was inspected and restored to the initially clean tracked baseline. No dependency install was performed in the repository.
- No commit, push, merge, deployment, staging business-data change, production change, attendance submission, email, or credential regeneration was performed.
- The local development server was stopped; port 3000 was no longer listening at the subsequent check. The browser scanner was returned to room selection after camera inspection.
- The only intentional repository addition is `docs/UX-AUDIT.md`.

Pre-existing untracked status, preserved:

```text
?? .agents/
?? .claude/
?? .codex/
?? agent/
?? docs/original-screenshots/
?? docs/original_screenshot_contact_sheet.html
?? docs/original_screenshot_contact_sheet.png
?? docs/screenshots/guide-contact-sheet.png
?? skills-lock.json
```

Final Git verification at **2026-09-04 10:50 AEST** confirmed the original branch and full commit above. `git diff --name-only` was empty (no tracked file modifications), and `git diff --check` reported no tracked whitespace errors. `git status --short` contained exactly the pre-existing untracked entries above plus:

```text
?? docs/UX-AUDIT.md
```

The browser viewport override was reset, and the scanner page had no camera video or review-sheet element remaining. Exact-local-runtime verification is still pending the external staging-only environment configuration; no production-backed local testing was used to fill that gap.
