# ExamPulse Project Overview

## 1. Purpose

ExamPulse is an examination attendance management system for replacing paper-based invigilator attendance sheets.

The system supports:

- Importing exam rosters from spreadsheets.
- Assigning students to rooms and zones.
- Assigning invigilators to exam rooms.
- Marking attendance by scanning printed student ID numbers.
- Manually entering student IDs when scanning is not possible.
- Detecting wrong-room students and showing their expected room/zone.
- Allowing explicit wrong-room attendance overrides with an audit flag.
- Recording incidents such as wrong-room redirects, duplicate attempts, and student-not-found events.
- Viewing dashboards, attendance details, incidents, and exporting XLSX reports.

The current production brand is `ExamPulse`.

## 2. Current Deployment

Production web/admin app:

```text
https://attendance-management-admin.vercel.app
```

Backend database/auth provider:

```text
Supabase
```

Production hosting:

```text
Vercel
```

Repository:

```text
https://github.com/ahmedsohair/AttendanceManagement
```

## 3. Repository Layout

```text
apps/
  admin/      Next.js web admin app and cross-platform web scanner
  mobile/     Expo / React Native mobile app

packages/
  shared/     Shared TypeScript types and attendance business logic

supabase/
  schema.sql  Database schema, indexes, and RLS policy definitions

scripts/
  create-admin.mjs       Creates/repairs an admin account
  verify-supabase.mjs    Verifies Supabase setup

PROJECT_OVERVIEW.md      This document
```

## 4. Main Components

### Admin Web App

Location:

```text
apps/admin
```

Technology:

- Next.js 15
- React 19
- Supabase SSR/auth helpers
- XLSX export via `xlsx`
- Web scanner OCR via `@paddleocr/paddleocr-js` / ONNX Runtime Web

Main responsibilities:

- Admin login and password reset.
- Create/import exams.
- Manage exam lifecycle: draft, active, closed.
- Assign invigilators and rooms.
- Manage invigilator records and access codes.
- View attendance and incident data.
- Export reports.
- Provide browser-based scanner at `/scan`.

### Mobile App

Location:

```text
apps/mobile
```

Technology:

- Expo SDK 55
- React Native 0.83
- Supabase JS
- Vision Camera
- ML Kit-based native scanning path for Android development/production builds

Main responsibilities:

- Invigilator access-code login.
- Room selection.
- Live scan flow.
- Manual ID entry.
- Attendance lookup/marking.
- Wrong-room override/redirect actions.
- Offline queue support for mark requests.

Current install strategy:

- Android can be built as APK/AAB through EAS or local Gradle.
- iOS native builds require a paid Apple Developer account for normal distribution.
- Browser scanner exists as a cross-platform fallback for iOS and Android users.

### Shared Package

Location:

```text
packages/shared
```

Main responsibilities:

- Shared entity types.
- Import payload normalization.
- Attendance lookup logic.
- Attendance mark logic.
- Report summary generation.

This package is important because both the admin app and mobile app rely on the same behavior for attendance rules.

## 5. Core Workflows

### Admin: Add New Exam

1. Admin signs in.
2. Admin opens `Add New Exam`.
3. Admin uploads a spreadsheet.
4. Required spreadsheet columns:

```text
student_id
student_name
room
zone
```

5. Optional spreadsheet columns:

```text
course_code
program
```

6. System creates:

- `ExamSession`
- `Room`
- `StudentAllocation`

7. Exam starts as `draft`.
8. Admin assigns invigilators to this exam's rooms.
9. Admin publishes the exam when ready.

### Admin: Exam Lifecycle

Exam sessions have a `status`:

```text
draft
active
closed
```

Behavior:

- Draft exams are editable/manageable before use.
- Active exams are visible to invigilators.
- Closed exams remain available for history/reporting.
- Publishing one exam does not automatically close or demote another exam.
- Exams can be deleted if the admin chooses.

