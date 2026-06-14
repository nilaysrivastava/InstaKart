"use client";

import { navItems } from "@/lib/ui";

export function Header({
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  ordersLength,
  cartCount,
  onOpenOrders,
  onOpenCart,
}: {
  search: string;
  setSearch: (value: string) => void;
  activeCategory: string;
  setActiveCategory: (value: string) => void;
  ordersLength: number;
  cartCount: number;
  onOpenOrders: () => void;
  onOpenCart: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 bg-[#131921] text-white shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:gap-3">
        <button
          onClick={() => {
            setActiveCategory("All");
            setSearch("");
          }}
          className="flex min-w-fit items-center gap-2 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-base font-black text-slate-950">
            a
          </div>
          <div>
            <p className="text-sm font-black leading-none">Amazon Now</p>
            <p className="text-[10px] text-slate-300">10-min essentials</p>
          </div>
        </button>

        <div className="order-3 flex w-full overflow-hidden rounded-md bg-white sm:order-none sm:w-auto sm:flex-1">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Amazon Now"
            className="min-w-0 flex-1 px-3 py-2.5 text-sm text-slate-950 outline-none"
          />
          <button
            onClick={() => setActiveCategory("All")}
            className="bg-amber-400 px-4 text-sm font-black text-slate-950"
          >
            🔍
          </button>
        </div>

        <div className="ml-auto flex min-w-fit items-center gap-2 sm:ml-0">
          <button
            onClick={onOpenOrders}
            aria-label="Open orders"
            title="My Orders"
            className="relative flex h-10 w-10 items-center justify-center rounded-md border border-slate-600 text-lg font-black hover:border-amber-400 hover:text-amber-300"
          >
            📦
            {ordersLength ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950">
                {ordersLength}
              </span>
            ) : null}
          </button>

          <button
            onClick={onOpenCart}
            aria-label="Open cart"
            title="Cart"
            className="relative flex h-10 min-w-[2.5rem] items-center justify-center rounded-md border border-slate-600 px-2 text-sm font-black hover:border-amber-400 hover:text-amber-300 sm:px-3"
          >
            🛒
            <span className="ml-1">{cartCount}</span>
          </button>
        </div>
      </div>

      <nav className="bg-[#232f3e]">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-1.5 text-xs font-bold text-white">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => {
                setActiveCategory(item);
                setSearch("");
              }}
              className={`min-w-fit rounded px-2 py-1 hover:bg-white/10 ${
                activeCategory === item ? "bg-white/15 text-amber-300" : ""
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
