import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Masuk", robots: { index: false } };

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <LoginForm redirectTo={params.redirectTo} />;
}
