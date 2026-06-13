const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE || "hackon6-items-dev";
const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "amazon.nova-micro-v1:0";

const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const bedrockClient = new BedrockRuntimeClient({
  region: BEDROCK_REGION,
});

const jsonResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
};

const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return null;
  }
};

const getTimeContext = () => {
  const now = new Date();
  const hour = now.getHours();

  let timeOfDay = "night";
  if (hour >= 5 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
  else if (hour >= 17 && hour < 22) timeOfDay = "evening";

  return {
    isoTime: now.toISOString(),
    localAssumption: "Asia/Kolkata style demo context",
    hour,
    timeOfDay,
  };
};

const demoInventory = [
  {
    id: "prod_snack_chips_001",
    entityType: "PRODUCT",
    name: "Classic Salted Potato Chips",
    category: "Snacks",
    aisle: "Grocery & Food",
    price: 60,
    etaMinutes: 11,
    available: true,
    tags: ["party", "guests", "ready-to-eat", "snacks", "fast"],
    imageHint: "chips packet",
  },
  {
    id: "prod_snack_nachos_001",
    entityType: "PRODUCT",
    name: "Cheese Nachos Party Pack",
    category: "Snacks",
    aisle: "Grocery & Food",
    price: 95,
    etaMinutes: 15,
    available: true,
    tags: ["party", "guests", "snacks", "shareable"],
    imageHint: "nachos packet",
  },
  {
    id: "prod_drink_cola_001",
    entityType: "PRODUCT",
    name: "Cola Bottle 750ml",
    category: "Beverages",
    aisle: "Grocery & Food",
    price: 45,
    etaMinutes: 10,
    available: true,
    tags: ["drinks", "guests", "party", "cold beverage", "fast"],
    imageHint: "cola bottle",
  },
  {
    id: "prod_drink_juice_001",
    entityType: "PRODUCT",
    name: "Mixed Fruit Juice 1L",
    category: "Beverages",
    aisle: "Grocery & Food",
    price: 110,
    etaMinutes: 16,
    available: true,
    tags: ["juice", "breakfast", "guests", "kids", "beverage"],
    imageHint: "juice carton",
  },
  {
    id: "prod_cups_001",
    entityType: "PRODUCT",
    name: "Disposable Paper Cups Pack of 20",
    category: "Party Essentials",
    aisle: "Home",
    price: 75,
    etaMinutes: 12,
    available: true,
    tags: ["cups", "party", "guests", "forgotten essential"],
    imageHint: "paper cups",
  },
  {
    id: "prod_tissues_001",
    entityType: "PRODUCT",
    name: "Soft Tissue Box",
    category: "Home Essentials",
    aisle: "Home",
    price: 65,
    etaMinutes: 9,
    available: true,
    tags: ["tissues", "guests", "cleaning", "forgotten essential", "fast"],
    imageHint: "tissue box",
  },
  {
    id: "prod_icecream_001",
    entityType: "PRODUCT",
    name: "Vanilla Ice Cream Tub",
    category: "Desserts",
    aisle: "Grocery & Food",
    price: 180,
    etaMinutes: 19,
    available: true,
    tags: ["dessert", "guests", "party", "sweet"],
    imageHint: "ice cream tub",
  },
  {
    id: "prod_milk_001",
    entityType: "PRODUCT",
    name: "Fresh Milk 1L",
    category: "Dairy",
    aisle: "Grocery & Food",
    price: 70,
    etaMinutes: 8,
    available: true,
    tags: ["breakfast", "daily essential", "milk", "fast"],
    imageHint: "milk bottle",
  },
  {
    id: "prod_bread_001",
    entityType: "PRODUCT",
    name: "Whole Wheat Bread",
    category: "Bakery",
    aisle: "Grocery & Food",
    price: 55,
    etaMinutes: 9,
    available: true,
    tags: ["breakfast", "bread", "daily essential", "fast"],
    imageHint: "bread loaf",
  },
  {
    id: "prod_eggs_001",
    entityType: "PRODUCT",
    name: "Farm Eggs Pack of 6",
    category: "Breakfast",
    aisle: "Grocery & Food",
    price: 90,
    etaMinutes: 14,
    available: true,
    tags: ["breakfast", "protein", "eggs"],
    imageHint: "egg carton",
  },
  {
    id: "prod_banana_001",
    entityType: "PRODUCT",
    name: "Banana Robusta 6 pcs",
    category: "Fruits",
    aisle: "Fresh",
    price: 65,
    etaMinutes: 11,
    available: true,
    tags: ["breakfast", "fruit", "healthy", "fast"],
    imageHint: "bananas",
  },
  {
    id: "prod_cereal_001",
    entityType: "PRODUCT",
    name: "Corn Flakes Cereal",
    category: "Breakfast",
    aisle: "Grocery & Food",
    price: 160,
    etaMinutes: 18,
    available: true,
    tags: ["breakfast", "cereal", "kids", "quick meal"],
    imageHint: "cereal box",
  },
  {
    id: "prod_tea_001",
    entityType: "PRODUCT",
    name: "Premium Tea Bags Pack",
    category: "Beverages",
    aisle: "Grocery & Food",
    price: 140,
    etaMinutes: 16,
    available: true,
    tags: ["tea", "morning", "guests", "breakfast"],
    imageHint: "tea box",
  },
  {
    id: "prod_cough_drops_001",
    entityType: "PRODUCT",
    name: "Honey Lemon Cough Drops",
    category: "Wellness",
    aisle: "Health & Personal Care",
    price: 50,
    etaMinutes: 13,
    available: true,
    tags: ["wellness", "cold", "sore throat", "general comfort"],
    imageHint: "cough drops",
  },
  {
    id: "prod_thermometer_001",
    entityType: "PRODUCT",
    name: "Digital Thermometer",
    category: "Health Devices",
    aisle: "Health & Personal Care",
    price: 220,
    etaMinutes: 20,
    available: true,
    tags: ["wellness", "health", "fever", "monitoring"],
    imageHint: "thermometer",
  },
  {
    id: "prod_tissues_pocket_001",
    entityType: "PRODUCT",
    name: "Pocket Tissues Pack",
    category: "Personal Care",
    aisle: "Health & Personal Care",
    price: 35,
    etaMinutes: 8,
    available: true,
    tags: ["cold", "travel", "tissues", "fast"],
    imageHint: "pocket tissues",
  },
  {
    id: "prod_baby_wipes_001",
    entityType: "PRODUCT",
    name: "Baby Wipes 72 pcs",
    category: "Baby Care",
    aisle: "Baby",
    price: 120,
    etaMinutes: 12,
    available: true,
    tags: ["baby", "wipes", "diaper", "forgotten essential"],
    imageHint: "baby wipes",
  },
  {
    id: "prod_diapers_001",
    entityType: "PRODUCT",
    name: "Baby Diapers Medium Pack",
    category: "Baby Care",
    aisle: "Baby",
    price: 360,
    etaMinutes: 17,
    available: true,
    tags: ["baby", "diapers", "urgent"],
    imageHint: "diaper pack",
  },
  {
    id: "prod_cleaner_001",
    entityType: "PRODUCT",
    name: "Multipurpose Surface Cleaner",
    category: "Cleaning",
    aisle: "Home",
    price: 135,
    etaMinutes: 15,
    available: true,
    tags: ["cleaning", "kitchen", "home", "quick cleanup"],
    imageHint: "cleaner bottle",
  },
  {
    id: "prod_garbage_bags_001",
    entityType: "PRODUCT",
    name: "Garbage Bags Medium Roll",
    category: "Cleaning",
    aisle: "Home",
    price: 95,
    etaMinutes: 14,
    available: true,
    tags: ["cleaning", "garbage", "home", "forgotten essential"],
    imageHint: "garbage bags",
  },
  {
    id: "prod_phone_charger_001",
    entityType: "PRODUCT",
    name: "USB-C Fast Charger 20W",
    category: "Electronics Accessories",
    aisle: "Electronics",
    price: 499,
    etaMinutes: 21,
    available: true,
    tags: ["charger", "work", "meeting", "electronics", "urgent"],
    imageHint: "phone charger",
  },
  {
    id: "prod_notebook_001",
    entityType: "PRODUCT",
    name: "A5 Notebook",
    category: "Office",
    aisle: "Office Essentials",
    price: 80,
    etaMinutes: 13,
    available: true,
    tags: ["office", "interview", "meeting", "notes"],
    imageHint: "notebook",
  },
  {
    id: "prod_pen_001",
    entityType: "PRODUCT",
    name: "Ball Pens Pack of 5",
    category: "Office",
    aisle: "Office Essentials",
    price: 50,
    etaMinutes: 10,
    available: true,
    tags: ["office", "interview", "meeting", "forgotten essential"],
    imageHint: "pens",
  },
  {
    id: "prod_deodorant_001",
    entityType: "PRODUCT",
    name: "Fresh Deodorant Spray",
    category: "Personal Care",
    aisle: "Beauty",
    price: 199,
    etaMinutes: 16,
    available: true,
    tags: ["interview", "grooming", "personal care", "work"],
    imageHint: "deodorant",
  },
  {
    id: "prod_umbrella_001",
    entityType: "PRODUCT",
    name: "Compact Umbrella",
    category: "Rain Essentials",
    aisle: "Home",
    price: 299,
    etaMinutes: 19,
    available: true,
    tags: ["rain", "umbrella", "weather", "urgent"],
    imageHint: "umbrella",
  },
];

const extractJsonFromText = (text) => {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Bedrock did not return JSON.");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
};

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
};

