import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const repository = "Assyauq26/buattokoonline";
const releasePage = `https://github.com/${repository}/releases`;
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const checkCommand = "sudo bash /opt/single-store/manager/update.sh --check";

async function latestRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) return { status: "none" } as const;
    if (!response.ok) return { status: "error" } as const;
    const release = await response.json();
    const version = typeof release.tag_name === "string" && release.tag_name.startsWith("v") ? release.tag_name.slice(1) : "";
    if (!versionPattern.test(version) || release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets))
      return { status: "error" } as const;
    const name = `store-v${version}.tar.gz`;
    const assets = release.assets.filter((asset: { name?: string }) => asset?.name === name);
    const asset = assets[0];
    if (assets.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ||
        asset.browser_download_url !== `${releasePage}/download/v${version}/${name}` || !(asset.size > 0 && asset.size <= 300 * 1024 * 1024))
      return { status: "unavailable" } as const;
    return { status: "ok", version, href: `${releasePage}/tag/v${version}` } as const;
  } catch {
    return { status: "error" } as const;
  }
}

function newer(latest: string, current: string) {
  const installed = current.split(".").map(Number);
  const firstDifference = latest.split(".").map((part, index) => Number(part) - installed[index]).find(Boolean);
  return (firstDifference ?? 0) > 0;
}

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  await requireBackofficeUser(PERMISSIONS.AUDIT_READ);
  const { check } = await searchParams;
  const current = process.env.STORE_INSTALLED_VERSION ?? "";
  const installed = versionPattern.test(current);
  const development = process.env.STORE_UPDATE_CHANNEL === "hubify-development";
  const stable = process.env.STORE_UPDATE_CHANNEL === "stable";
  const sha = process.env.STORE_BUILD_SHA ?? "";
  const release = check === "1" ? await latestRelease() : null;
  const available = stable && installed && release?.status === "ok" && newer(release.version, current);
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><h1 className="text-2xl font-bold tracking-tight">Update Versi</h1><p className="mt-1 text-sm text-zinc-600">Periksa versi aplikasi toko dan rilis resmi yang tersedia.</p></header>
    <section className="space-y-3 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Versi terpasang</h2>
      <p>{installed ? `v${current}` : "Belum terdeteksi dari VPS"}</p>
      {development && <p className="text-sm text-zinc-600">Hubify · Pengembangan{ /^[a-f0-9]{40}$/.test(sha) ? ` · Build ${sha.slice(0, 7)}` : ""}. Pembaruan dilakukan oleh operator Hubify.</p>}
    </section>
    <section className="space-y-4 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Rilis stabil</h2>
      <form action="/admin/updates" method="get"><button name="check" value="1" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Cek Update</button></form>
      {release?.status === "ok" && <p>Rilis terbaru: <a className="underline" href={release.href}>v{release.version}</a>. {development ? "Rilis ini tersedia untuk kanal stabil. Hubify memakai jalur pengembangan." : available ? "Versi lebih baru tersedia." : stable && installed ? "Tidak ada rilis yang lebih baru." : "Periksa versi terpasang melalui VPS untuk mengetahui apakah toko perlu diperbarui."}</p>}
      {release?.status === "none" && <p>Belum ada rilis stabil.</p>}
      {release?.status === "unavailable" && <p>Paket rilis resmi belum tersedia untuk dipasang.</p>}
      {release?.status === "error" && <p role="alert">Rilis tidak dapat diperiksa saat ini. Coba lagi nanti.</p>}
      {!development && <>
        <p className="text-sm text-zinc-600">Untuk verifikasi langsung di VPS, jalankan perintah ini melalui SSH:</p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-sm">{checkCommand}</pre>
      </>}
      {available && release.status === "ok" && <details className="rounded-lg border border-line p-4">
        <summary className="cursor-pointer font-semibold">Update Versi ke v{release.version} melalui SSH</summary>
        <p className="my-3 text-sm text-zinc-600">Jalankan perintah berikut di VPS. Updater memeriksa kompatibilitas dan meminta konfirmasi sebelum toko berhenti sementara.</p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-sm">{`sudo bash /opt/single-store/manager/update.sh --apply --version ${release.version}`}</pre>
      </details>}
    </section>
  </div>;
}
