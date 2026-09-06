import { AuditFixture } from "../audit-fixture";

export const dynamic = "force-dynamic";

export default async function IncidentsFixture({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  return <AuditFixture kind="incidents" searchParams={(await searchParams) || {}} />;
}
