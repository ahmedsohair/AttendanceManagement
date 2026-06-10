import { AdminLoginForm } from "@/components/admin-login-form";
import { getSafeNextPath } from "@/lib/safe-next-path";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminLoginForm
      initialNextPath={getSafeNextPath(params.next)}
      unauthorized={params.error === "unauthorized"}
      reset={params.reset}
    />
  );
}
