"use client";

export function Footer({ healthStatus }: { healthStatus: string }) {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-[#131921] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-base font-black text-slate-950">
              IK
            </div>
            <div>
              <p className="text-sm font-black leading-none">InstaKart</p>
              <p className="text-[10px] text-slate-300">Instant Cart</p>
            </div>
          </div>

          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
            Describe a need, review the suggested essentials, and checkout a
            quick cart.
          </p>
        </div>

        <div className="flex align-items-center">
          <p className="text-1xl font-black tracking-wide text-slate-200">
            Made with 🧡 by Nilay Srivastava
          </p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            System
          </p>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-black text-white">
              Backend: <span className="text-emerald-300">{healthStatus}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Cart suggestions use live inventory, semantic retrieval, and a
              verification step before display.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
