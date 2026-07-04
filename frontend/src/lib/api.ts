import { getAccessToken } from "@/lib/auth";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3001"
    : "https://np1mz79jr2.execute-api.ap-south-1.amazonaws.com";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL
)
  .trim()
  .replace(/\/+$/, "");

if (process.env.NODE_ENV === "development") {
  console.info(`[InstaKart] API base URL: ${API_BASE_URL}`);
}

export const AUTH_REQUIRED_EVENT = "instakart:auth-required";

export class AuthenticationRequiredError extends Error {
  constructor(message = "Please sign in to continue.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class ApiNetworkError extends Error {
  constructor() {
    super(
      `Could not connect to the InstaKart API at ${API_BASE_URL}. Make sure the backend is running.`
    );
    this.name = "ApiNetworkError";
  }
}

export type BudgetMode = "save" | "balanced" | "premium";
export type DecisionMode = "fastest" | "bestValue" | "mostComplete";

export type NowProduct = {
  id: string;
  entityType?: string;
  name: string;
  category?: string;
  aisle?: string;
  price: number;
  etaMinutes: number;
  available?: boolean;
  isAvailable?: boolean;
  quantity?: number;
  description?: string;
  imageUrl?: string;
  storeLocation?: string;
  tags?: string[];
  searchText?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NowCartItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  etaMinutes: number;
  reason: string;
};

export type NowCartMode = {
  modeLabel: string;
  etaMinutes: number;
  cartTitle: string;
  items: NowCartItem[];
  modeReason: string;
};

export type NowRegretItem = {
  productId: string;
  name: string;
  price: number;
  etaMinutes: number;
  reason: string;
};

export type NowWhileYouWaitTip =
  | string
  | {
      title?: string;
      text: string;
      tone?: "medical" | "practical" | "fun" | "calm" | string;
    };

export type NowPlan = {
  planId: string;
  userRequest: string;
  needCategory: string;
  urgencyLabel: "Low" | "Medium" | "High" | "Critical" | string;
  urgencyScore: number;
  urgencyReason: string;
  peopleCount: number;
  timeContext: {
    timeOfDay: string;
    reason: string;
  };
  budgetMode: BudgetMode;
  panicMode: boolean;
  recommendedMode: DecisionMode;
  cartModes: {
    fastest: NowCartMode;
    bestValue: NowCartMode;
    mostComplete: NowCartMode;
  };
  regretPrevention: NowRegretItem[];
  substitutions: {
    originalProductId: string;
    originalName: string;
    suggestedProductId: string;
    suggestedName: string;
    minutesSaved: number;
    reason: string;
  }[];
  needGraph?: {
    primaryNeed: string;
    inferredFrom: string;
    dimensions: {
      name: string;
      covered: boolean;
      reason: string;
    }[];
  };
  deadlineSafety?: {
    hasDeadline: boolean;
    deadlineMinutes?: number | null;
    selectedEtaMinutes: number;
    bufferMinutes?: number | null;
    status:
      | "safe"
      | "tight"
      | "risky"
      | "urgent_but_no_exact_deadline"
      | string;
    message: string;
  };
  coverage?: {
    score: number;
    coveredDimensions: number;
    totalDimensions: number;
    summary: string;
  };
  whileYouWait?: NowWhileYouWaitTip[];
  confidence: {
    overall: number;
    needMatch: number;
    availabilityFit: number;
    budgetFit: number;
    completeness: number;
    reason: string;
  };
  aiExplanation: string;
  checkoutSummary: {
    estimatedTotal: number;
    itemCount: number;
    etaMinutes: number;
    oneTapMessage: string;
  };
  metrics: {
    estimatedTimeToCartSeconds: number;
    decisionsReducedFrom: number;
    decisionsReducedTo: number;
    forgottenEssentialsPrevented: number;
  };
  userId?: string;
  generatedAt?: string;
  modelId?: string;
  usedFallback?: boolean;
  source?: "text" | "image" | "manual" | string;
};

export type NowOrder = {
  id: string;
  entityType?: string;
  userId: string;
  selectedMode: DecisionMode;
  plan: NowPlan;
  status: string;
  createdAt: string;
};

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken().catch(() => null);
  const normalizedPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const requestUrl = `${API_BASE_URL}${normalizedPath}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options?.headers || {}),
      },
    });
  } catch {
    throw new ApiNetworkError();
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    }
    throw new AuthenticationRequiredError(
      data?.message || "Your session expired. Please sign in again."
    );
  }

  if (response.status === 403) {
    throw new Error(data?.message || "You do not have permission to do that.");
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || "Request failed.");
  }

  return data as T;
}

export async function getHealth() {
  return requestJson<{
    success: boolean;
    message: string;
    service: string;
    timestamp: string;
  }>("/health");
}

export async function getNowProducts(refresh = false) {
  const query = refresh ? "?refresh=true" : "";

  return requestJson<{
    success: boolean;
    count: number;
    products: NowProduct[];
  }>(`/now/products${query}`);
}

export async function generateNowPlan(input: {
  userRequest: string;
  budgetMode: BudgetMode;
  decisionMode: DecisionMode;
  panicMode: boolean;
  refinementContext?: {
    originalRequest?: string;
    currentNeedCategory?: string;
    currentPeopleCount?: number;
    currentCartItems?: {
      productId: string;
      name: string;
      quantity: number;
      price: number;
      etaMinutes: number;
    }[];
    instruction: string;
  };
}, authenticated = false) {
  return requestJson<{
    success: boolean;
    plan: NowPlan;
  }>(authenticated ? "/now/plan" : "/now/plan/guest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateNowPlanFromImage(input: {
  base64Image: string;
  mediaType: string;
  budgetMode: BudgetMode;
  decisionMode: DecisionMode;
  panicMode: boolean;
}) {
  return requestJson<{
    success: boolean;
    plan: NowPlan;
    inferredRequest?: string;
  }>("/now/plan-image", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function checkoutNowOrder(input: {
  plan: NowPlan;
  selectedMode: DecisionMode;
}) {
  return requestJson<{
    success: boolean;
    message: string;
    order: NowOrder;
  }>("/now/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getNowOrders() {
  return requestJson<{
    success: boolean;
    count: number;
    orders: NowOrder[];
  }>("/now/orders");
}

export async function sendNowFeedback(input: {
  planId?: string;
  action: string;
  productId?: string;
  productName?: string;
  selectedMode?: DecisionMode;
  note?: string;
}) {
  return requestJson<{
    success: boolean;
    message: string;
    feedback: unknown;
  }>("/now/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getNowCart() {
  return requestJson<{
    success: boolean;
    items: NowCartItem[];
    updatedAt: string | null;
  }>("/now/cart");
}

export async function saveNowCart(items: NowCartItem[]) {
  return requestJson<{
    success: boolean;
    items: NowCartItem[];
    updatedAt: string;
  }>("/now/cart", {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export async function clearNowCart() {
  return requestJson<{ success: boolean; items: NowCartItem[] }>("/now/cart", {
    method: "DELETE",
  });
}

export type AdminProductInput = {
  id?: string;
  name: string;
  category: string;
  description: string;
  price: number;
  quantity: number;
  imageUrl: string;
  etaMinutes: number;
  storeLocation: string;
  tags: string[];
  isAvailable: boolean;
};

export async function getAdminInventory() {
  return requestJson<{
    success: boolean;
    count: number;
    products: NowProduct[];
  }>("/admin/inventory");
}

export async function createAdminProduct(input: AdminProductInput) {
  return requestJson<{ success: boolean; product: NowProduct }>(
    "/admin/inventory",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function updateAdminProduct(
  id: string,
  input: Partial<AdminProductInput>
) {
  return requestJson<{ success: boolean; product: NowProduct }>(
    `/admin/inventory/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export async function deleteAdminProduct(id: string) {
  return requestJson<{ success: boolean; id: string }>(
    `/admin/inventory/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export type AdminAnalytics = {
  totalProducts: number;
  availableProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  unavailableProducts: number;
  totalOrders: number;
  estimatedRevenue: number;
  averageOrderValue: number;
  inventoryByCategory: {
    category: string;
    products: number;
    quantity: number;
  }[];
  stockStatusBreakdown: { status: string; value: number }[];
  revenueTrend: { date: string; orders: number; revenue: number }[];
  topProducts: { name: string; quantity: number }[];
  topCategories: { category: string; quantity: number }[];
};

export async function getAdminAnalytics() {
  return requestJson<{ success: boolean; analytics: AdminAnalytics }>(
    "/admin/analytics"
  );
}

export async function generateAdminInsights() {
  return requestJson<{
    success: boolean;
    insights: string[];
    source: "bedrock" | "rules";
    generatedAt: string;
  }>("/admin/analytics/insights", { method: "POST" });
}
