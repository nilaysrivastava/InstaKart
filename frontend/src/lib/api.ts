const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://np1mz79jr2.execute-api.ap-south-1.amazonaws.com";

export type NowProduct = {
  id: string;
  entityType?: "PRODUCT";
  name: string;
  category?: string;
  aisle?: string;
  price: number;
  etaMinutes: number;
  available?: boolean;
  tags?: string[];
  imageHint?: string;
  searchText?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Item = {
  id: string;
  entityType?: string;
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
};

export type HealthResponse = {
  success: boolean;
  message: string;
  service?: string;
  timestamp?: string;
};

export type CreateItemInput = {
  title: string;
  description?: string;
  status?: string;
};

export type BedrockAskResponse = {
  success: boolean;
  question: string;
  answer: string;
  modelId?: string;
  timestamp?: string;
};

export type BudgetMode = "save" | "balanced" | "premium";
export type DecisionMode = "fastest" | "bestValue" | "mostComplete";

export type NowPlanRequest = {
  userRequest: string;
  budgetMode: BudgetMode;
  decisionMode: DecisionMode;
  panicMode: boolean;
  userId?: string;
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

export type NowSubstitution = {
  originalProductId: string;
  originalName: string;
  suggestedProductId: string;
  suggestedName: string;
  minutesSaved: number;
  reason: string;
};

export type NowConfidence = {
  overall: number;
  needMatch: number;
  availabilityFit: number;
  budgetFit: number;
  completeness: number;
  reason: string;
};

export type NowCheckoutSummary = {
  estimatedTotal: number;
  itemCount: number;
  etaMinutes: number;
  oneTapMessage: string;
};

export type NowMetrics = {
  estimatedTimeToCartSeconds: number;
  decisionsReducedFrom: number;
  decisionsReducedTo: number;
  forgottenEssentialsPrevented: number;
};

export type NowPlan = {
  planId: string;
  userRequest: string;
  needCategory: string;
  urgencyLabel: string;
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

  substitutions: NowSubstitution[];
  confidence: NowConfidence;
  aiExplanation: string;
  checkoutSummary: NowCheckoutSummary;
  metrics: NowMetrics;
  userId: string;
  generatedAt: string;
  modelId: string;

  regretPrevention?: {
    productId: string;
    name: string;
    price: number;
    etaMinutes: number;
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
    status: "safe" | "tight" | "risky" | "urgent_but_no_exact_deadline";
    message: string;
  };

  coverage?: {
    score: number;
    coveredDimensions: number;
    totalDimensions: number;
    summary: string;
  };
};

export type GenerateNowPlanResponse = {
  success: boolean;
  plan: NowPlan;
  message?: string;
  error?: string;
};

export type NowOrder = {
  id: string;
  entityType: "ORDER";
  userId: string;
  selectedMode: DecisionMode;
  plan: NowPlan;
  status: "PLACED" | string;
  createdAt: string;
};

export type CheckoutNowOrderResponse = {
  success: boolean;
  message: string;
  order: NowOrder;
};

export type ListNowOrdersResponse = {
  success: boolean;
  count: number;
  orders: NowOrder[];
};

export type NowFeedbackInput = {
  userId?: string;
  planId?: string;
  action: string;
  productId?: string;
  productName?: string;
  selectedMode?: DecisionMode | "";
  note?: string;
};

export type NowFeedbackResponse = {
  success: boolean;
  message: string;
  feedback: {
    id: string;
    entityType: "FEEDBACK";
    userId: string;
    planId: string;
    action: string;
    productId: string;
    productName: string;
    selectedMode: string;
    note: string;
    createdAt: string;
  };
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Request failed with ${response.status}`
    );
  }

  return data as T;
}

export async function getNowProducts(): Promise<{
  success: boolean;
  count: number;
  products: NowProduct[];
}> {
  return apiRequest("/now/products");
}

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health");
}

export async function createItem(input: CreateItemInput): Promise<{
  success: boolean;
  message: string;
  item: Item;
}> {
  return apiRequest("/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getItems(): Promise<{
  success: boolean;
  count: number;
  items: Item[];
}> {
  return apiRequest("/items");
}

export async function askBedrock(
  question: string
): Promise<BedrockAskResponse> {
  return apiRequest<BedrockAskResponse>("/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function seedNowInventory(): Promise<{
  success: boolean;
  message: string;
  count: number;
}> {
  return apiRequest("/now/seed", {
    method: "POST",
  });
}

export async function generateNowPlan(
  input: NowPlanRequest
): Promise<GenerateNowPlanResponse> {
  return apiRequest<GenerateNowPlanResponse>("/now/plan", {
    method: "POST",
    body: JSON.stringify({
      userId: "demo-user-001",
      ...input,
    }),
  });
}

export async function checkoutNowOrder(input: {
  userId?: string;
  plan: NowPlan;
  selectedMode: DecisionMode;
}): Promise<CheckoutNowOrderResponse> {
  return apiRequest<CheckoutNowOrderResponse>("/now/checkout", {
    method: "POST",
    body: JSON.stringify({
      userId: "demo-user-001",
      ...input,
    }),
  });
}

export async function getNowOrders(
  userId = "demo-user-001"
): Promise<ListNowOrdersResponse> {
  return apiRequest<ListNowOrdersResponse>(
    `/now/orders?userId=${encodeURIComponent(userId)}`
  );
}

export async function sendNowFeedback(
  input: NowFeedbackInput
): Promise<NowFeedbackResponse> {
  return apiRequest<NowFeedbackResponse>("/now/feedback", {
    method: "POST",
    body: JSON.stringify({
      userId: "demo-user-001",
      ...input,
    }),
  });
}

export function getCartMode(plan: NowPlan, mode: DecisionMode): NowCartMode {
  return plan.cartModes[mode] || plan.cartModes[plan.recommendedMode];
}

export function getCartTotal(cartMode: NowCartMode): number {
  return cartMode.items.reduce((total, item) => {
    return total + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
}

export function getCartItemCount(cartMode: NowCartMode): number {
  return cartMode.items.reduce((total, item) => {
    return total + Number(item.quantity || 1);
  }, 0);
}
