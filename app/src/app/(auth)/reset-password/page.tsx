import { ResetForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset Password", robots: { index: false } };

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  return <ResetForm token={params.token ?? ""} />;
}