const normalizePercent = (value, fallback = 80) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  if (number <= 1) {
    return Math.round(number * 100);
  }

  if (number <= 10) {
    return Math.round(number * 10);
  }

  return Math.round(clampNumber(number, 0, 100, fallback));
};

const normalizeNowPlan = (plan, inventory, requestContext) => {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));

  const normalizeItem = (item) => {
    const product = inventoryById.get(item.productId);

    if (!product) {
      return null;
    }

    return {
      productId: product.id,
      name: product.name,
      quantity: clampNumber(item.quantity, 1, 10, 1),
      price: product.price,
      etaMinutes: product.etaMinutes,
      reason: item.reason || "Selected because it matches the urgent need.",
    };
  };

  const normalizeCartMode = (mode, fallbackLabel) => {
    const seenProductIds = new Set();

    const items = Array.isArray(mode?.items)
      ? mode.items
          .map(normalizeItem)
          .filter(Boolean)
          .filter((item) => {
            if (seenProductIds.has(item.productId)) {
              return false;
            }

            seenProductIds.add(item.productId);
            return true;
          })
          .slice(0, 8)
      : [];

    const etaMinutes =
      items.length > 0
        ? Math.max(...items.map((item) => Number(item.etaMinutes || 0)))
        : clampNumber(mode?.etaMinutes, 8, 35, 18);

    return {
      modeLabel: mode?.modeLabel || fallbackLabel,
      etaMinutes,
      cartTitle: mode?.cartTitle || `${fallbackLabel} Cart`,
      items,
      modeReason:
        mode?.modeReason ||
        `Optimized for the ${fallbackLabel.toLowerCase()} decision mode.`,
    };
  };

  const fastest = normalizeCartMode(plan.cartModes?.fastest, "Fastest");
  const bestValue = normalizeCartMode(plan.cartModes?.bestValue, "Best Value");
  const mostComplete = normalizeCartMode(
    plan.cartModes?.mostComplete,
    "Most Complete"
  );

  const recommendedMode = ["fastest", "bestValue", "mostComplete"].includes(
    plan.recommendedMode
  )
    ? plan.recommendedMode
    : requestContext.decisionMode || "fastest";

  const recommendedCart =
    recommendedMode === "bestValue"
      ? bestValue
      : recommendedMode === "mostComplete"
        ? mostComplete
        : fastest;

  const cartProductIds = new Set([
    ...fastest.items.map((item) => item.productId),
    ...bestValue.items.map((item) => item.productId),
    ...mostComplete.items.map((item) => item.productId),
  ]);

  const seenRegretIds = new Set();

  const regretPrevention = Array.isArray(plan.regretPrevention)
    ? plan.regretPrevention
        .filter((item) => inventoryById.has(item.productId))
        .map((item) => {
          const product = inventoryById.get(item.productId);

          return {
            productId: product.id,
            name: product.name,
            price: product.price,
            etaMinutes: product.etaMinutes,
            reason:
              item.reason ||
              "A commonly forgotten supporting item for this situation.",
          };
        })
        .filter((item) => {
          if (cartProductIds.has(item.productId)) {
            return false;
          }

          if (seenRegretIds.has(item.productId)) {
            return false;
          }

          seenRegretIds.add(item.productId);
          return true;
        })
        .slice(0, 4)
    : [];

  const substitutions = Array.isArray(plan.substitutions)
    ? plan.substitutions
        .filter(
          (item) =>
            inventoryById.has(item.originalProductId) &&
            inventoryById.has(item.suggestedProductId)
        )
        .map((item) => {
          const original = inventoryById.get(item.originalProductId);
          const suggested = inventoryById.get(item.suggestedProductId);

          return {
            originalProductId: original.id,
            originalName: original.name,
            suggestedProductId: suggested.id,
            suggestedName: suggested.name,
            minutesSaved: Math.max(
              0,
              Number(original.etaMinutes || 0) -
                Number(suggested.etaMinutes || 0)
            ),
            reason:
              item.reason ||
              "Suggested because it can better match urgency, availability, or price.",
          };
        })
        .slice(0, 3)
    : [];

  const estimatedTotal = recommendedCart.items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  const itemCount = recommendedCart.items.reduce(
    (sum, item) => sum + Number(item.quantity || 1),
    0
  );

  return {
    ...plan,
    planId: `plan_${randomUUID()}`,
    userRequest: requestContext.userRequest,
    urgencyScore: normalizePercent(plan.urgencyScore, 80),
    urgencyLabel: plan.urgencyLabel || "High",
    peopleCount: clampNumber(plan.peopleCount, 1, 20, 1),
    budgetMode: requestContext.budgetMode,
    panicMode: requestContext.panicMode,
    recommendedMode,
    cartModes: {
      fastest,
      bestValue,
      mostComplete,
    },
    regretPrevention,
    substitutions,
    confidence: {
      overall: normalizePercent(plan.confidence?.overall, 85),
      needMatch: normalizePercent(plan.confidence?.needMatch, 85),
      availabilityFit: normalizePercent(plan.confidence?.availabilityFit, 85),
      budgetFit: normalizePercent(plan.confidence?.budgetFit, 80),
      completeness: normalizePercent(plan.confidence?.completeness, 80),
      reason:
        plan.confidence?.reason ||
        "Confidence is based on need match, availability, budget fit, and completeness.",
    },
    checkoutSummary: {
      estimatedTotal,
      itemCount,
      etaMinutes: recommendedCart.etaMinutes,
      oneTapMessage:
        plan.checkoutSummary?.oneTapMessage ||
        `Checkout ${itemCount} items with estimated delivery in ${recommendedCart.etaMinutes} minutes.`,
    },
    metrics: {
      estimatedTimeToCartSeconds: clampNumber(
        plan.metrics?.estimatedTimeToCartSeconds,
        3,
        15,
        7
      ),
      decisionsReducedFrom: clampNumber(
        plan.metrics?.decisionsReducedFrom,
        8,
        40,
        18
      ),
      decisionsReducedTo: clampNumber(
        plan.metrics?.decisionsReducedTo,
        1,
        3,
        3
      ),
      forgottenEssentialsPrevented:
        regretPrevention.length ||
        clampNumber(plan.metrics?.forgottenEssentialsPrevented, 0, 5, 2),
    },
  };
};

