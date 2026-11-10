import { RegisterForm } from "@/components/auth/auth-forms";
import { whatsappEnabled } from "@/modules/whatsapp/relay";

export const metadata = { title: "Daftar", robots: { index: false } };

export default function RegisterPage() {
  return <RegisterForm whatsapp={whatsappEnabled()} />;
}
