import { notFound } from "next/navigation";
import { WhatsAppAuth } from "@/components/auth/whatsapp-auth";
import { whatsappEnabled } from "@/modules/whatsapp/relay";
export const metadata = {
  title: "Verifikasi WhatsApp",
  robots: { index: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string;
    mode?: string;
    account?: string;
  }>;
}) {
  if (!whatsappEnabled()) notFound();
  const params = await searchParams;
  return (
    <WhatsAppAuth
      accountType={params.account === "seller" ? "seller" : "customer"}
      link={params.mode === "link"}
      redirectTo={params.redirectTo}
    />
  );
}
