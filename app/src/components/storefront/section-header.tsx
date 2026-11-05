import Link from "@/components/ui/navigation";
import { ArrowRight } from "lucide-react";

export function SectionHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="font-display text-lg font-extrabold leading-tight text-ink md:text-xl">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs leading-tight text-ink-soft md:text-sm">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-ink-soft hover:text-ink md:text-sm"
        >
          Lihat Semua <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