const scanByEntityType = async (entityType, limit = 100) => {
  const result = await docClient.send(
    new ScanCommand({
      TableName: ITEMS_TABLE,
      FilterExpression: "entityType = :entityType",
      ExpressionAttributeValues: {
        ":entityType": entityType,
      },
      Limit: limit,
    })
  );

  return result.Items || [];
};

const getInventory = async () => {
  const products = await scanByEntityType("PRODUCT", 100);

  if (products.length > 0) {
    return products;
  }

  return demoInventory;
};

const getUserMemory = async (userId) => {
  const [orders, feedback] = await Promise.all([
    scanByEntityType("ORDER", 30),
    scanByEntityType("FEEDBACK", 50),
  ]);

  const userOrders = orders.filter((order) => order.userId === userId);
  const userFeedback = feedback.filter((item) => item.userId === userId);

  return {
    userId,
    previousOrders: userOrders.slice(0, 5).map((order) => ({
      orderId: order.id,
      selectedMode: order.selectedMode,
      needCategory: order.plan?.needCategory,
      createdAt: order.createdAt,
    })),
    feedbackSignals: userFeedback.slice(0, 10).map((item) => ({
      action: item.action,
      productName: item.productName,
      selectedMode: item.selectedMode,
      note: item.note,
      createdAt: item.createdAt,
    })),
  };
};

