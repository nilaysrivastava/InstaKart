"use client";

import { type DecisionMode, type NowPlan } from "@/lib/api";
import { formatPrice, getCartTotal } from "@/lib/ui";

export function CartModeComparison({
  plan,
  selectedMode,
  onSelectMode,
}: {
  plan: NowPlan;
  selectedMode: DecisionMode;
  onSelectMode: (mode: DecisionMode) => void;
}) {
  const modes: DecisionMode[] = ["fastest", "bestValue", "mostComplete"];

  return (
    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
      {modes.map((mode) => {
        const cart = plan.cartModes[mode];
        const selected = selectedMode === mode;
        const total = getCartTotal(cart.items || []);

        return (
          <button
            type="button"
            key={mode}
            onClick={() => onSelectMode(mode)}
            className={`rounded-xl border p-3 text-left transition ${
              selected
                ? "border-amber-400 bg-amber-50 shadow-sm"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-[10px] font-black uppercase text-slate-500">
              {cart.modeLabel}
            </p>
            <p className="mt-1 text-base font-black text-slate-950">
              {formatPrice(total)}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-emerald-700">
              {cart.etaMinutes}m · {cart.items.length} items
            </p>
          </button>
        );
      })}
    </div>
  );
}
