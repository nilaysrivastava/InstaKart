"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BudgetMode,
  checkoutNowOrder,
  DecisionMode,
  generateNowPlan,
  getHealth,
  getNowOrders,
  getNowProducts,
  NowCartItem,
  NowOrder,
  NowPlan,
  NowProduct,
  sendNowFeedback,
} from "@/lib/api";

const DEMO_USER_ID = "demo-user-001";

type StoreProduct = NowProduct;

const quickPrompts = [
  "Finger cut while cooking",
  "4 friends are coming in 30 minutes",
  "I have an interview in 1 hour",
  "I need breakfast for two tomorrow morning",
  "My dog made a mess in the living room",
  "There may be a power cut tonight",
];

const navItems = [
  "All",
  "Fresh",
  "Grocery",
  "Snacks",
  "Breakfast",
  "Health",
  "Baby",
  "Cleaning",
  "Electronics",
  "Deals",
];

const budgetOptions: { value: BudgetMode; label: string }[] = [
  { value: "save", label: "Save" },
  { value: "balanced", label: "Balanced" },
  { value: "premium", label: "Premium" },
];

const modeOptions: {
  value: DecisionMode;
  label: string;
  helper: string;
}[] = [
  { value: "fastest", label: "Fastest", helper: "lowest ETA" },
  { value: "bestValue", label: "Best Value", helper: "lower price" },
  { value: "mostComplete", label: "Complete", helper: "more covered" },
];

function formatPrice(value: number) {
  return `₹${Math.round(Number(value || 0))}`;
}

function formatNeedLabel(value?: string) {
  return String(value || "urgent need")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function productEmoji(name: string) {
  const lower = name.toLowerCase();

  if (lower.includes("bandage") || lower.includes("first aid")) return "🩹";
  if (lower.includes("sanitizer")) return "🧴";
  if (lower.includes("thermometer")) return "🌡️";
  if (lower.includes("cola") || lower.includes("juice")) return "🥤";
  if (lower.includes("chips") || lower.includes("popcorn")) return "🍿";
  if (lower.includes("muffin") || lower.includes("cake")) return "🧁";
  if (lower.includes("cup")) return "🥛";
  if (lower.includes("plate")) return "🍽️";
  if (lower.includes("tissue")) return "🧻";
  if (lower.includes("milk")) return "🥛";
  if (lower.includes("bread")) return "🍞";
  if (lower.includes("banana")) return "🍌";
  if (lower.includes("egg")) return "🥚";
  if (lower.includes("cereal")) return "🥣";
  if (lower.includes("tea") || lower.includes("coffee")) return "☕";
  if (lower.includes("charger") || lower.includes("power")) return "🔌";
  if (lower.includes("torch") || lower.includes("candle")) return "🔦";
  if (lower.includes("notebook") || lower.includes("pen")) return "📝";
  if (lower.includes("deodorant") || lower.includes("comb")) return "🪮";
  if (
    lower.includes("cleaner") ||
    lower.includes("wipes") ||
    lower.includes("mop")
  ) {
    return "🧽";
  }
  if (lower.includes("diaper") || lower.includes("baby")) return "🍼";
  if (lower.includes("umbrella")) return "☂️";

  return "📦";
}

function productToCartItem(product: StoreProduct): NowCartItem {
  return {
    productId: product.id,
    name: product.name,
    quantity: 1,
    price: product.price,
    etaMinutes: product.etaMinutes,
    reason: "Added from Amazon Now.",
  };
}

function uniqueCartItems(items: NowCartItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.productId)) return false;
    seen.add(item.productId);
    return true;
  });
}

