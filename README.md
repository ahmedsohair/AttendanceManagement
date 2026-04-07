# Attendance Management System

Monorepo starter for an exam attendance system with:

- `apps/admin`: Next.js admin dashboard and API backend
- `apps/mobile`: Expo React Native invigilator app
- `packages/shared`: shared types, validation, import parsing, and attendance rules

## Features

- Exam-session creation with spreadsheet import
- Published room allocations and room-level live totals
- Attendance lookup and marking by student number
- Wrong-room redirect incident logging
- Wrong-room override marking with audit flags
- Live on-device scanning as the default mobile workflow
- Optional comments on attendance marks and incidents
- Mobile offline mark queue
- XLSX export of attendance, summaries, and incidents

## Quick Start

1. Install dependencies:

```powershell
npm.cmd install
```

2. Start the admin/backend:

```powershell
npm.cmd run dev:admin
```

3. Start the mobile app:

```powershell
npm.cmd run dev:mobile
```

The admin app defaults to `http://localhost:3000`. Update `EXPO_PUBLIC_API_BASE_URL` in the Expo app if needed.

For a quick smoke test, import [samples/demo-session.csv](C:\Users\ahmad\OneDrive\Documents\hubgit\Algo_Attendance\samples\demo-session.csv) from the admin UI.

## Spreadsheet Columns

Required columns:

- `student_id`
- `student_name`
- `room`
- `zone`

Optional columns:

- `course_code`
- `program`

## Development Notes

- The admin app uses a local JSON store at `apps/admin/data/store.json` for development.
- Production schema and RLS notes are in `supabase/schema.sql`.
- The mobile app is optimized for live on-device scanning in a development build.

## Production Backend

The current app now supports two backends:

- Local file store for development fallback
- Supabase for production data storage

To switch to Supabase:

1. Copy [\.env.example](C:\dev\AlgoAttendance\.env.example) to `.env.local`
2. Set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EXPO_PUBLIC_API_BASE_URL`
3. Run [supabase/schema.sql](C:\dev\AlgoAttendance\supabase\schema.sql) against your Supabase project
4. Restart the admin app

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, the admin/API layer reads and writes from Supabase instead of `apps/admin/data/store.json`.

Current production-track scope:

- Supabase-backed sessions, rooms, allocations, attendance, incidents, reports, and invigilator assignments
- Web admin sign-in via Supabase Auth session cookies
- Mobile invigilator sign-in via Supabase email/password auth and bearer tokens
- Protected admin and mobile API routes that derive the signed-in user server-side

To create the first administrator account:

```powershell
npm.cmd run create:admin -- --email admin@example.com --password YourSecurePassword --name "Admin User"
```

For Expo mobile auth, also set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Still recommended before a full public rollout:

- Add database migrations/versioning workflow
- Add deployment config for Next.js hosting and mobile release builds
- Add password reset and staff account lifecycle tooling
