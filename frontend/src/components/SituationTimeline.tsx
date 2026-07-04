"use client";

import { type NowPlan } from "@/lib/api";
import { formatNeedLabel } from "@/lib/ui";

export function SituationTimeline({ plan }: { plan: NowPlan }) {
  const steps = [
    { label: "Situation", value: formatNeedLabel(plan.needCategory) },
    { label: "Urgency", value: `${plan.urgencyLabel} · ${plan.urgencyScore}%` },
    {
      label: "People",
      value: `${plan.peopleCount} person${plan.peopleCount > 1 ? "s" : ""}`,
    },
    { label: "Time", value: plan.timeContext?.timeOfDay || "current" },
    { label: "Confidence", value: `${plan.confidence?.overall || 0}%` },
  ].filter((step) => step.value);

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex w-full items-center justify-between gap-1 text-left">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
            What I understood
          </p>
          <p className="break-words text-xs font-bold text-slate-700">
            {formatNeedLabel(plan.needCategory)} ·{" "}
            {plan.confidence?.overall || 0}% confidence
          </p>
        </div>
      </div>

      <div className="mt-1 border-l-2 border-amber-300 pl-3">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className="flex min-w-0 items-start gap-1 opacity-0"
            style={{
              animation: "instantCartFadeIn 260ms ease forwards",
              animationDelay: `${index * 120}ms`,
            }}
          >
            <span className="w-[70px] shrink-0 text-[9px] font-black uppercase text-slate-400">
              {step.label}
            </span>
            <span className="min-w-0 break-words text-xs font-bold text-slate-700">
              {step.value}
            </span>
          </div>
        ))}

        {plan.aiExplanation ? (
          <p className="break-words pt-1 text-xs italic leading-5 text-slate-500">
            {plan.aiExplanation}
          </p>
        ) : null}
      </div>

      <style jsx global>{`
        @keyframes instantCartFadeIn {
          from {
            opacity: 0;
            transform: translateX(-6px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
