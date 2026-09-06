import { AuditFixture } from "../audit-fixture";

export const dynamic = "force-dynamic";

export default async function AttendanceFixture({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  return <AuditFixture kind="attendance" searchParams={(await searchParams) || {}} />;
}
