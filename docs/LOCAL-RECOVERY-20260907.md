# Local Checkout Recovery - 7 September 2026

## Incident and evidence

Parent review found an unstaged deletion of
`apps/admin/app/api/attendance/lookup/route.ts`, a missing Playwright command shim,
and a missing admin Next.js installation in `C:/dev/AlgoAttendance`.
The user confirmed the deletion was not intentional.

All five available delegates were asked to investigate without writing files.
Ohm reported force-removing temporary capture worktrees while they contained
dependency junctions. Git cleanup encountered
`node_modules/@algo-attendance/admin/app/api/attendance/lookup` through those
links. This is the likely cause, not definitive filesystem attribution.
The other delegates reported no relevant recursive cleanup.

The deletion was not committed or pushed. No live database repair is involved.

## Recovery

- Restored the route using the committed source. Its Git blob matches HEAD:
  `c67a7d0069ca1e238018f38c9a93933ec74b2756`.
- Verified the root, admin, and mobile dependency directories were real
  directories at explicitly checked paths. Moved them without recursive
  deletion to `C:/dev/ExamPulse-dependency-recovery-20260907` for preservation.
- Reinstalled 986 packages with `npm ci --ignore-scripts --no-audit --no-fund`.
  No package or lockfile changes were made. This is not a vulnerability audit.
- Preserved unrelated untracked files and did not read or copy credentials.
- Added root `AGENTS.md` instructions prohibiting delegate cleanup of linked
  worktrees or shared dependencies.

The quarantine still contains links. Do not recursively delete it or follow
its workspace links during cleanup. Leave it in place until a separately
reviewed link-safe cleanup is authorized.

## Verification

- Main lookup source is identical to HEAD; no tracked incident changes remain.
- Web unit/API/server/scanner suite: 93 passed on the account-polish worktree.
- Independent account browser tests: 20 passed on `ui/account-polish` at
  `aaa44d6`, using the real-component B5 fixture with mocked service boundaries.
- Isolated production build: passed, including lint/type validation and 22
  generated static pages. The attendance lookup API appears in the route output.
  Production-sensitive environment variables were cleared for this build.
- Account-polish worktree remained clean after tests/build. Representative
  desktop before/after and phone error/missing-session captures were reviewed;
  the implementation diff is presentation-only. Integration remains pending.
- No push, deployment, live email, password change, or business-data write.
