import type { Metadata } from "next";
import "./globals.css";
import { NavigationProvider } from "@/components/ui/navigation";
import { getPublishedAppearance } from "@/modules/appearance/published";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { config } = await getPublishedAppearance();
  const name = config.identity.name;
  return {
  metadataBase: new URL(process.env.APP_ORIGIN || "http://localhost:3000"),
  title: {
    default: name,
    template: `%s | ${name}`,
  },
  description:
    "Jelajahi katalog produk dan kelola pesanan di toko online ini.",
  openGraph: {
    title: name,
    description: "Toko online mandiri.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: name },
};
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body><NavigationProvider>{children}</NavigationProvider></body>
    </html>
  );
}
