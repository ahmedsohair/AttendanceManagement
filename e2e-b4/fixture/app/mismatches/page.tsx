import { AuditFixture } from "../audit-fixture";

export const dynamic = "force-dynamic";

export default async function MismatchesFixture({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  return <AuditFixture kind="mismatches" searchParams={(await searchParams) || {}} />;
}
