import { getCurrentUser } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { WhatsAppSettings } from "@/components/admin/whatsapp-settings";
export default async function Page(){
 const user=await getCurrentUser(false);
 if(!user?.roles.includes("Admin")||process.env.STORE_WHATSAPP_ENABLED!=="1")notFound();
 return <WhatsAppSettings/>;
}
