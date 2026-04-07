import { AdminLoginForm } from "@/components/admin-login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminLoginForm
      initialNextPath={params.next || "/"}
      unauthorized={params.error === "unauthorized"}
      reset={params.reset}
    />
  );
}
