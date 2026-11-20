export default function EventLoading() {
  return (
    <main className="mx-auto max-w-[1400px] animate-pulse px-5 pt-8 pb-24 sm:px-8 sm:pt-12" aria-busy="true" aria-label="Loading event">
      <div className="h-3.5 w-24 rounded-full bg-surface" />
      <div className="mt-6 h-5 w-72 rounded-full bg-surface" />
      <div className="mt-4 h-16 w-[min(480px,70%)] rounded-2xl bg-surface" />
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-40 bg-raised p-6">
            <div className="h-3 w-20 rounded-full bg-surface" />
            <div className="mt-4 h-9 w-28 rounded-xl bg-surface" />
          </div>
        ))}
      </div>
      <div className="mt-10 h-72 rounded-3xl bg-surface" />
    </main>
  );
}