const buildNowPlanPrompt = ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  timeContext,
  inventory,
  userMemory,
}) => {
  return `
You are Amazon Now Assist, an urgency-aware quick-commerce AI system.

Your job:
Turn a real-life urgent situation into a ready-to-checkout shopping plan.

Very important rules:
1. Do NOT use hardcoded scenario mappings.
2. Generate recommendations dynamically from the user's request, urgency, time of day, available inventory, budget mode, decision mode, panic mode, and user memory.
3. Recommend only products from the provided inventory when creating cart items, regret prevention items, and substitutions.
4. Do not invent product IDs.
5. For health/wellness requests, do not diagnose, do not prescribe, and do not give dosage advice. Recommend only general comfort or wellness essentials from inventory.
6. Return only valid JSON. No markdown. No commentary outside JSON.
7. urgencyScore must be an integer between 0 and 100.
8. confidence values must be integers between 0 and 100.
9. estimatedTimeToCartSeconds means how fast the app creates the cart, usually 3 to 10 seconds. It is not the delivery time.
10. regretPrevention must only include items directly useful for the user's current situation. Do not include unrelated daily essentials.
11. planId can be any string, but the backend will replace it with a unique ID.
12. If panicMode is true, prioritize fastest ETA and ready-to-use items.
13. Product IDs must be copied exactly from the provided inventory "id" field. Never shorten, rename, or invent product IDs.
14. Do not recommend daily essentials unless the user request clearly needs them.
15. Do not recommend breakfast items unless the user mentions breakfast, morning meal, milk, bread, eggs, or similar food-prep intent.
16. For guest, gathering, party, or hosting situations, prefer items whose tags/categories directly support guests, drinks, snacks, desserts, serving, cleanup, or party essentials.
17. Regret prevention items must be small supporting items the user may forget. They must not be unrelated expensive items.
18. If no regret-prevention item is strongly relevant, return an empty regretPrevention array.
19. Each cart item reason must clearly connect the item to the user's request.
20. For panicMode true, avoid items that require cooking or preparation unless the user explicitly asks for cooking.
21. The explicit user situation is more important than time of day. Do not infer breakfast just because it is morning unless the user mentions breakfast, tea, coffee, milk, bread, eggs, or morning meal.
22. For guest/party/hosting situations, every cart mode must contain at least 3 valid products from snacks, beverages, dessert, serving items, cleanup items, or party essentials.
23. Every cart mode must be non-empty. fastest, bestValue, and mostComplete must all contain valid inventory product IDs.
24. Do not include Bread, Eggs, Cereal, Tea, or Bananas for guest/party situations unless the user explicitly asks for breakfast or tea.
25. Use exact product IDs from inventory. For example, use "prod_drink_cola_001", not "prod_cola_001".
26. If you cannot create substitutions naturally, return an empty substitutions array.
27. decisionsReducedTo must usually be 3 because the UI compresses the experience into Fastest, Best Value, and Most Complete.
28. The three cart modes should be meaningfully different:
   - fastest: lowest ETA and ready-to-use items
   - bestValue: lower total price but still useful
   - mostComplete: broader coverage with more supporting items
29. The needCategory must reflect the user's explicit request. Do not classify breakfast as snacks_and_beverages unless the user specifically asks for snacks.
30. If the user explicitly requests breakfast, morning meal, milk, bread, eggs, cereal, fruit, tea, coffee, or juice, prioritize breakfast, dairy, bakery, fruits, cereal, and morning beverage items.
31. If the user explicitly requests guests, friends, party, hosting, or gathering, prioritize snacks, beverages, desserts, serving items, cleanup items, and party essentials.
32. Do not let timeOfDay override the explicit user request. The explicit request is the strongest signal.
33. Every cart mode must match the same user need, but optimize differently for Fastest, Best Value, and Most Complete.
34. Never convert a breakfast request into a party/snack cart.
35. Never convert a guest/party request into a breakfast cart.

User request:
${userRequest}

Context:
${JSON.stringify(
  {
    budgetMode,
    decisionMode,
    panicMode,
    timeContext,
    userMemory,
  },
  null,
  2
)}

Available inventory:
${JSON.stringify(inventory, null, 2)}

Return JSON using this exact shape:
{
  "planId": "string",
  "userRequest": "string",
  "needCategory": "string",
  "urgencyLabel": "Low | Medium | High | Critical",
  "urgencyScore": 0,
  "urgencyReason": "string",
  "peopleCount": 1,
  "timeContext": {
    "timeOfDay": "string",
    "reason": "string"
  },
  "budgetMode": "save | balanced | premium",
  "panicMode": false,
  "recommendedMode": "fastest | bestValue | mostComplete",
  "cartModes": {
    "fastest": {
      "modeLabel": "Fastest",
      "etaMinutes": 0,
      "cartTitle": "string",
      "items": [
        {
          "productId": "string",
          "name": "string",
          "quantity": 1,
          "price": 0,
          "etaMinutes": 0,
          "reason": "string"
        }
      ],
      "modeReason": "string"
    },
    "bestValue": {
      "modeLabel": "Best Value",
      "etaMinutes": 0,
      "cartTitle": "string",
      "items": [
        {
          "productId": "string",
          "name": "string",
          "quantity": 1,
          "price": 0,
          "etaMinutes": 0,
          "reason": "string"
        }
      ],
      "modeReason": "string"
    },
    "mostComplete": {
      "modeLabel": "Most Complete",
      "etaMinutes": 0,
      "cartTitle": "string",
      "items": [
        {
          "productId": "string",
          "name": "string",
          "quantity": 1,
          "price": 0,
          "etaMinutes": 0,
          "reason": "string"
        }
      ],
      "modeReason": "string"
    }
  },
  "regretPrevention": [
    {
      "productId": "string",
      "name": "string",
      "price": 0,
      "etaMinutes": 0,
      "reason": "string"
    }
  ],
  "substitutions": [
    {
      "originalProductId": "string",
      "originalName": "string",
      "suggestedProductId": "string",
      "suggestedName": "string",
      "minutesSaved": 0,
      "reason": "string"
    }
  ],
  "confidence": {
    "overall": 0,
    "needMatch": 0,
    "availabilityFit": 0,
    "budgetFit": 0,
    "completeness": 0,
    "reason": "string"
  },
  "aiExplanation": "string",
  "checkoutSummary": {
    "estimatedTotal": 0,
    "itemCount": 0,
    "etaMinutes": 0,
    "oneTapMessage": "string"
  },
  "metrics": {
    "estimatedTimeToCartSeconds": 0,
    "decisionsReducedFrom": 0,
    "decisionsReducedTo": 0,
    "forgottenEssentialsPrevented": 0
  }
}
`;
};

