const skeletonCards = Array.from({ length: 6 }, (_, index) => index);

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-56 rounded bg-slate-200" />
          <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
            {["", "", "", ""].map((_, index) => (
              <div key={index} className="h-10 rounded-md bg-slate-200 sm:w-24" />
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="h-7 w-36 rounded bg-slate-200" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {skeletonCards.map((card) => (
            <div key={card} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="h-3 w-28 rounded bg-slate-200" />
              <div className="mt-4 h-8 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-4 w-40 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
