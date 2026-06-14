"use client";

import { type NowPlan } from "@/lib/api";
import {
  formatNeedLabel,
  formatPrice,
  getCartTotal,
  getWhileYouWaitSteps,
} from "@/lib/ui";

export function MiniPlanDetails({ plan }: { plan: NowPlan }) {
  const selectedCart = plan.cartModes[plan.recommendedMode];
  const eta = selectedCart?.etaMinutes || plan.checkoutSummary?.etaMinutes || 0;
  const total = selectedCart?.items ? getCartTotal(selectedCart.items) : 0;
  const deadlineSafety = plan.deadlineSafety;
  const needDimensions = plan.needGraph?.dimensions || [];
  const reminder = plan.regretPrevention?.[0];
  const waitSteps = getWhileYouWaitSteps(plan);
  const substitution = plan.substitutions?.[0];

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
            Summary
          </p>
          <h3 className="text-base font-black text-slate-950">
            {formatNeedLabel(plan.needCategory)}
          </h3>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-1">
          <p className="text-[10px] font-black uppercase text-slate-500">
            Arrives in
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">{eta} min</p>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-1">
          <p className="text-[10px] font-black uppercase text-slate-500">
            Total
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">
            {formatPrice(total)}
          </p>
        </div>
      </div>

      {deadlineSafety?.message ? (
        <p className="mt-1 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-bold leading-5 text-emerald-800">
          {deadlineSafety.message}
        </p>
      ) : null}

      {waitSteps.length ? (
        <div className="mt-1 rounded-xl border border-red-100 bg-red-50 px-3 py-1">
          <p className="text-[10px] font-black uppercase text-red-700">
            While you wait
          </p>
          <ul className="mt-1">
            {waitSteps.map((step) => (
              <li
                key={step}
                className="flex gap-1 text-xs leading-5 text-red-900"
              >
                <span className="text-red-400">•</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {substitution ? (
        <div className="mt-1 rounded-xl border border-sky-100 bg-sky-50 px-3 py-1">
          <p className="text-[10px] font-black uppercase text-sky-700">
            Faster option
          </p>
          <p className="mt-1 text-sm font-black text-slate-950">
            {substitution.suggestedName}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {substitution.reason}
          </p>
        </div>
      ) : null}

      {needDimensions.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {needDimensions.slice(0, 4).map((dimension) => (
            <span
              key={dimension.name}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600"
            >
              {dimension.covered ? "✓ " : ""}
              {formatNeedLabel(dimension.name)}
            </span>
          ))}
        </div>
      ) : null}

      {/* {reminder ? (
        <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1">
          <p className="text-[10px] font-black uppercase text-amber-700">
            Also useful
          </p>
          <p className="text-sm font-black text-slate-950">{reminder.name}</p>
          <p className="text-xs leading-5 text-slate-600">{reminder.reason}</p>
        </div>
      ) : null} */}
    </div>
  );
}
