import {
  type BudgetMode,
  type DecisionMode,
  type NowCartItem,
  type NowPlan,
  type NowProduct,
} from "@/lib/api";

export type StoreProduct = NowProduct;

export type PreventableEvent = {
  preventDefault: () => void;
};

export const DEMO_USER_ID = "demo-user-001";

export const quickPrompts = [
  "Finger cut while cooking",
  "4 friends are coming in 30 minutes",
  "Interview in 1 hour",
  "Breakfast for 2, tomorrow morning",
  "Dog made a mess",
  "There may be a power cut tonight",
];

export const navItems = [
  "All",
  "Fresh",
  "Grocery",
  "Snacks",
  "Breakfast",
  "Health",
  "Baby",
  "Cleaning",
  "Electronics",
];

export const budgetOptions: { value: BudgetMode; label: string }[] = [
  { value: "save", label: "Save" },
  { value: "balanced", label: "Balanced" },
  { value: "premium", label: "Premium" },
];

export const modeOptions: {
  value: DecisionMode;
  label: string;
  helper: string;
}[] = [
  { value: "fastest", label: "Fastest", helper: "lowest ETA" },
  { value: "bestValue", label: "Best Value", helper: "lower price" },
  { value: "mostComplete", label: "Complete", helper: "more covered" },
];

export function formatPrice(value: number) {
  return `₹${Math.round(Number(value || 0))}`;
}

export function formatNeedLabel(value?: string) {
  return String(value || "urgent need")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function productEmoji(name: string) {
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

export function productToCartItem(product: StoreProduct): NowCartItem {
  return {
    productId: product.id,
    name: product.name,
    quantity: 1,
    price: product.price,
    etaMinutes: product.etaMinutes,
    reason: "Added from Amazon Now.",
  };
}

export function uniqueCartItems(items: NowCartItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.productId)) return false;
    seen.add(item.productId);
    return true;
  });
}

export function buildDeckFromPlan(plan: NowPlan, mode: DecisionMode) {
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

export function getCartTotal(items: NowCartItem[]) {
  return items.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
}

export function getCartCount(items: NowCartItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
}

export function getCartEta(items: NowCartItem[]) {
  if (!items.length) return 0;
  return Math.max(...items.map((item) => Number(item.etaMinutes || 0)));
}

export function categoryMatches(product: StoreProduct, category: string) {
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

export function getWhileYouWaitSteps(plan: NowPlan) {
  const category = String(plan.needCategory || "").toLowerCase();
  const request = String(plan.userRequest || "").toLowerCase();
  const text = `${category} ${request}`;

  if (
    text.includes("first") ||
    text.includes("aid") ||
    text.includes("cut") ||
    text.includes("wound") ||
    text.includes("injury") ||
    text.includes("bleeding") ||
    text.includes("health_emergency")
  ) {
    return [
      "Rinse gently with clean water if possible.",
      "Apply light pressure with a clean cloth or tissue.",
      "Use a bandage after bleeding slows.",
      "Seek medical help if the cut is deep or bleeding does not slow.",
    ];
  }

  if (
    text.includes("cold") ||
    text.includes("fever") ||
    text.includes("throat")
  ) {
    return [
      "Sip water regularly.",
      "Rest in a comfortable position.",
      "Monitor symptoms and seek care if they worsen.",
    ];
  }

  return [];
}
