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
  authenticated,
  authLoading,
  onLogin,
  onSignUp,
  onOpenProfile,
  onLogout,
}: {
  search: string;
  setSearch: (value: string) => void;
  activeCategory: string;
  setActiveCategory: (value: string) => void;
  ordersLength: number;
  cartCount: number;
  onOpenOrders: () => void;
  onOpenCart: () => void;
  authenticated: boolean;
  authLoading: boolean;
  onLogin: () => void;
  onSignUp: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
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
            IK
          </div>
          <div>
            <p className="text-sm font-black leading-none">InstaKart</p>
            <p className="text-[10px] text-slate-300">10-min essentials</p>
          </div>
        </button>

        <div className="order-3 flex w-full overflow-hidden rounded-md bg-white sm:order-none sm:w-auto sm:flex-1">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search InstaKart"
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
          {!authLoading && !authenticated ? (
            <>
              <button
                onClick={onLogin}
                className="rounded-md border border-slate-600 px-3 py-2 text-xs font-black transition hover:border-amber-400 hover:text-amber-300 sm:text-sm"
              >
                Login
              </button>
              <button
                onClick={onSignUp}
                className="rounded-md bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 sm:text-sm"
              >
                Sign up
              </button>
            </>
          ) : null}

          {!authLoading && authenticated ? (
            <>
              <button
                onClick={onOpenOrders}
                aria-label="Open orders"
                title="My Orders"
                className="relative flex h-10 items-center justify-center rounded-l-lg rounded-r-lg border border-slate-600 px-2 text-sm font-black transition hover:border-amber-400 hover:text-amber-300"
              >
                <span aria-hidden>📦</span>
                <span className="ml-1 hidden lg:inline">My Orders</span>
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
                className="relative flex h-10 min-w-[2.5rem] items-center justify-center rounded-l-lg rounded-r-lg border border-slate-600 px-2 text-sm font-black transition hover:border-amber-400 hover:text-amber-300"
              >
                🛒
                <span className="ml-1">{cartCount}</span>
              </button>

              <button
                onClick={onOpenProfile}
                title="Profile"
                className="flex h-10 items-center rounded-md border border-slate-600 px-2 text-xs font-black transition hover:border-amber-400 hover:text-amber-300"
              >
                👤 <span className="ml-1 hidden lg:inline">Profile</span>
              </button>

              <button
                onClick={onLogout}
                title="Logout"
                className="rounded-md px-2 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <span className="sm:hidden" aria-hidden>
                  ↪
                </span>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : null}
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
