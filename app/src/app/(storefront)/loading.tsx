export default function StorefrontLoading() {
  return (
    <div className="space-y-6" aria-label="Memuat halaman" role="status">
      <div className="h-10 w-2/3 motion-safe:animate-pulse rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-square motion-safe:animate-pulse rounded-2xl bg-surface" />
            <div className="h-4 w-4/5 motion-safe:animate-pulse rounded bg-surface" />
            <div className="h-4 w-1/2 motion-safe:animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
