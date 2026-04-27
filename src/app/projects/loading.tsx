export default function ProjectsLoading() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 space-y-3">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-10 w-full max-w-2xl rounded bg-muted" />
        <div className="h-5 w-full max-w-xl rounded bg-muted" />
      </div>
      <div className="mb-6 h-28 rounded-xl border bg-card" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-64 rounded-xl border bg-card" />
        ))}
      </div>
    </main>
  );
}
