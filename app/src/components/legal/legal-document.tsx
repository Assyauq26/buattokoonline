import Link from "next/link";
import { legalProfile } from "@/config/legal";
import { getPublishedAppearance } from "@/modules/appearance/published";
export async function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly (readonly [string, string])[];
}) {
  const { config } = await getPublishedAppearance();
  return (
    <article className="legal-document">
      <header>
        <p className="legal-eyebrow">Informasi toko ini</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-date">
          Terakhir diperbarui:{" "}
          <time dateTime={legalProfile.updatedAt}>
            {legalProfile.updatedLabel}
          </time>
        </p>
        {legalProfile.status === "draft" && (
          <aside className="legal-notice" aria-label="Status dokumen">
            {legalProfile.draftNotice}
          </aside>
        )}
      </header>
      <nav className="legal-toc" aria-label="Daftar isi">
        <h2>Daftar isi</h2>
        <ol>
          {sections.map(([heading], i) => (
            <li key={heading}>
              <a href={`#bagian-${i + 1}`}>{heading}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="legal-sections">
        {sections.map(([heading, text], i) => (
          <section key={heading} id={`bagian-${i + 1}`}>
            <h2>
              {i + 1}. {heading}
            </h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <section className="legal-contact" aria-labelledby="kontak">
        <h2 id="kontak">Kontak pengelola</h2>
        <p>
          {config.identity.name}
          {legalProfile.legalEntity ? ` — ${legalProfile.legalEntity}` : ""}
        </p>
        {legalProfile.postalAddress && <p>{legalProfile.postalAddress}</p>}
        {legalProfile.contactEmail ? (
          <p>
            <a href={`mailto:${legalProfile.contactEmail}`}>
              {legalProfile.contactEmail}
            </a>
          </p>
        ) : (
          <p>
            Rincian kontak resmi belum dicantumkan dalam draf ini dan perlu
            dilengkapi pengelola sebelum pengesahan. Jangan mengirim password,
            OTP, atau token sesi.
          </p>
        )}
        {legalProfile.customerServiceUrl && (
          <a href={legalProfile.customerServiceUrl}>Layanan pelanggan</a>
        )}
      </section>
      <footer className="legal-footer">
        <Link href="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
        <Link href="/kebijakan-privasi">Kebijakan Privasi</Link>
        <Link href="/">Kembali ke website</Link>
      </footer>
    </article>
  );
}
