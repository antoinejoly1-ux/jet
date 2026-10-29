import { ForgotPasswordForm } from "@/components/auth/password-forms";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { email } = await searchParams;
  return <ForgotPasswordForm defaultEmail={typeof email === "string" ? email : undefined} />;
}