### Admin: Invigilator Management

Invigilators are managed as general staff records.

Admin can:

- Add an invigilator.
- Edit invigilator details.
- Delete an invigilator if they have no audit history.
- Generate a new access code.
- Open a mailto email draft containing a generated code.
- Assign invigilators to rooms from the exam detail/add exam workflow.

Important security rule:

- Access codes are stored as hashes.
- Existing access codes cannot be viewed again.
- If a code is lost, generate a new one.

### Invigilator: Login

Invigilators login using an access code such as:

```text
AMS-XXXX-XXXX
```

Internally:

- The code maps to an invigilator account.
- Supabase auth signs in with the invigilator email and the access code as password.
- The mobile/web scanner then loads only active rooms assigned to that invigilator.

### Invigilator: Attendance Scan

1. Invigilator opens assigned room.
2. Camera scanner reads the printed student number.
3. System pauses scan and looks up the student.
4. Possible outcomes:

- Student is in correct room.
- Student is in wrong room.
- Student was already marked.
- Student is not found.

5. Invigilator chooses the appropriate action.
6. Scanner resets for the next student.

### Wrong-Room Student Flow

If a student is assigned to another room:

Default action:

- Send student to correct room.
- Log incident as `wrong_room_redirected`.
- Do not mark attendance.

Override action:

- Mark present in the current room.
- Store mismatch metadata.
- Log incident as `wrong_room_present_override`.
- Set `room_mismatch=true`.
- Preserve the original allocation.

The roster allocation is never changed by an override.

### Duplicate Attendance

Attendance is unique per exam session and student:

```text
unique (exam_session_id, student_id)
```

This prevents two devices from marking the same student present twice.

If another invigilator/device tries to mark the same student again, the system returns an already-marked/duplicate response.

## 6. Data Model

Defined in:

```text
supabase/schema.sql
```

### users

Represents admin and invigilator users.

Important fields:

- `id`
- `email`
- `full_name`
- `role`
- `access_code_hash`

Roles:

```text
admin
invigilator
```

### exam_sessions

Represents one exam instance.

Important fields:

- `id`
- `name`
- `exam_date`
- `start_time`
- `published`
- `status`
- `created_at`

Statuses:

```text
draft
active
closed
```

### rooms

Represents exam rooms for a specific exam session.

Important fields:

- `id`
- `exam_session_id`
- `code`
- `display_name`
- `capacity`

Constraint:

```text
unique (exam_session_id, code)
```

### room_assignments

Maps invigilators to rooms.

Important fields:

- `id`
- `room_id`
- `user_id`

Constraint:

```text
unique (room_id, user_id)
```

### student_allocations

Stores official roster allocation for each student.

Important fields:

- `id`
- `exam_session_id`
- `student_id`
- `student_name`
- `room_id`
- `zone`
- `course_code`
- `program`

Constraint:

```text
unique (exam_session_id, student_id)
```

### attendance_events

Stores attendance marks.

Important fields:

- `exam_session_id`
- `student_id`
- `marked_by_user_id`
- `marked_in_room_id`
- `expected_room_id`
- `source`
- `override_type`
- `room_mismatch`
- `comment`
- `device_id`
- `created_at`

Allowed sources:

```text
ocr
manual
```

Allowed override types:

```text
none
wrong_room_present
```

Constraint:

```text
unique (exam_session_id, student_id)
```

### incidents

Stores audit incidents.

Important fields:

- `exam_session_id`
- `student_id`
- `room_id`
- `expected_room_id`
- `user_id`
- `incident_type`
- `details`
- `created_at`

Incident types:

```text
wrong_room_redirected
wrong_room_present_override
duplicate_attempt
student_not_found
```

## 7. Performance Indexes

The schema includes indexes for common lookup/live-report paths:

```sql
idx_student_allocations_session_student
idx_attendance_events_session_student
idx_attendance_events_room_created_at
idx_attendance_events_room_mismatch
idx_incidents_room_created_at
idx_incidents_session_room_type
```

