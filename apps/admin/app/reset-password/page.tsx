import { ResetPasswordRequestForm } from "@/components/reset-password-request-form";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return <ResetPasswordRequestForm initialError={params.error} />;
}
