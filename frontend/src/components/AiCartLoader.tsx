"use client";

export function AiCartLoader() {
  return (
    <div className="mx-auto flex min-h-[220px] w-full max-w-md items-center justify-center sm:min-h-[260px]">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-slate-900" />

          <div className="flex-1">
            <h3 className="text-base font-black text-slate-950">
              Building your cart
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              Finding relevant items based on your situation, time, and budget.
            </p>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 animate-[cartLoaderBar_1.35s_ease-in-out_infinite] rounded-full bg-amber-400" />
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes cartLoaderBar {
          0% {
            transform: translateX(-120%);
          }
          50% {
            transform: translateX(60%);
          }
          100% {
            transform: translateX(220%);
          }
        }
      `}</style>
    </div>
  );
}