These should be applied in Supabase SQL Editor when deploying schema changes.

The app uses some targeted admin queries for dashboard/session overview to avoid loading the full roster when only summary data is needed.

Scanner hot endpoints are instrumented with `[perf]` logs:

- `api.mobile.access-login`
- `api.mobile.my-rooms`
- `api.rooms.live`
- `api.attendance.lookup`
- `api.attendance.mark`
- `page.dashboard`
- `page.sessions`

Vercel logs can be checked with:

```bash
npx.cmd vercel logs https://attendance-management-admin.vercel.app --since 30m --query "[perf]" --json
```

## 8. API Endpoints

### Admin / Exam Setup

```text
POST /api/exam-sessions/import
POST /api/exam-sessions/:id/publish
POST /api/exam-sessions/:id/close
POST /api/exam-sessions/:id/delete
GET  /api/reports/:examSessionId/export
```

### Auth / Mobile Bootstrap

```text
POST /api/mobile/access-login
GET  /api/mobile/my-rooms
GET  /api/auth/me
POST /api/auth/login
```

### Attendance

```text
POST /api/attendance/lookup
POST /api/attendance/mark
GET  /api/rooms/:roomId/live
```

### Scanner

```text
GET /scan
```

The web scanner is a browser page, not a separate backend service.

## 9. OCR / Scanner Details

### Web Scanner

Location:

```text
apps/admin/src/components/web-scanner-app.tsx
```

Behavior:

- Uses browser camera.
- Crops OCR to the visible red scan box.
- Uses ONNX/PaddleOCR for student number detection.
- Applies low-light preprocessing.
- Supports best-effort torch/flash if the browser/device exposes torch support.
- Keeps camera open and resets after marking/continuing.
- Shows explicit loading states for room loading and student lookup.

Important design decision:

- OCR is intentionally limited to the scan box to avoid reading expiry dates/barcodes/other printed numbers.

### Android Native Scanner

Location:

```text
apps/mobile/src/components/LiveTextScanner*
```

Behavior:

- Uses Vision Camera and ML Kit where available.
- Requires a native development/production build.
- Expo Go cannot run the native scanner.

## 10. Authentication And Access Control

Admin:

- Uses Supabase auth.
- Admin page access requires `role = admin`.

Invigilator:

- Uses generated access code.
- Code is hashed in `users.access_code_hash`.
- Access code is also used as the Supabase auth password for the invigilator account.
- Invigilator access is scoped by `room_assignments`.

Room access rule:

- Invigilators only see active exam rooms assigned to them.
- Admins can access admin pages and scanner resources.

## 11. Environment Variables

Admin/web app expects Supabase env vars.

Typical `.env.local` values:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Mobile app expects:

