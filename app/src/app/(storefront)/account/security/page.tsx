import { CustomerAccountScreen } from "@/components/storefront/customer-account-screen";
import Link from "next/link";
import { whatsappEnabled } from "@/modules/whatsapp/relay";
import { notificationsEnabled } from "@/modules/whatsapp/relay";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { WhatsAppConsent } from "@/components/storefront/whatsapp-consent";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user=await getCurrentUser(false);
  const consent=user&&notificationsEnabled()?await prisma.whatsAppConsent.findUnique({where:{userId:user.id}}):null;
  return <>{whatsappEnabled()&&<div className="mx-auto max-w-xl p-4"><Link className="underline" href="/whatsapp?mode=link">Kelola login WhatsApp</Link></div>}{user&&notificationsEnabled()&&<div className="mx-auto max-w-xl p-4"><WhatsAppConsent initial={!!consent?.granted}/></div>}<CustomerAccountScreen section="security" /></>;
}
