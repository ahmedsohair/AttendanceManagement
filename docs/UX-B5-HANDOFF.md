# B5 Handoff: Credential Recovery Forms

## Commit Scope

- Base: `08f9d19a836308d06e4f46013a80f22178cb2f6f`
- Primary implementation and tests: `a46b4c4bed319aedf911d8e2c31f932954f68eae`
- Follow-up terminal-copy/test correction: `85282e645ba3c6c8500a9e55efca8ee2cc6160a8`
- Parent-review race reproductions: `4ee3cf086ca8b3155a296a4fd04fa390d5f5bdde`
- Recovery ownership correction and expanded coverage: `800a739048db02e0878c20c75ff54e5e6f4932de`
- Branch: `ux/credential-recovery-b5`
- Worktree: `C:\dev\AlgoAttendance-ux-b5`

B5 only is implemented. `docs/UX-IMPLEMENTATION-PLAN.md`, `docs/UX-AUDIT.md`, the auth callback route, backend/API/auth token exchange, middleware, roles, password policy, email semantics, scanner code, and B4 surfaces were not changed.

## Implementation

- `UpdatePasswordForm` now owns explicit `checking`, `ready`, `missing`, `error`, `submitting`, and `success` states.
- A resolved null session, including `PASSWORD_RECOVERY` with a null session, terminates as `No valid recovery session. Request a new reset email.` with new-link guidance.
- Check errors and bounded stalls are distinct from missing-session guidance. The five-second timeout increments the check generation; a later legitimate auth/recovery event can still establish readiness, while the earlier promise is ignored.
- Older `getSession` results cannot override newer auth events. Unmount cleanup clears the timer, unsubscribes, invalidates pending work, and ignores late results.
- Password updates use a synchronous submission ref guard and current-user ownership. Same-account `TOKEN_REFRESHED`, `SIGNED_IN`, and `USER_UPDATED` events preserve an in-flight update and confirmed success without creating a second update. `SIGNED_OUT`/null sessions, account changes, `PASSWORD_RECOVERY`, and unmount invalidate stale completion and clear password drafts; only an accepted current update exposes success and clears password fields.
- Auth subscription setup is owned by a ref and installed once. If initial client construction throws, retry constructs the client, subscribes before checking, and later auth events still establish readiness without leaking duplicate listeners.
- Auth callbacks only update local state and ownership. They do not call Supabase auth methods synchronously.
- Return-to-sign-in preserves the existing sign-out and navigation behavior, with duplicate-action and sign-out-error guards.
- Login, reset-request, update-password, and invigilator create/search/edit controls have persistent labels, stable IDs, autocomplete, and linked error/status guidance. Native GET search, server forms, disclosures, access-code controls, and existing field semantics remain intact.

## Changed Files

- `apps/admin/src/components/update-password-form.tsx`
- `apps/admin/src/components/admin-login-form.tsx`
- `apps/admin/src/components/reset-password-request-form.tsx`
- `apps/admin/app/invigilators/page.tsx`
- `apps/admin/app/globals.css`
- `e2e-b5/b5.spec.mjs`
- `e2e-b5/fixture/app/login/page.tsx`
- `e2e-b5/fixture/app/reset-password/page.tsx`
- `e2e-b5/fixture/app/update-password/page.tsx`
- `e2e-b5/fixture/app/invigilators/page.tsx`
- `e2e-b5/fixture/app/layout.tsx`
- `e2e-b5/fixture/mocks/supabase-browser.js`
- `e2e-b5/fixture/mocks/admin-queries.js`
- `e2e-b5/fixture/mocks/auth.js`
- `e2e-b5/fixture/mocks/repository.js`
- `e2e-b5/fixture/mocks/supabase.js`
- `e2e-b5/fixture/mocks/emails.js`
- `e2e-b5/fixture/next.config.mjs`
- `e2e-b5/fixture/tsconfig.json`
- `e2e-b5/fixture/next-env.d.ts`
- `playwright.b5.config.mjs`
- `docs/UX-B5-HANDOFF.md`

The fixture imports the production pages/components directly. Only fixture-local auth, query, repository, email, and Supabase browser boundaries are mocked. No copied production markup, production flags, dependency, lockfile, or environment file was added.

## Verification

- `npx.cmd --no-install playwright test --config playwright.b5.config.mjs`: **20 passed** after the recovery correction commit. Local Chromium on `127.0.0.1:3115`; all non-local browser requests aborted; inherited `SUPABASE`, `DATABASE`, `RESEND`, `SMTP`, and `SCANNER_TELEMETRY` variables cleared.
- `npm.cmd run test:web`: **93 passed** after the recovery correction commit across shared, API, server-unit, and scanner suites (`14 + 29 + 20 + 30`).
- `npm.cmd run typecheck:web`: passed after the recovery correction commit.
- `npm.cmd --workspace @algo-attendance/admin run build`: passed after the recovery correction commit, including compilation, lint/type validation, 22 static pages, and tracing.
- `git diff --check`: passed before commit.
- No package install, dependency change, lockfile change, real password update, reset email, mail send, session mutation, staging call, production call, push, merge, or deploy was performed.

## Limitations and Parent Review

- Recovery callback integration with a real Supabase recovery link, email delivery, token exchange, and actual password mutation is unavailable and intentionally untested. The callback contract was read but not rewritten.
- Browser coverage uses a fixture auth client for null/error/rejection/stall/late results, initial client-construction failure/retry, one-time subscription setup, benign same-account refresh events before and after update completion, sign-in/sign-out/account change, new recovery flow, update success/failure/rejection/pending, invalidation, stale completion, and unmount. It does not prove provider-specific event ordering beyond the mocked contract.
- Physical phone, screen-reader, and live staging acceptance remain open. B4 staging verification remains parent-owned and independent.
- Parent review should focus on auth-generation ownership, null-session invalidation, same-account `USER_UPDATED` handling during an update, stale completion suppression after account/session changes, truthful success timing, and preservation of existing authenticated-session recovery behavior.

Stop here for parent review. No push, merge, deploy, or staging mutation was performed.
