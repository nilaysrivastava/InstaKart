"use client";

import { useEffect, useState } from "react";
import { type DecisionMode, type NowOrder } from "@/lib/api";
import { formatPrice, getCartTotal } from "@/lib/ui";

function OrderProgress({ order }: { order: NowOrder }) {
  const stages = [
    { label: "Placed", icon: "📋" },
    { label: "Confirmed", icon: "✅" },
    { label: "Picking", icon: "🧺" },
    { label: "On the way", icon: "🛵" },
    { label: "Delivered", icon: "🏠" },
  ];

  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const created = order.createdAt
      ? new Date(order.createdAt).getTime()
      : Date.now();
    const elapsed = Math.max(0, Date.now() - created);
    const initialStage =
      elapsed > 90000
        ? 4
        : elapsed > 45000
          ? 3
          : elapsed > 20000
            ? 2
            : elapsed > 8000
              ? 1
              : 0;
    setStageIndex(initialStage);

    const timers = [8000, 20000, 45000, 90000].map((delay, index) =>
      window.setTimeout(
        () => setStageIndex(index + 1),
        Math.max(0, delay - elapsed)
      )
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [order.id, order.createdAt]);

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-1">
        {stages.map((stage, index) => {
          const active = index <= stageIndex;
          const current = index === stageIndex;

          return (
            <div
              key={stage.label}
              className="flex flex-1 flex-col items-center text-center"
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  active
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-white text-slate-400"
                } ${current ? "ring-2 ring-emerald-300" : ""}`}
              >
                {stage.icon}
              </div>
              <p className="mt-1 text-[10px] font-bold text-slate-600">
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrdersDrawer({
  open,
  onClose,
  orders,
}: {
  open: boolean;
  onClose: () => void;
  orders: NowOrder[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close orders backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">My Orders</h2>
            <p className="text-xs text-slate-500">{orders.length} orders</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {orders.length ? (
            orders.map((order) => {
              const selectedMode = (order.selectedMode ||
                order.plan?.recommendedMode ||
                "fastest") as DecisionMode;
              const selectedCart = order.plan?.cartModes?.[selectedMode];
              const items = selectedCart?.items || [];
              const total =
                order.plan?.checkoutSummary?.estimatedTotal ||
                getCartTotal(items);
              const eta =
                order.plan?.checkoutSummary?.etaMinutes ||
                selectedCart?.etaMinutes ||
                0;

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {order.plan?.userRequest || "Amazon Now order"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleString()
                          : "Just now"}
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                      {order.status || "Placed"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[10px] font-black uppercase text-slate-500">
                        Items
                      </p>
                      <p className="text-sm font-black text-slate-950">
                        {order.plan?.checkoutSummary?.itemCount || items.length}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[10px] font-black uppercase text-slate-500">
                        ETA
                      </p>
                      <p className="text-sm font-black text-slate-950">
                        {eta}m
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[10px] font-black uppercase text-slate-500">
                        Total
                      </p>
                      <p className="text-sm font-black text-slate-950">
                        {formatPrice(total)}
                      </p>
                    </div>
                  </div>

                  <OrderProgress order={order} />

                  {items.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {items.slice(0, 5).map((item) => (
                        <span
                          key={item.productId}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600"
                        >
                          {item.name}
                        </span>
                      ))}
                      {items.length > 5 ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                          +{items.length - 5} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              No orders yet.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
