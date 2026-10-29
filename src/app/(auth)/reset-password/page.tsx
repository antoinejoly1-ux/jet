import { ResetPasswordForm } from "@/components/auth/password-forms";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  // A used or expired link arrives as ?error=INVALID_TOKEN, with no token.
  const valid = typeof token === "string" && token.length > 0 && !error;
  return <ResetPasswordForm token={valid ? token : null} />;
}
