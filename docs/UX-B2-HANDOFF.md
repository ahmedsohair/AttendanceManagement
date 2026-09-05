# B2 Handoff: Accurate Exam Staffing and Readiness

## Independent Parent Review

Parent reviewed selected-exam assignment filtering, deterministic paging/bounds/error propagation, per-room allocation readiness, committed save baselines, dirty refresh retention, stale-scope navigation guards and unchanged server write contracts. No blocking B2 finding identified.

Independent reruns: 14 staffing tests passed; 20 isolated Chromium cases passed (35.1 seconds); branch diff whitespace check passed. Parent visually inspected the generated 390px long-content review screenshot and confirmed contained layout and visible actions. Agent full-suite/typecheck/build evidence remains below and is not relabelled as an independent rerun.

Approved for local integration into `hardening/staging`. Deployment, authenticated full-page staging checks, real persisted writes and physical-device acceptance remain pending. Existing capped detail-report arrays and B3 scanner dismissal remain outside B2.

## Scope and Revision

- Date: 5 September 2026. Worktree: `C:/dev/AlgoAttendance-ux-b2`; branch: `ux/exam-staffing-b2`.
- Starting revision: `72639aa306424fc58608f6333269fb8dff20dabd`.
- Implementation and tests: `0d1331e9f37921dc3ea9ee43607f13d8c40a9bd9` (`fix(admin): restore scoped exam staffing and truthful setup readiness`).
- Only B2: UX-01, UX-10, setup labels from UX-03, and assignment containment from UX-04. Fortify informed the failure, empty, unknown, dirty, pending and read-only states below.
- No migrations, dependency/lockfile changes, backend write-route/RPC changes, live mutations, pushes, integration or deployments. The package script change adds B2 tests to the existing server-unit suite. Publication validation, atomic saving, concurrency, email, auth and import contracts remain unchanged.

## Implementation and Boundaries

Both fast loaders use the same scoped staffing helper. Rooms are filtered by exam; assignments use at most 100 room IDs per IN chunk. Users and rooms are ordered by unique ID, assignments by the existing unique `(room_id, user_id)` pair. Pages request at most 500 rows and advance by the actual returned count, including when the provider imposes a smaller cap. Errors, changed counts, duplicate keys, incomplete results and missing assigned users fail the load rather than producing an empty or partial successful editor.

Safety bounds: 200 pages per paginated read; 50,000 users; 10,000 rooms; 50,000 assignments across all chunks; a shared 20-second staffing deadline. The generic paging helper has a default 15-second deadline when called independently. Bound failures propagate to unavailable page states with real reload links. These are read safety limits, not new business validation rules.

Draft readiness uses separate exam-and-room-scoped `limit(1)` allocation existence reads, at most four concurrently, with a 15-second deadline. Every room must have students. The omitted setup allocation array stays omitted; the capped detail report is not used to infer absence. Active/closed Supabase staffing reads do not add publication-prerequisite queries.

Badges, selections, summaries, totals and `expectedRoomAssignments` start from the same hydrated model. Clean refreshes adopt a new model. Dirty/busy refreshes retain local edits and their original save baseline with an explanation. Changing exams or entering closed/read-only mode remounts from supplied data. Old in-flight save/publication responses cannot navigate the newly mounted editor; already submitted writes are not claimed to be cancelled.

Only a complete committed `roomAssignments` response updates the successful-save baseline. Pending operations guard editing and re-entry. Conflicts or malformed responses preserve edits and stop save-then-publish, without automatic overwrite/retry. HTTP failures, including HTML failures, no longer navigate as publication success; the followed 303/HTML success flow is preserved.

Persistent labels cover Exam name, Exam date, Exam start time, Roster files, Search invigilators, Email address and Full name (optional). File guidance and returned validation text are associated. Assignment-only shrink/wrap rules and a 760px content-container breakpoint stack panels without global overflow hiding or an admin-shell redesign.

## Fortify State Inventory

| State | Visible behavior and recovery |
| --- | --- |
| Failed, incomplete or out-of-bounds read | Unavailable message and reload link; no healthy empty editor. |
| Zero rooms | No success staffing badge; review/publish disabled; roster link explicitly creates a new draft. |
| Zero allocations or any empty room | Publish disabled with missing-allocation count and corrected-roster guidance. |
| Unchecked allocations | Explicit unknown state; publish disabled; reload guidance. |
| Missing staff | Publish disabled; assign staff to each room. |
| Valid saved or dirty staffing | Save initially disabled; unsaved counts/status after edits; valid save-and-publish sequencing retained. |
| Pending operation or scope change | Editing/consequential controls guarded; no stale-scope publication continuation/navigation. |
| Conflict or malformed save response | Warning; edits and original baseline retained; publication stops. |
| Closed | Read-only supplied snapshot, not retained unsaved edits. |
| Long content and constrained width | Wrapping and stacked panels; badges remain readable and actions stay within the viewport. |

