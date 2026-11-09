import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const q = new URLSearchParams(await searchParams);
  redirect("/admin/settings/shipping/coverage" + (q.size ? "?" + q : ""));
}
