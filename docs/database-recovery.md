# ExamPulse Database Recovery Procedure

## Scope

The production Supabase project is on the Free plan, which does not include automatic backups. A manual logical backup is required before database migrations and should also be taken before every real examination.

Backups contain student and staff information. They must not be committed to Git, uploaded to public storage, or shared through chat or email.

## Required Backup Set

Each backup contains:

- `roles.sql`: custom database roles.
- `schema.sql`: tables, indexes, constraints, functions, triggers, and policies in supported schemas.
- `data.sql`: table data using PostgreSQL `COPY` statements.
- `manifest.json`: file sizes and SHA-256 checksums.

Supabase-managed Auth and Storage internals are excluded by the ordinary CLI dump. ExamPulse currently stores its operational users in the public `users` table, while Supabase Auth configuration must be recreated separately in staging.

## Create a Production Backup

### 1. Obtain the production database connection string

In the production Supabase dashboard, open **Connect** and select the **Session pooler** database connection string. Use the pooler on port `5432`, not Direct connection and not Transaction pooler. The session pooler is IPv4-compatible and avoids Windows Docker failures with the direct project's IPv6-oriented hostname.

Copy the URI without replacing its `[YOUR-PASSWORD]` placeholder. The backup script requests the password securely and URL-encodes it automatically.

Do not use the project URL, publishable key, or service-role key; they are not database connection strings.

### 2. Set the connection for the current terminal only

Open PowerShell and run:

```powershell
$env:SUPABASE_DB_URL = 'postgresql://postgres.PROJECT:[YOUR-PASSWORD]@POOLER-HOST:5432/postgres'
```

This variable exists only in the current PowerShell process. It contains the non-secret connection template; the password is requested separately. Do not add either value to `.env`, source control, screenshots, or command output.

### 3. Start Docker Desktop

The Supabase CLI uses a containerized PostgreSQL toolchain for compatible dumps. Wait until Docker reports that it is running.

### 4. Run the guarded backup script

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-supabase.ps1
```

By default, files are written to:

```text
%USERPROFILE%\ExamPulseBackups\production-YYYYMMDD-HHMMSS
```

The script fails if Docker is unavailable, any dump fails, or an output file is empty. It also creates checksums in `manifest.json`.

### 5. Clear the temporary credential

```powershell
Remove-Item Env:SUPABASE_DB_URL
```

### 6. Protect the backup

- Keep one encrypted local copy.
- Keep a second encrypted copy on storage controlled by the project owner.
- Restrict access because attendance exports contain personal information.
- Never keep the only copy on the same computer as the application repository.

## Validate a Backup

Before relying on a backup:

1. Confirm all four files exist.
2. Confirm none of the SQL files is empty.
3. Recalculate SHA-256 hashes and compare them with `manifest.json`.
4. Restore the files into the separate staging Supabase project.
5. Confirm expected table counts and representative records.
6. Confirm production remains untouched throughout validation.

A backup is not considered verified until a separate project can restore and query it.

## Verified Recovery Point

The first hardening recovery point was created on 27 August 2026 at 10:50 local time.

| File | Bytes | Checksum verified |
| --- | ---: | --- |
| `roles.sql` | 358 | Yes |
| `schema.sql` | 15,687 | Yes |
| `data.sql` | 632,036 | Yes |

The backup contains all seven ExamPulse public tables and Supabase Auth recovery data. Structural validation found 2,691 student allocations, 697 attendance events, 28 rooms, 23 operational users, and 22 Auth users. No record contents were printed during validation.

The backup was restored successfully into temporary staging project `bawfayxvpkqmpsozulgv`. All verified public and Auth record counts matched the source backup. This temporary project must be deleted and recreated before staging is connected to Vercel, ensuring that the long-lived staging environment contains no restored production information.

### Guarded staging restore

Set the unmodified Session pooler template from the staging Supabase project:

```powershell
$env:SUPABASE_STAGING_DB_URL = 'postgresql://postgres.STAGING-REF:[YOUR-PASSWORD]@POOLER-HOST:5432/postgres'
```

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-supabase-staging.ps1 `
  -BackupDirectory "$HOME\ExamPulseBackups\production-20260827-105001" `
  -ConfirmStagingRestore
```

The script checks all backup hashes, refuses the known production project reference, requires an empty staging application schema, performs the restore in one transaction, and compares restored row counts with the backup. It prompts for the staging database password securely. During restoration it creates temporary SQL files that omit the prohibited `supabase_admin` alteration and the reserved `storage.buckets_vectors` and `storage.vector_indexes` data blocks. The original verified backup remains unchanged.

Clear the template afterward:

```powershell
Remove-Item Env:SUPABASE_STAGING_DB_URL
```

## Restore Safety Rules

- Never test restoration against production.
- Always verify the target project reference and hostname before running restore commands.
- Stop if the target connection string contains the production project reference.
- Restore inside a transaction with `ON_ERROR_STOP` enabled where supported.
- Reconfigure Supabase Auth URLs and API keys for staging after restoration.
- Replace production email addresses and student information with synthetic data before general staging use.

The exact staging restoration command will be recorded after the first backup is generated and its schema is inspected. This prevents using a generic destructive command against an unverified target.

## Routine Schedule

- Before every production schema migration.
- Before every real examination.
- After a real examination closes and reconciliation is complete.
- Before bulk deletion or archival.
- At least weekly while the Free-tier production database remains active.

## Recovery Owner Checklist

- [ ] Latest backup timestamp recorded.
- [ ] Manifest checksums verified.
- [ ] Two protected copies exist.
- [ ] Test restoration completed in staging.
- [ ] Staging record counts match the source backup before anonymization.
- [ ] Recovery outcome recorded in the hardening deployment log.
