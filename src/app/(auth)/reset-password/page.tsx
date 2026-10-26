import { ResetPasswordForm } from "@/components/auth/password-forms";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : null} />;
}
