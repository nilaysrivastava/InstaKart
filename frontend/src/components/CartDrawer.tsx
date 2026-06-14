"use client";

import { type NowCartItem } from "@/lib/api";
import {
  formatPrice,
  getCartCount,
  getCartEta,
  getCartTotal,
  productEmoji,
} from "@/lib/ui";

export function CartDrawer({
  open,
  onClose,
  items,
  onRemove,
  onCheckout,
  onShare,
  isCheckingOut,
  checkoutMessage,
}: {
  open: boolean;
  onClose: () => void;
  items: NowCartItem[];
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  onShare: () => void;
  isCheckingOut: boolean;
  checkoutMessage: string;
}) {
  const total = getCartTotal(items);
  const count = getCartCount(items);
  const eta = getCartEta(items);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close cart backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Cart</h2>
            <p className="text-xs text-slate-500">
              {count} items · {eta ? `${eta} min` : "--"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {items.length ? (
            items.map((item) => (
              <div
                key={item.productId}
                className="flex gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-50 text-3xl">
                  {productEmoji(item.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Qty {item.quantity} · {item.etaMinutes}m
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>

                <button
                  onClick={() => onRemove(item.productId)}
                  className="h-fit rounded-full bg-red-100 px-2 py-1 text-xs font-black text-red-900 hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Your cart is empty.
            </div>
          )}

          {checkoutMessage ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
              {checkoutMessage}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-600">Subtotal</p>
            <p className="text-2xl font-black text-slate-950">
              {formatPrice(total)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onShare}
              disabled={!items.length}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Share cart
            </button>
            <button
              onClick={onCheckout}
              disabled={!items.length || isCheckingOut}
              className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCheckingOut ? "Placing..." : "Checkout"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