```text
EXPO_PUBLIC_API_BASE_URL=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

The mobile app also has fallbacks in `apps/mobile/app.config.js`.

Do not commit service-role keys or private credentials.

## 12. Local Development

Install dependencies:

```bash
npm install
```

Run admin app:

```bash
npm run dev:admin
```

Run mobile dev server:

```bash
npm run dev:mobile
```

Create/repair admin user:

```bash
npm run create:admin
```

Verify Supabase:

```bash
npm run verify:supabase
```

Build all workspaces:

```bash
npm run build
```

Build admin only:

```bash
npm.cmd --workspace @algo-attendance/admin run build
```

## 13. Mobile Builds

Configure EAS:

```bash
npm run build:mobile:configure
```

Android preview build:

```bash
npm run build:mobile:android:preview
```

Android production build:

```bash
npm run build:mobile:android:production
```

iOS preview build:

```bash
npm run build:mobile:ios:preview
```

iOS production build:

```bash
npm run build:mobile:ios:production
```

Notes:

- Android APK installs are possible for direct testing.
- Google Play distribution requires a paid Google Play developer account.
- iOS App Store/TestFlight distribution requires a paid Apple Developer account.
- Free Apple developer accounts can test on personal devices but are not suitable for self-service organizational deployment.

## 14. Production Operations

### Vercel Deployment

Production deploys automatically from GitHub `main`.

After pushing changes:

1. Wait for Vercel deployment.
2. Open production URL.
3. Verify login/dashboard.
4. Verify scanner login/room selection if scanner changes were made.

### Supabase Schema Updates

Schema changes in `supabase/schema.sql` must be applied in Supabase SQL Editor unless a migration system is introduced.

Safe index updates use:

```sql
create index if not exists ...
```

### Logs

Fetch recent logs:

```bash
npx.cmd vercel logs https://attendance-management-admin.vercel.app --since 30m
```

Fetch timing logs:

```bash
npx.cmd vercel logs https://attendance-management-admin.vercel.app --since 30m --query "[perf]" --json
```

## 15. Reporting

Reports support:

- Normal attendance.
- Mismatch-present attendance.
- Wrong-room incidents.
- Student-not-found incidents.
- Invigilator details where available.
- Expected room and marked-in room for auditability.

Export endpoint:

```text
GET /api/reports/:examSessionId/export
```

## 16. Current UX Principles

Admin:

- Keep dashboard clean.
- Draft/active/closed exams are clearly separated.
- Room assignment happens in exam context, not in the general invigilator list.
- Invigilator page is a general staff registry.

Invigilator:

- Scanner should stay open.
- After each scan, show a review/action sheet.
- While lookup is pending, do not show confusing edit/lookup actions.
- Empty states should only appear after data loading completes.
- Wrong-room override must be explicit and auditable.

## 17. Known Limitations And Future Improvements

### Performance

Current performance work:

- Dashboard overview uses targeted queries.
- Sessions overview uses targeted queries.
- Scanner APIs avoid duplicate full-store reads where possible.
- Hot endpoints have timing logs.

Potential next improvements:

- Replace remaining full-store hydration in scanner lookup/live/mark with direct Supabase queries or RPC functions.
- Add optimistic UI updates after marking attendance.
- Reduce live polling or move to realtime subscriptions if needed.
- Add request duration dashboards rather than relying only on Vercel logs.

### OCR

Current OCR is working well, but performance and accuracy depend on:

- Lighting.
- Camera quality.
- Card positioning.
- Browser/device support.

Future options:

- Fine tune OCR preprocessing by device.
- Add stronger scan-box guidance.
- Add per-device OCR performance telemetry.

### Mobile Distribution

Current practical path:

- Android APK/AAB when ready.
- Browser scanner for cross-platform use.

Future options:

- Google Play internal/self-service distribution.
- Apple Developer account and TestFlight/App Store distribution.

### Database Migrations

Currently schema is stored in `supabase/schema.sql`, but production changes are manually applied.

Future improvement:

- Introduce a formal migration workflow.

## 18. Useful File References

Admin layout/branding:

```text
apps/admin/app/layout.tsx
apps/admin/app/globals.css
apps/admin/public/exampulse_logo.svg
```

Web scanner:

```text
apps/admin/src/components/web-scanner-app.tsx
```

Attendance API routes:

```text
apps/admin/app/api/attendance/lookup/route.ts
apps/admin/app/api/attendance/mark/route.ts
apps/admin/app/api/rooms/[roomId]/live/route.ts
```

Repository/mutations:

```text
apps/admin/src/lib/repository.ts
```

Auth/access control:

```text
apps/admin/src/lib/auth.ts
```

Store/Supabase hydration:

```text
apps/admin/src/lib/store.ts
```

Admin overview targeted queries:

```text
apps/admin/src/lib/admin-queries.ts
```

Shared attendance logic:

```text
packages/shared/src
```

Mobile app:

```text
apps/mobile/App.tsx
apps/mobile/src
```

Database:

```text
supabase/schema.sql
```
