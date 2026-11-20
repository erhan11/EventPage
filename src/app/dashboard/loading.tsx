export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-[1400px] animate-pulse px-5 pt-10 pb-24 sm:px-8 sm:pt-16" aria-busy="true" aria-label="Loading">
      <div className="h-3.5 w-44 rounded-full bg-surface" />
      <div className="mt-5 h-20 w-[min(560px,80%)] rounded-2xl bg-surface" />
      <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aspect-[4/5] rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="mt-16 h-40 rounded-3xl bg-surface" />
    </main>
  );
}
