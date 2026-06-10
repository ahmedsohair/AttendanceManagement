create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'invigilator')),
  access_code_hash text unique,
  created_at timestamptz not null default now()
);

alter table users add column if not exists access_code_hash text unique;
create unique index if not exists idx_users_access_code_hash
on users(access_code_hash)
where access_code_hash is not null;

create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exam_date date not null,
  start_time text not null,
  published boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

alter table exam_sessions
add column if not exists status text not null default 'draft'
check (status in ('draft', 'active', 'closed'));

update exam_sessions
set status = case when published then 'active' else 'draft' end
where status is null or status = '';

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references exam_sessions(id) on delete cascade,
  code text not null,
  display_name text not null,
  capacity integer,
  unique (exam_session_id, code)
);

create table if not exists room_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  unique (room_id, user_id)
);

create table if not exists student_allocations (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references exam_sessions(id) on delete cascade,
  student_id text not null,
  student_name text not null,
  room_id uuid not null references rooms(id) on delete cascade,
  zone text not null,
  course_code text,
  program text,
  unique (exam_session_id, student_id)
);

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references exam_sessions(id) on delete cascade,
  student_id text not null,
  marked_by_user_id uuid not null references users(id),
  marked_in_room_id uuid not null references rooms(id),
  expected_room_id uuid not null references rooms(id),
  source text not null check (source in ('ocr', 'manual')),
  override_type text not null check (override_type in ('none', 'wrong_room_present')),
  room_mismatch boolean not null default false,
  comment text,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (exam_session_id, student_id)
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references exam_sessions(id) on delete cascade,
  student_id text,
  room_id uuid references rooms(id),
  expected_room_id uuid references rooms(id),
  user_id uuid references users(id),
  incident_type text not null check (
    incident_type in (
      'wrong_room_redirected',
      'wrong_room_present_override',
      'duplicate_attempt',
      'student_not_found'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_exam_session_id on rooms(exam_session_id);
create index if not exists idx_room_assignments_user_id on room_assignments(user_id);
create index if not exists idx_student_allocations_exam_session_id on student_allocations(exam_session_id);
create index if not exists idx_student_allocations_room_id on student_allocations(room_id);
create index if not exists idx_student_allocations_session_student on student_allocations(exam_session_id, student_id);
create index if not exists idx_attendance_events_exam_session_id on attendance_events(exam_session_id);
create index if not exists idx_attendance_events_marked_in_room_id on attendance_events(marked_in_room_id);
create index if not exists idx_attendance_events_session_student on attendance_events(exam_session_id, student_id);
create index if not exists idx_attendance_events_room_created_at on attendance_events(marked_in_room_id, created_at desc);
create index if not exists idx_attendance_events_room_mismatch on attendance_events(marked_in_room_id, room_mismatch);
create index if not exists idx_incidents_exam_session_id on incidents(exam_session_id);
create index if not exists idx_incidents_room_id on incidents(room_id);
create index if not exists idx_incidents_room_created_at on incidents(room_id, created_at desc);
create index if not exists idx_incidents_session_room_type on incidents(exam_session_id, room_id, incident_type);

alter table users enable row level security;
alter table exam_sessions enable row level security;
alter table rooms enable row level security;
alter table room_assignments enable row level security;
alter table student_allocations enable row level security;
alter table attendance_events enable row level security;
alter table incidents enable row level security;

drop policy if exists "users can read own profile" on users;
create policy "users can read own profile"
on users for select
using (id = auth.uid());

drop policy if exists "invigilators can read published sessions" on exam_sessions;
create policy "invigilators can read published sessions"
on exam_sessions for select
using (status = 'active');

drop policy if exists "invigilators can read assigned rooms" on rooms;
create policy "invigilators can read assigned rooms"
on rooms for select
using (
  exists (
    select 1
    from room_assignments ra
    where ra.room_id = rooms.id
      and ra.user_id = auth.uid()
  )
);

drop policy if exists "invigilators can read their allocations" on student_allocations;
create policy "invigilators can read their allocations"
on student_allocations for select
using (
  exists (
    select 1
    from room_assignments ra
    where ra.room_id = student_allocations.room_id
      and ra.user_id = auth.uid()
  )
);

drop policy if exists "invigilators can insert attendance for their rooms" on attendance_events;
drop policy if exists "invigilators can insert attendance for their assigned active rooms" on attendance_events;
create policy "invigilators can insert attendance for their assigned active rooms"
on attendance_events for insert
with check (
  marked_by_user_id = auth.uid()
  and exists (
    select 1
    from room_assignments ra
    join rooms marked_room
      on marked_room.id = attendance_events.marked_in_room_id
    join exam_sessions session
      on session.id = attendance_events.exam_session_id
    join student_allocations allocation
      on allocation.exam_session_id = attendance_events.exam_session_id
     and allocation.student_id = attendance_events.student_id
    where ra.room_id = marked_room.id
      and ra.user_id = auth.uid()
      and marked_room.exam_session_id = attendance_events.exam_session_id
      and session.status = 'active'
      and allocation.room_id = attendance_events.expected_room_id
      and (
        (
          room_mismatch = false
          and override_type = 'none'
          and attendance_events.expected_room_id = attendance_events.marked_in_room_id
        )
        or (
          room_mismatch = true
          and override_type = 'wrong_room_present'
          and attendance_events.expected_room_id <> attendance_events.marked_in_room_id
        )
      )
  )
);