const generatePlanWithBedrock = async ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  userId,
}) => {
  const timeContext = getTimeContext();
  const inventory = await getInventory();
  const userMemory = await getUserMemory(userId);

  const prompt = buildNowPlanPrompt({
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
    timeContext,
    inventory,
    userMemory,
  });

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [
          {
            text: prompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 2500,
      temperature: 0.35,
      topP: 0.9,
    },
  });

  const response = await bedrockClient.send(command);

  const text =
    response.output?.message?.content
      ?.map((block) => block.text || "")
      .join("")
      .trim() || "";

  const jsonText = extractJsonFromText(text);
  let rawPlan = JSON.parse(jsonText);

  let normalizedPlan = normalizeNowPlan(rawPlan, inventory, {
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
  });

  const hasIncompleteModes =
    normalizedPlan.cartModes.fastest.items.length < 3 ||
    normalizedPlan.cartModes.bestValue.items.length < 3 ||
    normalizedPlan.cartModes.mostComplete.items.length < 3;

  if (hasIncompleteModes) {
    const repairPrompt = `
The previous Amazon Now Assist plan was incomplete or weak after backend validation.

Your task:
Repair the plan while preserving the user's explicit intent.

Critical repair rules:
1. Each of fastest, bestValue, and mostComplete must contain at least 3 valid products.
2. Product IDs must be copied exactly from the provided inventory "id" field.
3. Do not invent, shorten, rename, or approximate product IDs.
4. The user's explicit request is the strongest signal.
5. Do not let time of day override the explicit request.
6. Do not let the previous weak plan override the explicit request.
7. If the user asks for breakfast or morning meal, prioritize breakfast, dairy, bakery, fruits, cereal, tea, coffee, juice, or other morning-appropriate products from inventory.
8. If the user asks for guests, friends, party, hosting, or gathering, prioritize snacks, beverages, desserts, serving items, cleanup items, or party essentials from inventory.
9. If the user asks for health or wellness, recommend only general comfort/wellness essentials. Do not diagnose, prescribe, or suggest dosage.
10. If the user asks for cleaning, prioritize cleaning and home support products.
11. If the user asks for work, interview, meeting, or device emergency, prioritize office, personal care, and electronics accessories.
12. Every cart mode must match the same user intent but optimize differently:
    - fastest: lowest ETA and ready-to-use items
    - bestValue: lower total price but still useful
    - mostComplete: broader coverage with more supporting items
13. Regret prevention must contain only small supporting items the user may forget.
14. If no substitution is naturally useful, return an empty substitutions array.
15. Return only valid JSON in the exact same schema. No markdown. No commentary.

Original user request:
${userRequest}

Budget mode:
${budgetMode}

Decision mode:
${decisionMode}

Panic mode:
${panicMode}

Available inventory:
${JSON.stringify(inventory, null, 2)}

Previous invalid/weak plan:
${JSON.stringify(rawPlan, null, 2)}
`;

    const repairCommand = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            {
              text: repairPrompt,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 2500,
        temperature: 0.2,
        topP: 0.8,
      },
    });

    const repairResponse = await bedrockClient.send(repairCommand);

    const repairText =
      repairResponse.output?.message?.content
        ?.map((block) => block.text || "")
        .join("")
        .trim() || "";

    const repairJsonText = extractJsonFromText(repairText);
    rawPlan = JSON.parse(repairJsonText);

    normalizedPlan = normalizeNowPlan(rawPlan, inventory, {
      userRequest,
      budgetMode,
      decisionMode,
      panicMode,
    });
  }

  return {
    ...normalizedPlan,
    userId,
    generatedAt: new Date().toISOString(),
    modelId: BEDROCK_MODEL_ID,
  };
};

