# ExamPulse Staging Environment

## Project Identity

- Supabase project reference: `bjoguceapwquyczbhlyp`
- Supabase URL: `https://bjoguceapwquyczbhlyp.supabase.co`
- Region: Southeast Asia (Singapore)
- Purpose: isolated schema, performance, security, integration, and browser testing
- Vercel URL: `https://exampulse-stagings.vercel.app`

The staging tools refuse the production project reference `mtoyhpyxqhfwhcrysqon`.

Schema bootstrap completed successfully on 27 August 2026. All seven application tables were created with RLS enabled.

Synthetic staging data was seeded and count-verified successfully on 27 August 2026.

The isolated Vercel deployment was smoke-tested successfully on 27 August 2026. The scanner returned HTTP 200, and synthetic access code `AMS-T001-0001` resolved to `invigilator01@example.com`, confirming that the deployment uses staging data.

The complete browser login and assigned-room flow was manually verified with synthetic access code `AMS-T001-0001` on 27 August 2026.

Web hardening was re-verified on 1 September 2026 after deployment from `hardening/staging`:

- `/scan` returned HTTP 200 and rendered the invigilator login without browser console warnings or errors.
- Synthetic access login returned HTTP 200 and resolved to `invigilator01@example.com`.
- `/api/auth/dev-login`, `/api/auth/login`, and the removed `/api/ocr/student-id` route returned HTTP 404.
- `X-Powered-By` was absent. `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and report-only CSP headers were present.
- The Vercel request continued to execute in Singapore (`sin1`).

## Bootstrap the Database Schema

In the staging Supabase dashboard, open **Connect**, select **Session pooler**, and copy the URI with `[YOUR-PASSWORD]` unchanged.

In PowerShell:

```powershell
$env:SUPABASE_STAGING_DB_URL = 'PASTE_STAGING_SESSION_POOLER_TEMPLATE'
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-supabase-staging.ps1 `
  -ConfirmStagingBootstrap
```

Enter the staging database password at the secure prompt. The script verifies the project reference, requires a clean application schema, applies `supabase/schema.sql` in one transaction, and confirms that all seven application tables exist.

Clear the connection template afterward:

```powershell
Remove-Item Env:SUPABASE_STAGING_DB_URL
```

## Seed Synthetic Data

Retrieve the staging service-role key from the staging Supabase project's API settings. Never use the production key and never paste either key into chat or source control.

Set temporary environment variables in PowerShell:

```powershell
$env:STAGING_SUPABASE_URL = 'https://bjoguceapwquyczbhlyp.supabase.co'
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY = 'STAGING_SERVICE_ROLE_KEY'
$env:STAGING_ADMIN_PASSWORD = 'A_UNIQUE_TEST_PASSWORD_WITH_AT_LEAST_12_CHARACTERS'
```

Run:

```powershell
node .\scripts\seed-supabase-staging.mjs
```

Then clear all three variables:

```powershell
Remove-Item Env:STAGING_SUPABASE_URL
Remove-Item Env:STAGING_SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:STAGING_ADMIN_PASSWORD
```

## Synthetic Dataset

- 1 staging administrator.
- 20 synthetic invigilators.
- 1 active, 1 draft, and 1 closed exam.
- 10 active-exam rooms.
- 2 invigilators assigned to each room.
- 1,000 synthetic student allocations.
- 21 attendance events, including one mismatch-present event.
- Wrong-room redirect, wrong-room override, duplicate-attempt, and student-not-found incidents.

Test identifiers:

- Admin email: `admin.staging@example.com`
- Invigilator codes: `AMS-T001-0001` through `AMS-T020-0020`
- Student IDs: `9000001` through `9001000`

The staging administrator password is deliberately not stored in the repository.

## Safety Rules

- Never configure production Vercel with staging credentials.
- Never configure staging Vercel with production credentials.
- Restrict staging email delivery to approved test recipients before testing email workflows.
- Keep staging email credentials unset unless a recipient allowlist is implemented and verified.
- Do not import real exam spreadsheets into staging.
- Do not reuse a production administrator or invigilator password.
- Re-run the seed only when resetting the deterministic synthetic test state is intended.
