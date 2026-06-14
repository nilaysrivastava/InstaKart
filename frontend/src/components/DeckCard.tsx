"use client";

import { type NowCartItem } from "@/lib/api";
import { formatPrice, productEmoji } from "@/lib/ui";

export function DeckCard({
  item,
  index,
  total,
  onAdd,
  onSkip,
  disabled,
}: {
  item: NowCartItem;
  index: number;
  total: number;
  onAdd: () => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[330px] sm:max-w-sm">
      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">
              Item {index + 1} of {total}
            </p>
            <h3 className="mt-1 text-xl font-black leading-tight text-slate-950">
              {item.name}
            </h3>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            {item.etaMinutes} min
          </span>
        </div>

        <div className="mt-4 flex h-32 items-center justify-center rounded-2xl bg-slate-50 text-6xl">
          {productEmoji(item.name)}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-3xl font-black text-slate-950">
              {formatPrice(item.price)}
            </p>
            <p className="text-xs text-slate-500">Qty {item.quantity}</p>
          </div>

          <p className="max-w-[170px] text-right text-sm leading-5 text-slate-600">
            {item.reason}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            onClick={onSkip}
            disabled={disabled}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Skip
          </button>
          <button
            onClick={onAdd}
            disabled={disabled}
            className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
