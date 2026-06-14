const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://np1mz79jr2.execute-api.ap-south-1.amazonaws.com";

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

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
  userId: string;
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
}) {
  return requestJson<{
    success: boolean;
    plan: NowPlan;
  }>("/now/plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateNowPlanFromImage(input: {
  userId: string;
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
  userId: string;
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

export async function getNowOrders(userId: string) {
  return requestJson<{
    success: boolean;
    count: number;
    orders: NowOrder[];
  }>(`/now/orders?userId=${encodeURIComponent(userId)}`);
}

export async function sendNowFeedback(input: {
  userId: string;
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