module.exports.health = async () => {
  return jsonResponse(200, {
    success: true,
    message: "HackOn 6.0 backend is healthy",
    service: "hackon6-api",
    timestamp: new Date().toISOString(),
  });
};

module.exports.createItem = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const title = body.title?.trim();
    const description = body.description?.trim();

    if (!title) {
      return jsonResponse(400, {
        success: false,
        message: "Title is required",
      });
    }

    const item = {
      id: randomUUID(),
      entityType: "ITEM",
      title,
      description: description || "",
      status: body.status || "new",
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: ITEMS_TABLE,
        Item: item,
      })
    );

    return jsonResponse(201, {
      success: true,
      message: "Item created successfully",
      item,
    });
  } catch (error) {
    console.error("createItem error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to create item",
      error: error.message,
    });
  }
};

module.exports.listItems = async () => {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ITEMS_TABLE,
      })
    );

    const items = result.Items || [];

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return jsonResponse(200, {
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("listItems error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to list items",
      error: error.message,
    });
  }
};

module.exports.askBedrock = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const question = body.question?.trim();

    if (!question) {
      return jsonResponse(400, {
        success: false,
        message: "Question is required",
      });
    }

    const command = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            {
              text: `You are an expert AWS solutions architect helping a hackathon team. Answer clearly, practically, and concisely.\n\nQuestion: ${question}`,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0.4,
        topP: 0.9,
      },
    });

    const response = await bedrockClient.send(command);

    const answer =
      response.output?.message?.content
        ?.map((block) => block.text || "")
        .join("")
        .trim() || "No answer generated.";

    return jsonResponse(200, {
      success: true,
      question,
      answer,
      modelId: BEDROCK_MODEL_ID,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("askBedrock error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to get Bedrock answer",
      error: error.message,
    });
  }
};

