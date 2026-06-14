"use client";

import { type NowCartItem } from "@/lib/api";
import { type StoreProduct } from "@/lib/ui";
import { ProductCard } from "./ProductCard";

export function ProductShelf({
  productsByAisle,
  onAdd,
}: {
  productsByAisle: [string, StoreProduct[]][];
  onAdd: (item: NowCartItem) => void;
}) {
  return (
    <section className="mt-5 space-y-5">
      {productsByAisle.length ? (
        productsByAisle.map(([aisle, aisleProducts]) => (
          <div key={aisle} className="rounded-2xl bg-yellow-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">{aisle}</h2>
                <p className="text-xs text-slate-500">
                  Fast-moving Amazon Now essentials
                </p>
              </div>
              <p className="text-xs font-black text-[#007185]">
                {aisleProducts.length} items
              </p>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {aisleProducts.map((product) => (
                <ProductCard key={product.id} product={product} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No products found.
        </div>
      )}
    </section>
  );
}