## Verification Results

Final checks below completed against implementation commit `0d1331e`. All backend/API fixtures were synthetic. Repository/page tests transpile the actual source in a VM with sealed dependencies and a read-only mock backend; no real Supabase client, auth, environment file or store write is loaded. The browser fixture imports the actual client components and CSS into a separate Next app, has no API routes, blocks unmocked API/external requests, and provides a local HTML target for the mocked 303 redirect.

| Check | Obtained result |
| --- | --- |
| `npm.cmd run test:web` | 93 passed: 14 shared, 29 API, 20 server-unit (including 14 B2), 30 scanner; zero failures. |
| `node node_modules/@playwright/test/cli.js test --config playwright.b2.config.mjs` | 20 passed; final run 37.0 seconds. |
| `npm.cmd run typecheck:web` | Passed, exit 0. |
| `npm.cmd --workspace @algo-attendance/admin run build` | Passed, exit 0; 22 static pages generated. Backend/email environment settings were cleared process-only and environment files were refused. |
| `git diff --check` and staged equivalent | Passed before implementation commit. |

An earlier direct focused run of `node --experimental-strip-types --test apps/admin/tests/exam-staffing.test.mjs` passed 13 cases. The additional active/closed-query regression was subsequently included in the final integrated server-unit run (14 B2 cases); this is not counted twice.

Loader coverage includes multiple staff per room, one staff member in multiple rooms, foreign-exam exclusion, 1,101 users, 1,001 rooms, 1,102 assignments (1,101 in one room), smaller provider caps, later user/room/assignment page failures, count changes, duplicate keys, bounds/deadlines, missing users, empty exams, fallback scope, per-room existence reads and unavailable page rendering.

Browser coverage includes baseline payloads and committed-response adoption, dirty/clean refreshes, exam changes during save/publication, 409 conflicts, malformed save success, HTML/network publication failure, save-before-followed-303 success, zero/unknown/partial readiness, active/closed transitions, labels and described validation, search, and long content at 390, 768, 899, 900, 910 and 1440 CSS pixels. Width assertions cover editing with inline creation and review. Screenshots are reproducible at `test-results/b2-review-{width}.png` (ignored generated artifacts); 390px and 910px images were visually inspected. Extreme text exposed a compressed badge, corrected without widening the page.

## Fixture Setup and Initial Failures

Existing root/admin `node_modules` were junctioned from `C:/dev/AlgoAttendance`; the fixture also has a junction to the existing admin modules so Next resolves at runtime. No environment files were copied. The fixture config refuses environment files and blanks inherited Supabase/database/email settings, binds only `127.0.0.1:3112`, refuses server reuse, and bounds startup to 90 seconds.

Initial startup attempts failed because of an incorrect fixture relative path and missing local Next module resolution (one 90-second startup timeout). The first running suite passed 7/18: ten failures were a fixture hydration race (`setStaffingFixture` not installed yet), and one was the mocked redirect target (Playwright does not reroute the redirected fetch). Correcting paths/junction resolution, waiting for fixture hydration and providing a real local HTML target resolved these failures. The final 20-case run passed without retries. No live backend workaround or dependency installation was used.

## Remaining Gates and Limitations

- The paginated model is **not a transactionally atomic database snapshot**. Equal-count concurrent replacements can escape count/duplicate checks. The existing atomic save RPC's expected-assignment comparison remains authoritative; read serializability is not claimed.
- Allocation checks are advisory reads, not a replacement for the server's publication validation under concurrent changes.
- No live persisted save, publication, email, import, authentication or invigilator/scanner access was exercised. Mocks establish request/read-model behavior, not live RLS/RPC behavior or delivery.
- Browser evidence concerns the isolated real-component/CSS fixture with an admin-shell fixture, not an authenticated full staging page with all report tables. Existing report row caps, audit/shared containment and B1/B3 are outside this change.
- Physical iPhone/Android, Safari, screen-reader/assistive-technology and zoom acceptance remain open. Desktop resizing is not physical acceptance.
- Parent final review, exact-revision staging verification and explicitly authorized disposable write-path checks remain release gates. No release acceptance or waiver of existing dependency/Phase 8 gates is claimed.