module.exports.seedNowInventory = async () => {
  try {
    const createdAt = new Date().toISOString();

    await Promise.all(
      demoInventory.map((product) =>
        docClient.send(
          new PutCommand({
            TableName: ITEMS_TABLE,
            Item: {
              ...product,
              seededFor: "amazon-now-assist",
              createdAt,
              updatedAt: createdAt,
            },
          })
        )
      )
    );

    return jsonResponse(200, {
      success: true,
      message: "Amazon Now Assist demo inventory seeded successfully",
      count: demoInventory.length,
    });
  } catch (error) {
    console.error("seedNowInventory error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to seed inventory",
      error: error.message,
    });
  }
};

module.exports.generateNowPlan = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const userRequest = body.userRequest?.trim();
    const userId = body.userId || "demo-user-001";
    const budgetMode = body.budgetMode || "balanced";
    const decisionMode = body.decisionMode || "fastest";
    const panicMode = Boolean(body.panicMode);

    if (!userRequest) {
      return jsonResponse(400, {
        success: false,
        message: "userRequest is required",
      });
    }

    if (userRequest.length > 1000) {
      return jsonResponse(400, {
        success: false,
        message: "userRequest must be under 1000 characters",
      });
    }

    const plan = await generatePlanWithBedrock({
      userRequest,
      budgetMode,
      decisionMode,
      panicMode,
      userId,
    });

    await docClient.send(
      new PutCommand({
        TableName: ITEMS_TABLE,
        Item: {
          id: plan.planId,
          entityType: "SHOPPING_PLAN",
          userId,
          userRequest,
          plan,
          createdAt: new Date().toISOString(),
        },
      })
    );

    return jsonResponse(200, {
      success: true,
      plan,
    });
  } catch (error) {
    console.error("generateNowPlan error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to generate Amazon Now plan",
      error: error.message,
    });
  }
};

