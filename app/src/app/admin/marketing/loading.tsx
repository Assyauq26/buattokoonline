export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Memuat promosi"
      className="mx-auto max-w-6xl space-y-5"
    >
      <div className="h-7 w-40 rounded bg-zinc-100" />
      <div className="h-11 rounded bg-zinc-100" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded border border-zinc-100 bg-white" />
      ))}
      <span className="sr-only">Memuat promosi…</span>
    </div>
  );
}
