"use client";

import { type ReactNode } from "react";

export function CartStage({
  stageKey,
  children,
}: {
  stageKey: string;
  children: ReactNode;
}) {
  return (
    <div
      key={stageKey}
      className="w-full min-w-0 motion-safe:animate-[cartStageIn_420ms_cubic-bezier(0.22,1,0.36,1)_both]"
    >
      {children}

      <style jsx global>{`
        @keyframes cartStageIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
}
