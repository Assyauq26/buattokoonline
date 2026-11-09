import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const x of Array.isArray(v) ? v : v ? [v] : []) q.append(k, x);
  }
  redirect(
    "/admin/settings/shipping/manual" + (q.size ? "?" + q.toString() : ""),
  );
}