module.exports.checkoutNowOrder = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const userId = body.userId || "demo-user-001";
    const plan = body.plan;
    const selectedMode =
      body.selectedMode || plan?.recommendedMode || "fastest";

    if (!plan) {
      return jsonResponse(400, {
        success: false,
        message: "plan is required",
      });
    }

    const order = {
      id: `order_${randomUUID()}`,
      entityType: "ORDER",
      userId,
      selectedMode,
      plan,
      status: "PLACED",
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: ITEMS_TABLE,
        Item: order,
      })
    );

    return jsonResponse(201, {
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    console.error("checkoutNowOrder error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to checkout order",
      error: error.message,
    });
  }
};

module.exports.listNowOrders = async (event) => {
  try {
    const userId =
      event.queryStringParameters?.userId ||
      event.queryStringParameters?.userID;

    const orders = await scanByEntityType("ORDER", 100);

    const filteredOrders = userId
      ? orders.filter((order) => order.userId === userId)
      : orders;

    filteredOrders.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return jsonResponse(200, {
      success: true,
      count: filteredOrders.length,
      orders: filteredOrders,
    });
  } catch (error) {
    console.error("listNowOrders error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to list orders",
      error: error.message,
    });
  }
};

module.exports.saveNowFeedback = async (event) => {
  try {
    const body = parseBody(event);

    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const feedback = {
      id: `feedback_${randomUUID()}`,
      entityType: "FEEDBACK",
      userId: body.userId || "demo-user-001",
      planId: body.planId || "",
      action: body.action || "unknown",
      productId: body.productId || "",
      productName: body.productName || "",
      selectedMode: body.selectedMode || "",
      note: body.note || "",
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: ITEMS_TABLE,
        Item: feedback,
      })
    );

    return jsonResponse(201, {
      success: true,
      message: "Feedback saved successfully",
      feedback,
    });
  } catch (error) {
    console.error("saveNowFeedback error:", error);

    return jsonResponse(500, {
      success: false,
      message: "Failed to save feedback",
      error: error.message,
    });
  }
};
