#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

psql_args=("$DATABASE_URL" --set ON_ERROR_STOP=1 --no-psqlrc)

psql "${psql_args[@]}" --file scripts/ci/prepare-postgres.sql
psql "${psql_args[@]}" --single-transaction --file supabase/schema.sql

apply_migrations() {
  local pass="$1"
  echo "Applying migrations (${pass})"
  while IFS= read -r migration; do
    echo "  ${migration}"
    psql "${psql_args[@]}" --single-transaction --file "$migration"
  done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)
}

apply_migrations "first pass"
apply_migrations "idempotency pass"

table_count="$(psql "${psql_args[@]}" --tuples-only --no-align --command "
  select count(*)
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'users', 'exam_sessions', 'rooms', 'room_assignments',
      'student_allocations', 'attendance_events', 'incidents'
    );
")"

if [[ "$table_count" != "7" ]]; then
  echo "Expected 7 core application tables after migrations, found ${table_count}." >&2
  exit 1
fi

echo "All migrations applied twice against temporary PostgreSQL; 7 core tables verified."
