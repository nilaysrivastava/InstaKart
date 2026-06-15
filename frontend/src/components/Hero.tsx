"use client";

export function Hero({
  healthStatus,
  onOpenInstantCart,
}: {
  healthStatus: string;
  onOpenInstantCart: (prompt?: string) => void;
}) {
  return (
    <>
      <section className="bg-white rounded-2xl mb-2">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-black text-[#00a8a8]">amazon now</span>

          <div className="flex items-center gap-3">
            <p className="text-xs font-medium text-slate-600">
              Backend:{" "}
              <span className="font-black text-emerald-700">
                {healthStatus}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-cyan-100 p-6 text-center shadow-sm md:p-10">
        <p className="text-small font-black uppercase tracking-[0.2em] text-slate-500">
          Instant Cart
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
          Need it now? Let AI build your cart.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
          Describe the situation. Review the essentials. Checkout faster.
        </p>

        <button
          onClick={() => onOpenInstantCart()}
          className="mx-auto mt-6 flex w-full max-w-sm items-center justify-center rounded-xl bg-amber-400 px-6 py-4 text-base font-black text-slate-950 shadow-sm hover:bg-amber-300"
        >
          Create instant cart
        </button>

        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
          {[
            "Finger cut while cooking",
            "Guests in 30 minutes",
            "Interview in 1 hour",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => onOpenInstantCart(prompt)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