function buildDeckFromPlan(plan: NowPlan, mode: DecisionMode) {
  const primary = plan.cartModes[mode]?.items || [];
  const fastest = plan.cartModes.fastest?.items || [];
  const bestValue = plan.cartModes.bestValue?.items || [];
  const mostComplete = plan.cartModes.mostComplete?.items || [];

  const regretItems: NowCartItem[] = (plan.regretPrevention || []).map(
    (item) => ({
      productId: item.productId,
      name: item.name,
      quantity: 1,
      price: item.price,
      etaMinutes: item.etaMinutes,
      reason: item.reason,
    })
  );

  return uniqueCartItems([
    ...primary,
    ...mostComplete,
    ...fastest,
    ...bestValue,
    ...regretItems,
  ]).slice(0, 7);
}

function getCartTotal(items: NowCartItem[]) {
  return items.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
}

function getCartCount(items: NowCartItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
}

function getCartEta(items: NowCartItem[]) {
  if (!items.length) return 0;
  return Math.max(...items.map((item) => Number(item.etaMinutes || 0)));
}

function categoryMatches(product: StoreProduct, category: string) {
  if (category === "All") return true;

  const text = [
    product.name,
    product.category,
    product.aisle,
    product.searchText,
    ...(product.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  if (category === "Fresh") {
    return /(fresh|fruit|vegetable|dairy|milk|paneer|yogurt|egg|banana|lemon)/.test(
      text
    );
  }

  if (category === "Grocery") {
    return /(grocery|rice|dal|oil|atta|flour|salt|sugar|pasta|sauce|paneer|butter|jam)/.test(
      text
    );
  }

  if (category === "Snacks") {
    return /(snack|chips|popcorn|nachos|biscuit|muffin|cake|candy|cola|juice|drink|beverage)/.test(
      text
    );
  }

  if (category === "Breakfast") {
    return /(breakfast|milk|bread|egg|cereal|oats|banana|tea|coffee|jam|butter)/.test(
      text
    );
  }

  if (category === "Health") {
    return /(health|wellness|bandage|first aid|sanitizer|thermometer|ors|tissue|cold|cough|medical|wound|pain)/.test(
      text
    );
  }

  if (category === "Baby") {
    return /(baby|diaper|lotion|bottle|wipes)/.test(text);
  }

  if (category === "Cleaning") {
    return /(clean|mop|wipes|cloth|disinfect|garbage|odor|odour|glove|freshener|detergent)/.test(
      text
    );
  }

  if (category === "Electronics") {
    return /(electronic|charger|cable|battery|power bank|torch|extension|earphone)/.test(
      text
    );
  }

  if (category === "Deals") {
    return Number(product.price || 0) <= 100;
  }

  return true;
}

function SmallProductCard({
  product,
  onAdd,
}: {
  product: StoreProduct;
  onAdd: (item: NowCartItem) => void;
}) {
  return (
    <div className="min-w-[148px] rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex h-20 items-center justify-center rounded-lg bg-slate-50 text-4xl">
        {productEmoji(product.name)}
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
        className="mt-2 w-full rounded-full bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300"
      >
        Add
      </button>
    </div>
  );
}

function DeckCard({
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
    <div className="mx-auto w-full max-w-sm">
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

        <div className="mt-4 flex items-center justify-between gap-3">
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

        <div className="mt-5 grid grid-cols-2 gap-3">
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

function MiniPlanDetails({ plan }: { plan: NowPlan }) {
  const selectedCart = plan.cartModes[plan.recommendedMode];
  const eta = selectedCart?.etaMinutes || plan.checkoutSummary?.etaMinutes || 0;
  const total = selectedCart?.items ? getCartTotal(selectedCart.items) : 0;
  const coverage = plan.coverage;
  const deadlineSafety = plan.deadlineSafety;
  const needDimensions = plan.needGraph?.dimensions || [];
  const reminder = plan.regretPrevention?.[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            Summary
          </p>
          <h3 className="mt-1 text-base font-black text-slate-950">
            {formatNeedLabel(plan.needCategory)}
          </h3>
        </div>

        {coverage ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            {coverage.score}% covered
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase text-slate-500">
            Arrives in
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">{eta} min</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase text-slate-500">
            Total
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">
            {formatPrice(total)}
          </p>
        </div>
      </div>

      {deadlineSafety?.message ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
          {deadlineSafety.message}
        </p>
      ) : null}

      {needDimensions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {needDimensions.slice(0, 4).map((dimension) => (
            <span
              key={dimension.name}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600"
            >
              {dimension.covered ? "✓ " : ""}
              {formatNeedLabel(dimension.name)}
            </span>
          ))}
        </div>
      ) : null}

      {reminder ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase text-amber-700">
            Also useful
          </p>
          <p className="mt-1 text-sm font-black text-slate-950">
            {reminder.name}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {reminder.reason}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CartDrawer({
  open,
  onClose,
  items,
  onRemove,
  onCheckout,
  isCheckingOut,
  checkoutMessage,
}: {
  open: boolean;
  onClose: () => void;
  items: NowCartItem[];
  onRemove: (productId: string) => void;
  onCheckout: () => void;
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
              {count} items · {eta || "--"} min
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700"
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
                  className="h-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600"
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

          <button
            onClick={onCheckout}
            disabled={!items.length || isCheckingOut}
            className="w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCheckingOut ? "Placing order..." : "Checkout"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function OrdersDrawer({
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
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700"
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

function AssistPanel({
  open,
  onClose,
  userRequest,
  setUserRequest,
  budgetMode,
  setBudgetMode,
  decisionMode,
  setDecisionMode,
  panicMode,
  setPanicMode,
  onGenerate,
  isGenerating,
  plan,
  deckItems,
  onAddDeckItem,
  onSkipDeckItem,
  onOpenCart,
  error,
}: {
  open: boolean;
  onClose: () => void;
  userRequest: string;
  setUserRequest: (value: string) => void;
  budgetMode: BudgetMode;
  setBudgetMode: (value: BudgetMode) => void;
  decisionMode: DecisionMode;
  setDecisionMode: (value: DecisionMode) => void;
  panicMode: boolean;
  setPanicMode: (value: boolean) => void;
  onGenerate: (event?: FormEvent) => void;
  isGenerating: boolean;
  plan: NowPlan | null;
  deckItems: NowCartItem[];
  onAddDeckItem: () => void;
  onSkipDeckItem: () => void;
  onOpenCart: () => void;
  error: string;
}) {
  if (!open) return null;

  const topItem = deckItems[0];
  const totalDeckItems = plan
    ? buildDeckFromPlan(plan, decisionMode).length
    : 0;
  const currentIndex = Math.max(0, totalDeckItems - deckItems.length);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 p-2 md:p-4">
      <div className="mx-auto flex h-[calc(100vh-16px)] max-w-6xl flex-col overflow-hidden rounded-2xl bg-[#eaeded] shadow-2xl md:h-[calc(100vh-32px)]">
        <div className="flex items-center justify-between bg-[#131921] px-4 py-3 text-white">
          <div>
            <p className="text-base font-black">Instant Cart</p>
            <p className="text-xs text-slate-300">
              Describe the situation. Add what you need.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-600 px-3 py-1.5 text-sm font-black"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <form
            onSubmit={onGenerate}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">
                  Tell us what happened
                </p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">
                  What do you need?
                </h2>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-red-700">
                <input
                  type="checkbox"
                  checked={panicMode}
                  onChange={(event) => setPanicMode(event.target.checked)}
                  className="accent-red-600"
                />
                Urgent
              </label>
            </div>

            <textarea
              value={userRequest}
              onChange={(event) => setUserRequest(event.target.value)}
              rows={4}
              className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:border-amber-400 focus:bg-white"
              placeholder="Example: I cut my finger while chopping vegetables"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-500">
                  Budget
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {budgetOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setBudgetMode(option.value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-black ${
                        budgetMode === option.value
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-500">
                  Prefer
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {modeOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setDecisionMode(option.value)}
                      className={`rounded-lg border px-2 py-2 text-left ${
                        decisionMode === option.value
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-xs font-black text-slate-950">
                        {option.label}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {option.helper}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">
                Try
              </p>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => setUserRequest(prompt)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-amber-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isGenerating}
              className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-70"
            >
              {isGenerating ? "Creating cart..." : "Create instant cart"}
            </button>
          </form>

          <section className="grid min-h-0 gap-4 rounded-2xl bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-h-[430px] flex-col justify-center">
              {!plan ? (
                <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
                    🛒
                  </div>
                  <h3 className="mt-4 text-xl font-black text-slate-950">
                    Your instant cart appears here
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Describe the situation on the left and review each item one
                    by one.
                  </p>
                </div>
              ) : topItem ? (
                <div>
                  <div className="mx-auto mb-4 flex max-w-sm items-center justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                        Instant Cart
                      </p>
                      <h3 className="text-lg font-black text-slate-950">
                        {plan.cartModes[decisionMode]?.cartTitle ||
                          "Recommended items"}
                      </h3>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                      {deckItems.length} left
                    </span>
                  </div>

                  <DeckCard
                    item={topItem}
                    index={currentIndex}
                    total={totalDeckItems}
                    onAdd={onAddDeckItem}
                    onSkip={onSkipDeckItem}
                    disabled={isGenerating}
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-md rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
                  <div className="text-4xl">✅</div>
                  <h3 className="mt-3 text-xl font-black text-emerald-900">
                    All items reviewed
                  </h3>
                  <p className="mt-2 text-sm text-emerald-800">
                    Your selected items are waiting in the cart.
                  </p>
                  <button
                    onClick={onOpenCart}
                    className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800"
                  >
                    Open cart
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0">
              {plan ? (
                <MiniPlanDetails plan={plan} />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    How it works
                  </p>
                  <div className="mt-3 space-y-3">
                    {[
                      "Describe the situation",
                      "Review suggested items",
                      "Add useful items to cart",
                    ].map((text, index) => (
                      <div key={text} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-950">
                          {index + 1}
                        </span>
                        <p className="text-sm font-bold text-slate-700">
                          {text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [healthStatus, setHealthStatus] = useState("Checking");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<NowOrder[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const [assistOpen, setAssistOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const [userRequest, setUserRequest] = useState("Finger cut while cooking");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("balanced");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("fastest");
  const [panicMode, setPanicMode] = useState(true);

  const [plan, setPlan] = useState<NowPlan | null>(null);
  const [deckItems, setDeckItems] = useState<NowCartItem[]>([]);
  const [cartItems, setCartItems] = useState<NowCartItem[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const searchable = `${product.name} ${product.category || ""} ${
        product.aisle || ""
      } ${(product.tags || []).join(" ")}`.toLowerCase();

      const matchesSearch = query ? searchable.includes(query) : true;
      const matchesCategory = categoryMatches(product, activeCategory);

      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const productsByAisle = useMemo(() => {
    const grouped = new Map<string, StoreProduct[]>();

    filteredProducts.forEach((product) => {
      const key = product.aisle || product.category || "Amazon Now";
      const existing = grouped.get(key) || [];
      grouped.set(key, [...existing, product]);
    });

    return Array.from(grouped.entries());
  }, [filteredProducts]);

  const cartTotal = getCartTotal(cartItems);
  const cartCount = getCartCount(cartItems);
  const cartEta = getCartEta(cartItems);

  async function loadInitialData() {
    try {
      const [health, productResponse, orderResponse] = await Promise.all([
        getHealth(),
        getNowProducts(),
        getNowOrders(DEMO_USER_ID).catch(() => ({
          success: true,
          count: 0,
          orders: [],
        })),
      ]);

      setHealthStatus(health?.success ? "Live" : "Offline");

      const productList = productResponse.products || [];

      productList.sort((a, b) => {
        return (a.etaMinutes || 99) - (b.etaMinutes || 99);
      });

      setProducts(productList);
      setOrders(orderResponse.orders || []);
    } catch (err) {
      console.error(err);
      setHealthStatus("Offline");
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  function addToCart(item: NowCartItem) {
    setCartItems((current) => {
      const existing = current.find(
        (cartItem) => cartItem.productId === item.productId
      );

      if (existing) {
        return current.map((cartItem) =>
          cartItem.productId === item.productId
            ? {
                ...cartItem,
                quantity:
                  Number(cartItem.quantity || 1) + Number(item.quantity || 1),
              }
            : cartItem
        );
      }

      return [...current, item];
    });
  }

  function removeFromCart(productId: string) {
    setCartItems((current) =>
      current.filter((item) => item.productId !== productId)
    );
  }

  function openInstantCartWithPrompt(prompt?: string) {
    if (prompt) {
      setUserRequest(prompt);
    }

    setAssistOpen(true);
  }

  async function handleGenerate(event?: FormEvent) {
    event?.preventDefault();

    const trimmed = userRequest.trim();

    if (!trimmed) {
      setError("Describe what you need.");
      return;
    }

    setError("");
    setCheckoutMessage("");
    setIsGenerating(true);

    try {
      const response = await generateNowPlan({
        userId: DEMO_USER_ID,
        userRequest: trimmed,
        budgetMode,
        decisionMode,
        panicMode,
      });

      setPlan(response.plan);
      setDeckItems(buildDeckFromPlan(response.plan, decisionMode));

      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: response.plan.planId,
        action: "generated_recommendation_deck",
        selectedMode: decisionMode,
        note: trimmed,
      }).catch(() => null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create cart.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAddDeckItem() {
    const item = deckItems[0];
    if (!item) return;

    addToCart(item);
    setDeckItems((current) => current.slice(1));

    if (plan) {
      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: plan.planId,
        action: "added_to_cart",
        productId: item.productId,
        productName: item.name,
        selectedMode: decisionMode,
        note: "Added from instant cart.",
      }).catch(() => null);
    }
  }

  async function handleSkipDeckItem() {
    const item = deckItems[0];
    if (!item) return;

    setDeckItems((current) => current.slice(1));

    if (plan) {
      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: plan.planId,
        action: "skipped_recommendation",
        productId: item.productId,
        productName: item.name,
        selectedMode: decisionMode,
        note: "Skipped from instant cart.",
      }).catch(() => null);
    }
  }

  function buildCheckoutPlan(): NowPlan {
    const now = new Date().toISOString();

    if (plan) {
      return {
        ...plan,
        checkoutSummary: {
          ...plan.checkoutSummary,
          estimatedTotal: cartTotal,
          itemCount: cartCount,
          etaMinutes: cartEta,
        },
        cartModes: {
          ...plan.cartModes,
          [decisionMode]: {
            ...plan.cartModes[decisionMode],
            items: cartItems,
            etaMinutes: cartEta,
            cartTitle: "Selected cart",
          },
        },
      };
    }

    return {
      planId: `manual_${Date.now()}`,
      userRequest: "Manual Amazon Now cart",
      needCategory: "manual_cart",
      urgencyLabel: "Medium",
      urgencyScore: 50,
      urgencyReason: "Customer selected products manually.",
      peopleCount: 1,
      timeContext: {
        timeOfDay: "current",
        reason: "Manual storefront order.",
      },
      budgetMode,
      panicMode: false,
      recommendedMode: decisionMode,
      cartModes: {
        fastest: {
          modeLabel: "Fastest",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
        bestValue: {
          modeLabel: "Best Value",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
        mostComplete: {
          modeLabel: "Most Complete",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
      },
      regretPrevention: [],
      substitutions: [],
      confidence: {
        overall: 80,
        needMatch: 80,
        availabilityFit: 85,
        budgetFit: 80,
        completeness: 75,
        reason: "Manual cart created from storefront selections.",
      },
      aiExplanation:
        "This order was created from manual Amazon Now selections.",
      checkoutSummary: {
        estimatedTotal: cartTotal,
        itemCount: cartCount,
        etaMinutes: cartEta,
        oneTapMessage: "Checkout your selected Amazon Now cart.",
      },
      metrics: {
        estimatedTimeToCartSeconds: 0,
        decisionsReducedFrom: cartCount,
        decisionsReducedTo: cartCount,
        forgottenEssentialsPrevented: 0,
      },
      userId: DEMO_USER_ID,
      generatedAt: now,
      modelId: "manual",
    };
  }

  async function handleCheckout() {
    if (!cartItems.length) return;

    setIsCheckingOut(true);
    setCheckoutMessage("");
    setError("");

    try {
      const checkoutPlan = buildCheckoutPlan();

      const response = await checkoutNowOrder({
        userId: DEMO_USER_ID,
        plan: checkoutPlan,
        selectedMode: decisionMode,
      });

      setCheckoutMessage(response.message || "Order placed successfully.");

      const orderResponse = await getNowOrders(DEMO_USER_ID);
      setOrders(orderResponse.orders || []);

      setCartItems([]);
      setCartOpen(false);
      setOrdersOpen(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eaeded] text-slate-950">
      <header className="sticky top-0 z-40 bg-[#131921] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
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

          <div className="flex flex-1 overflow-hidden rounded-md bg-white">
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

          <button
            onClick={() => setOrdersOpen(true)}
            className="hidden min-w-fit rounded-md border border-slate-600 px-3 py-2 text-xs font-black md:block"
          >
            Orders {orders.length}
          </button>

          <button
            onClick={() => setCartOpen(true)}
            className="min-w-fit rounded-md border border-slate-600 px-3 py-2 text-sm font-black"
          >
            🛒 {cartCount}
          </button>
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

      <section className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-black text-[#00a8a8]">amazon now</span>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setOrdersOpen(true)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 md:hidden"
            >
              Orders
            </button>
            <p className="text-xs font-medium text-slate-600">
              Backend:{" "}
              <span className="font-black text-emerald-700">
                {healthStatus}
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-5">
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Instant Cart
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Need something now?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
            Describe what happened. Review the suggested items. Add what you
            need.
          </p>

          <button
            onClick={() => openInstantCartWithPrompt()}
            className="mx-auto mt-6 flex w-full max-w-sm items-center justify-center rounded-xl bg-amber-400 px-6 py-4 text-base font-black text-slate-950 shadow-sm hover:bg-amber-300"
          >
            Create instant cart
          </button>

          <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
            {[
              "Finger cut while cooking",
              "Guests in 30 minutes",
              "Interview in 1 hour",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => openInstantCartWithPrompt(prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 space-y-5">
          {productsByAisle.length ? (
            productsByAisle.map(([aisle, aisleProducts]) => (
              <div key={aisle} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">
                      {aisle}
                    </h2>
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
                    <SmallProductCard
                      key={product.id}
                      product={product}
                      onAdd={addToCart}
                    />
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
      </div>

      {cartItems.length ? (
        <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-8px_25px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                {cartCount} items · {formatPrice(cartTotal)}
              </p>
              <p className="text-xs text-slate-500">
                Estimated delivery {cartEta} min
              </p>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300"
            >
              View cart
            </button>
          </div>
        </div>
      ) : null}

      <AssistPanel
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        userRequest={userRequest}
        setUserRequest={setUserRequest}
        budgetMode={budgetMode}
        setBudgetMode={setBudgetMode}
        decisionMode={decisionMode}
        setDecisionMode={setDecisionMode}
        panicMode={panicMode}
        setPanicMode={setPanicMode}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        plan={plan}
        deckItems={deckItems}
        onAddDeckItem={handleAddDeckItem}
        onSkipDeckItem={handleSkipDeckItem}
        onOpenCart={() => {
          setAssistOpen(false);
          setCartOpen(true);
        }}
        error={error}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
        isCheckingOut={isCheckingOut}
        checkoutMessage={checkoutMessage}
      />

      <OrdersDrawer
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        orders={orders}
      />
    </main>
  );
}
