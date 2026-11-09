import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const section = (await searchParams).section;
  redirect(
    `/account/${["profile", "addresses", "security", "delete"].includes(section || "") ? section : "profile"}`,
  );
}
