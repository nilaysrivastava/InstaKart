"use client";

import { type NowCartItem } from "@/lib/api";
import {
  formatPrice,
  productEmoji,
  productToCartItem,
  type StoreProduct,
} from "@/lib/ui";

export function ProductCard({
  product,
  onAdd,
}: {
  product: StoreProduct;
  onAdd: (item: NowCartItem) => void;
}) {
  const outOfStock =
    product.available === false ||
    product.isAvailable === false ||
    Number(product.quantity ?? 100) <= 0;
  const quantity = Number(product.quantity ?? 100);
  const lowStock = !outOfStock && quantity > 0 && quantity < 5;

  return (
    <div className="min-w-[148px] rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-4xl">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          productEmoji(product.name)
        )}
        {outOfStock ? (
          <span className="absolute left-1 top-1 rounded-full bg-red-600 px-2 py-1 text-[9px] font-black text-white">
            Out of stock
          </span>
        ) : lowStock ? (
          <span className="absolute left-1 top-1 rounded-full bg-amber-400 px-2 py-1 text-[9px] font-black text-slate-950">
            Only {quantity} left
          </span>
        ) : null}
      </div>

      <p className="mt-2 h-10 overflow-hidden text-xs font-bold leading-tight text-slate-950">
        {product.name}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-950">
          {formatPrice(product.price)}
        </p>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
          {product.etaMinutes}m
        </span>
      </div>

      <button
        onClick={() => onAdd(productToCartItem(product))}
        disabled={outOfStock}
        className="mt-2 w-full rounded-full bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {outOfStock ? "Unavailable" : "Add"}
      </button>
    </div>
  );
}
