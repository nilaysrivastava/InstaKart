const { randomUUID } = require("crypto");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE || "hackon6-items-dev";
const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_PLANNER_MODEL_ID =
  process.env.BEDROCK_PLANNER_MODEL_ID || "amazon.nova-pro-v1:0";
const BEDROCK_FALLBACK_MODEL_ID =
  process.env.BEDROCK_FALLBACK_MODEL_ID ||
  process.env.BEDROCK_FAST_MODEL_ID ||
  "amazon.nova-micro-v1:0";
const BEDROCK_FAST_MODEL_ID =
  process.env.BEDROCK_FAST_MODEL_ID || "amazon.nova-micro-v1:0";
const BEDROCK_EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v2:0";
const ENABLE_EMBEDDING_RANKING =
  process.env.ENABLE_EMBEDDING_RANKING !== "false";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const COGNITO_USER_POOL_CLIENT_ID =
  process.env.COGNITO_USER_POOL_CLIENT_ID || "";

const PRODUCT_INDEX_NAME = "EntityTypeAisleIndex";
const USER_INDEX_NAME = "UserCreatedAtIndex";
const INVENTORY_CACHE_TTL_MS = Number(
  process.env.INVENTORY_CACHE_TTL_MS || 5000
);
const PLANNER_TIMEOUT_MS = Number(process.env.PLANNER_TIMEOUT_MS || 18000);

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

let inventoryCache = {
  items: null,
  fetchedAt: 0,
};

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  },
  body: JSON.stringify(body),
});

const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return null;
  }
};

const localCognitoVerifier =
  COGNITO_USER_POOL_ID && COGNITO_USER_POOL_CLIENT_ID
    ? CognitoJwtVerifier.create({
        userPoolId: COGNITO_USER_POOL_ID,
        tokenUse: "access",
        clientId: COGNITO_USER_POOL_CLIENT_ID,
      })
    : null;

const getAuthenticatedUser = async (event) => {
  let claims = event.requestContext?.authorizer?.jwt?.claims;

  if (process.env.IS_OFFLINE) {
    const authorization =
      event.headers?.authorization || event.headers?.Authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token || !localCognitoVerifier) return null;

    try {
      claims = await localCognitoVerifier.verify(token);
    } catch (error) {
      console.warn("Local Cognito token verification failed:", error.message);
      return null;
    }
  }

  const userId = claims?.sub;

  if (!userId) return null;

  return {
    userId,
    email: claims.email || "",
    username: claims["cognito:username"] || claims.username || "",
    groups: getCognitoGroups(claims),
  };
};

const unauthorizedResponse = () =>
  jsonResponse(401, {
    success: false,
    message: "Sign in is required.",
  });

const getCognitoGroups = (claims = {}) => {
  const groups = claims["cognito:groups"];
  if (Array.isArray(groups)) return groups.map(String);
  if (typeof groups === "string") {
    return groups
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((group) => group.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
};

const getAdminUser = async (event) => {
  const user = await getAuthenticatedUser(event);
  if (!user) return null;
  return user.groups.includes("admin") ? user : null;
};

const forbiddenResponse = () =>
  jsonResponse(403, {
    success: false,
    message: "Administrator access is required.",
  });

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const normalizePercent = (value, fallback = 80) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number <= 1) return Math.round(number * 100);
  if (number <= 10) return Math.round(number * 10);
  return Math.round(clampNumber(number, 0, 100, fallback));
};

const safeString = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const validBudgetMode = (value) =>
  ["save", "balanced", "premium"].includes(value) ? value : "balanced";

const validDecisionMode = (value) =>
  ["fastest", "bestValue", "mostComplete"].includes(value) ? value : "fastest";

const getTimeContext = () => {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const hour = ist.getUTCHours();

  let timeOfDay = "night";
  if (hour >= 5 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
  else if (hour >= 17 && hour < 22) timeOfDay = "evening";

  return {
    isoTime: now.toISOString(),
    localAssumption: "Asia/Kolkata",
    hour,
    timeOfDay,
  };
};

const normalizeTextForSearch = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const formatNeedCategory = (category = "urgent_need") =>
  String(category || "urgent_need")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const extractJsonFromText = (text = "") => {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Bedrock did not return a JSON object.");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
};

const parseJsonObjectFromText = (text = "") => {
  const jsonText = extractJsonFromText(text);
  const parsed = JSON.parse(jsonText);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Bedrock JSON was not an object.");
  }

  return parsed;
};

const callBedrockConverse = async ({
  prompt,
  modelId = BEDROCK_PLANNER_MODEL_ID,
  maxTokens = 650,
  temperature = 0.12,
  topP = 0.65,
}) => {
  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens,
      temperature,
      topP,
    },
  });

  const response = await bedrockClient.send(command);

  return (
    response.output?.message?.content
      ?.map((block) => block.text || "")
      .join("")
      .trim() || ""
  );
};

const embeddingCache = new Map();

const buildProductEmbeddingText = (product = {}) => {
  return [
    product.name,
    product.category,
    product.aisle,
    product.budgetTier,
    product.speedTier,
    product.packSize,
    ...(product.tags || []),
    product.searchText,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1500);
};

const decodeBedrockBody = (body) => {
  if (!body) return "{}";
  if (typeof body.transformToString === "function") {
    return body.transformToString();
  }
  return Buffer.from(body).toString("utf8");
};

const generateEmbedding = async (text) => {
  const inputText = safeString(text).slice(0, 2000);
  if (!inputText) return null;

  const cacheKey = inputText.toLowerCase();
  if (embeddingCache.has(cacheKey)) return embeddingCache.get(cacheKey);

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: BEDROCK_EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText,
        dimensions: 512,
        normalize: true,
      }),
    })
  );

  const rawBody = await decodeBedrockBody(response.body);
  const parsed = JSON.parse(rawBody);
  const embedding = parsed.embedding || parsed.embeddings?.[0];

  if (!Array.isArray(embedding) || !embedding.length) {
    throw new Error(
      "Titan embedding response did not include an embedding array."
    );
  }

  embeddingCache.set(cacheKey, embedding);

  if (embeddingCache.size > 100) {
    const firstKey = embeddingCache.keys().next().value;
    embeddingCache.delete(firstKey);
  }

  return embedding;
};

const cosineSimilarity = (a = [], b = []) => {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const x = Number(a[index] || 0);
    const y = Number(b[index] || 0);
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const stripProductEmbedding = (product) => {
  const { embedding, ...safeProduct } = product || {};
  return safeProduct;
};

const lexicalScoreProduct = (product, requestTokens) => {
  const name = String(product.name || "").toLowerCase();
  const tags = (product.tags || []).map((tag) =>
    String(tag || "").toLowerCase()
  );
  const searchableText = [
    product.name,
    product.category,
    product.aisle,
    product.searchText,
    ...tags,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  requestTokens.forEach((token) => {
    if (!token) return;
    if (name.includes(token)) score += 10;
    if (tags.some((tag) => tag.includes(token))) score += 7;
    if (searchableText.includes(token)) score += 4;
  });

  const eta = Number(product.etaMinutes || 999);
  const etaBoost = Math.max(0, 25 - eta) / 8;
  const availabilityPenalty = product.available === false ? -50 : 0;

  return score + etaBoost + availabilityPenalty;
};

const callPlannerWithFallback = async ({
  prompt,
  maxTokens = 650,
  temperature = 0.12,
  topP = 0.65,
}) => {
  const startedAt = Date.now();

  try {
    console.log("Calling planner model:", BEDROCK_PLANNER_MODEL_ID);

    const text = await callBedrockConverse({
      prompt,
      modelId: BEDROCK_PLANNER_MODEL_ID,
      maxTokens,
      temperature,
      topP,
    });

    console.log("Planner model completed:", {
      modelId: BEDROCK_PLANNER_MODEL_ID,
      durationMs: Date.now() - startedAt,
      outputChars: text.length,
    });

    return {
      text,
      modelId: BEDROCK_PLANNER_MODEL_ID,
      usedFallback: false,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (BEDROCK_FALLBACK_MODEL_ID === BEDROCK_PLANNER_MODEL_ID) {
      console.error("Planner model failed and fallback model is identical:", {
        modelId: BEDROCK_PLANNER_MODEL_ID,
        message: error.message,
        durationMs,
      });
      throw error;
    }

    console.error("Planner model failed, using fallback model:", {
      plannerModelId: BEDROCK_PLANNER_MODEL_ID,
      fallbackModelId: BEDROCK_FALLBACK_MODEL_ID,
      message: error.message,
      durationMs,
    });

    const fallbackStartedAt = Date.now();
    const text = await callBedrockConverse({
      prompt,
      modelId: BEDROCK_FALLBACK_MODEL_ID,
      maxTokens,
      temperature,
      topP,
    });

    console.log("Fallback model completed:", {
      modelId: BEDROCK_FALLBACK_MODEL_ID,
      durationMs: Date.now() - fallbackStartedAt,
      outputChars: text.length,
    });

    return {
      text,
      modelId: BEDROCK_FALLBACK_MODEL_ID,
      usedFallback: true,
    };
  }
};

const withTimeout = (promise, timeoutMs, message = "AI_PLANNER_TIMEOUT") => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

const queryProducts = async (limit = 300) => {
  const products = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: PRODUCT_INDEX_NAME,
        KeyConditionExpression: "entityType = :entityType",
        ExpressionAttributeValues: {
          ":entityType": "PRODUCT",
        },
        ExclusiveStartKey,
      })
    );

    products.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey && products.length < limit);

  return products.slice(0, limit);
};

const scanByEntityType = async (entityType, limit = 100) => {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ITEMS_TABLE,
        FilterExpression: "entityType = :entityType",
        ExpressionAttributeValues: {
          ":entityType": entityType,
        },
        ExclusiveStartKey,
        Limit: Math.min(100, limit - items.length),
      })
    );

    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < limit);

  return items.slice(0, limit);
};

const getProductQuantity = (product = {}) => {
  const quantity = Number(product.quantity);
  if (Number.isFinite(quantity)) return Math.max(0, Math.floor(quantity));
  return product.available === false || product.isAvailable === false ? 0 : 100;
};

const isProductPurchasable = (product = {}) =>
  product.available !== false &&
  product.isAvailable !== false &&
  getProductQuantity(product) > 0;

const normalizeProducts = (products = []) =>
  products
    .map((product) => ({
      ...product,
      price: Number(product.price || 0),
      etaMinutes: Number(product.etaMinutes || 999),
      quantity: getProductQuantity(product),
      isAvailable:
        product.isAvailable !== false && product.available !== false,
      available:
        product.isAvailable !== false && product.available !== false,
      tags: Array.isArray(product.tags) ? product.tags : [],
    }))
    .sort((a, b) => Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999));

const refreshInventoryCache = async () => {
  const products = await queryProducts(300);
  const inventory = normalizeProducts(products);
  inventoryCache = {
    items: inventory,
    fetchedAt: Date.now(),
  };
  return inventory;
};

const getInventory = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  const hasCache =
    Array.isArray(inventoryCache.items) && inventoryCache.items.length;
  const isExpired = now - inventoryCache.fetchedAt >= INVENTORY_CACHE_TTL_MS;

  if (!forceRefresh && hasCache) {
    if (isExpired) {
      return refreshInventoryCache();
    }
    return inventoryCache.items;
  }

  return refreshInventoryCache();
};

const queryUserEntities = async (userId, limit = 80) => {
  if (!userId) return [];

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: ITEMS_TABLE,
        IndexName: USER_INDEX_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return result.Items || [];
  } catch (error) {
    console.warn("UserCreatedAtIndex query failed, falling back to scans:", {
      message: error.message,
    });

    const [orders, feedback] = await Promise.all([
      scanByEntityType("ORDER", 50),
      scanByEntityType("FEEDBACK", 80),
    ]);

    return [...orders, ...feedback]
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }
};

const getUserMemory = async (userId) => {
  const entities = await queryUserEntities(userId, 60);
  const orders = entities.filter((item) => item.entityType === "ORDER");
  const feedback = entities.filter((item) => item.entityType === "FEEDBACK");

  return {
    previousNeedCategories: orders
      .map((order) => order.plan?.needCategory)
      .filter(Boolean)
      .slice(0, 5),
    likedProducts: feedback
      .filter((item) =>
        ["add", "keep", "like", "accepted"].includes(item.action)
      )
      .map((item) => item.productName)
      .filter(Boolean)
      .slice(0, 5),
    skippedProducts: feedback
      .filter((item) =>
        ["skip", "remove", "dislike", "rejected"].includes(item.action)
      )
      .map((item) => item.productName)
      .filter(Boolean)
      .slice(0, 5),
  };
};

const inferSimpleNeedCategory = (userRequest = "") => {
  const text = String(userRequest).toLowerCase();

  if (text.includes("birthday") || text.includes("surprise"))
    return "birthday_surprise";
  if (
    text.includes("trip") ||
    text.includes("travel") ||
    text.includes("packing")
  )
    return "travel_packing";
  if (text.includes("interview") || text.includes("presentable"))
    return "interview_ready";
  if (
    text.includes("dog") ||
    text.includes("cat") ||
    text.includes("pet") ||
    text.includes("mess")
  )
    return "pet_cleanup";
  if (text.includes("power cut") || text.includes("power"))
    return "power_cut_prep";
  if (
    text.includes("friend") ||
    text.includes("guest") ||
    text.includes("party")
  )
    return "guest_hosting";
  if (text.includes("breakfast") || text.includes("morning meal"))
    return "breakfast_rush";
  if (
    text.includes("finger") ||
    text.includes("cut") ||
    text.includes("wound") ||
    text.includes("bleeding") ||
    text.includes("injury")
  )
    return "first_aid";
  if (text.includes("spill") || text.includes("clean")) return "quick_cleanup";
  if (text.includes("exam") || text.includes("study")) return "study_session";
  if (text.includes("cold") || text.includes("fever")) return "health_comfort";

  return "urgent_need";
};

const NEED_CATEGORY_SEARCH_TERMS = {
  birthday_surprise: [
    "birthday",
    "cake",
    "candles",
    "decoration",
    "gift",
    "party",
    "surprise",
  ],
  travel_packing: [
    "travel",
    "packing",
    "toiletry",
    "snack",
    "hygiene",
    "charger",
    "bag",
  ],
  interview_ready: [
    "interview",
    "grooming",
    "fresh",
    "formal",
    "meeting",
    "documents",
  ],
  pet_cleanup: ["pet", "dog", "cat", "mess", "odor", "cleaning", "food"],
  power_cut_prep: [
    "power",
    "light",
    "battery",
    "torch",
    "candle",
    "charging",
    "emergency",
  ],
  guest_hosting: [
    "friends",
    "guests",
    "party",
    "snacks",
    "drinks",
    "serving",
    "beverages",
    "cleanup",
  ],
  breakfast_rush: [
    "breakfast",
    "milk",
    "bread",
    "fruit",
    "cereal",
    "quick meal",
    "tea",
  ],
  quick_cleanup: [
    "spill",
    "cleaning",
    "wipes",
    "towels",
    "disinfect",
    "garbage",
  ],
  first_aid: [
    "first aid",
    "bandage",
    "antiseptic",
    "cotton",
    "wound",
    "injury",
  ],
  study_session: [
    "exam",
    "study",
    "notes",
    "pen",
    "coffee",
    "energy",
    "stationery",
  ],
  health_comfort: [
    "cold",
    "fever",
    "wellness",
    "hydration",
    "comfort",
    "tissues",
    "sore throat",
  ],
};

const expandSearchTokensForNeed = (userRequest = "") => {
  const baseTokens = normalizeTextForSearch(userRequest);
  const needCategory = inferSimpleNeedCategory(userRequest);
  const expandedTokens = [
    ...baseTokens,
    ...(NEED_CATEGORY_SEARCH_TERMS[needCategory] || []),
  ];

  return [...new Set(expandedTokens.flatMap(normalizeTextForSearch))];
};

const productSearchText = (product = {}) => {
  return [
    product.id,
    product.name,
    product.category,
    product.aisle,
    product.budgetTier,
    product.speedTier,
    product.packSize,
    product.searchText,
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const getEffectiveNeedCategory = (userRequest = "", aiNeedCategory = "") => {
  const inferred = inferSimpleNeedCategory(userRequest);
  const aiCategory = safeString(aiNeedCategory);
  const genericCategories = new Set([
    "urgent_need",
    "general_need",
    "general_urgent_need",
    "quick_need",
    "shopping_need",
    "health_comfort",
  ]);

  if (!aiCategory || genericCategories.has(aiCategory)) {
    return inferred || "urgent_need";
  }

  if (inferred && inferred !== "urgent_need" && aiCategory === "urgent_need") {
    return inferred;
  }

  return aiCategory;
};

const buildShoppingIntentPrompt = ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
}) => `
You are a retrieval-intent generator for an InstaKart instant cart.
Convert the user's sentence into a product-need description for semantic search.

User sentence: ${userRequest}
Controls: budgetMode=${budgetMode}, decisionMode=${decisionMode}, panicMode=${panicMode}

Rules:
1. Write what product roles are needed, not a story.
2. Do NOT add unrelated emergency products just because panicMode is true.
3. Do NOT include delivery speed, price, or generic urgency words unless they describe a product need.
4. requiredProductRoles must be concrete jobs products should perform for this exact situation.
5. excludedProductTraits should describe what would be filler or not useful.
6. Return ONLY valid JSON.

JSON shape:
{
  "needCategory": "short_snake_case",
  "shoppingIntentText": "compact search text focused on product roles and use cases",
  "requiredProductRoles": ["role 1", "role 2"],
  "excludedProductTraits": ["trait 1"],
  "userFacingSummary": "short phrase"
}
`;

const normalizeShoppingIntentContext = (raw, userRequest = "") => {
  const inferredNeedCategory = inferSimpleNeedCategory(userRequest);
  const roles = Array.isArray(raw?.requiredProductRoles)
    ? raw.requiredProductRoles
        .map((role) => safeString(role))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const excluded = Array.isArray(raw?.excludedProductTraits)
    ? raw.excludedProductTraits
        .map((trait) => safeString(trait))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const shoppingIntentText = safeString(raw?.shoppingIntentText, userRequest)
    .replace(/urgent|emergency|panic|as soon as possible|fast delivery/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    needCategory: getEffectiveNeedCategory(
      userRequest,
      raw?.needCategory || inferredNeedCategory
    ),
    shoppingIntentText: shoppingIntentText || userRequest,
    requiredProductRoles: roles.length ? roles : [userRequest],
    excludedProductTraits: excluded,
    userFacingSummary: safeString(
      raw?.userFacingSummary,
      "Matched products to the situation."
    ),
  };
};

const extractShoppingIntent = async ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
}) => {
  try {
    const text = await callBedrockConverse({
      prompt: buildShoppingIntentPrompt({
        userRequest,
        budgetMode,
        decisionMode,
        panicMode,
      }),
      modelId: BEDROCK_PLANNER_MODEL_ID,
      maxTokens: 360,
      temperature: 0.05,
      topP: 0.5,
    });

    return normalizeShoppingIntentContext(
      parseJsonObjectFromText(text),
      userRequest
    );
  } catch (error) {
    console.warn("Shopping intent extraction skipped; using raw request:", {
      message: error.message,
    });

    return normalizeShoppingIntentContext(
      {
        needCategory: inferSimpleNeedCategory(userRequest),
        shoppingIntentText: userRequest,
        requiredProductRoles: [userRequest],
        excludedProductTraits: [],
      },
      userRequest
    );
  }
};

const buildRetrievalTextFromIntent = (userRequest, shoppingIntentContext) => {
  if (!shoppingIntentContext) return userRequest;

  return [
    shoppingIntentContext.shoppingIntentText,
    ...(shoppingIntentContext.requiredProductRoles || []),
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1600);
};

const getProductSemanticScore = (product = {}) => {
  const score = Number(product.__semanticScore || product.semanticScore || 0);
  return Number.isFinite(score) ? score : 0;
};

const getProductRetrievalScore = (product = {}) => {
  const score = Number(product.__retrievalScore || 0);
  return Number.isFinite(score) ? score : 0;
};

const etaScore = (product = {}) => {
  const eta = Number(product.etaMinutes || 999);
  if (!Number.isFinite(eta)) return 0;
  return clampNumber((30 - eta) / 30, 0, 1, 0);
};

const priceFitScore = (product = {}, budgetMode = "balanced") => {
  const price = Number(product.price || 0);
  if (!Number.isFinite(price) || price <= 0) return 0.5;

  const tags = (product.tags || []).map((tag) =>
    String(tag || "").toLowerCase()
  );

  if (budgetMode === "save") {
    const tagBoost = tags.some((tag) =>
      ["budget", "value", "mini", "basic", "save"].some((word) =>
        tag.includes(word)
      )
    )
      ? 0.12
      : 0;
    return clampNumber((260 - price) / 240 + tagBoost, 0, 1, 0.4);
  }

  if (budgetMode === "premium") {
    const tagBoost = tags.some((tag) =>
      ["premium", "complete", "gourmet", "family", "jumbo"].some((word) =>
        tag.includes(word)
      )
    )
      ? 0.14
      : 0;
    return clampNumber(price / 520 + tagBoost, 0.25, 1, 0.6);
  }

  const balancedFit = 1 - Math.abs(price - 160) / 280;
  const tagBoost = tags.some((tag) =>
    ["value", "combo", "pack"].some((word) => tag.includes(word))
  )
    ? 0.08
    : 0;
  return clampNumber(balancedFit + tagBoost, 0.25, 1, 0.5);
};

const lexicalRelevanceScore = (product = {}, userRequest = "") => {
  const tokens = normalizeTextForSearch(userRequest).filter(
    (token) => token.length >= 3
  );
  if (!tokens.length) return 0;

  const rawScore = lexicalScoreProduct(product, tokens);
  return clampNumber(rawScore / 35, 0, 1, 0);
};

const genericProductScore = ({
  product,
  userRequest,
  budgetMode = "balanced",
  reasonBoost = 0,
  verifierScore = null,
}) => {
  const semantic = clampNumber(getProductSemanticScore(product), 0, 1, 0);
  const retrieval = clampNumber(getProductRetrievalScore(product), 0, 1, 0);
  const lexical = lexicalRelevanceScore(product, userRequest);
  const eta = etaScore(product);
  const price = priceFitScore(product, budgetMode);
  const verifier =
    verifierScore == null ? null : clampNumber(verifierScore / 100, 0, 1, 0);

  if (verifier != null) {
    return Math.round(
      (verifier * 0.66 +
        semantic * 0.2 +
        lexical * 0.09 +
        eta * 0.03 +
        price * 0.02) *
        100 +
        reasonBoost
    );
  }

  return Math.round(
    (semantic * 0.6 +
      lexical * 0.28 +
      retrieval * 0.07 +
      eta * 0.03 +
      price * 0.02) *
      100 +
      reasonBoost
  );
};

const attachInternalProductScore = ({
  product,
  userRequest,
  budgetMode,
  verifierScore,
}) => ({
  ...product,
  __finalScore: genericProductScore({
    product,
    userRequest,
    budgetMode,
    verifierScore,
  }),
  __verificationScore: verifierScore == null ? undefined : verifierScore,
});

const buildVerifierPrompt = ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  needCategory,
  products,
  productReasons,
  shoppingIntentContext,
  userMemory,
}) => {
  const skippedProductsLine = userMemory?.skippedProducts?.length
    ? `
User has previously skipped these products: ${JSON.stringify(
        userMemory.skippedProducts
      )}. If a candidate product name closely matches any of these, reduce its score by 25 points and keep it only if it is clearly necessary.`
    : "";

  return `
You are the final quality gate for an InstaKart instant cart.
Your job is to remove weak, filler, indirectly related, or merely fast products.

User situation: ${userRequest}
Need category from planner: ${needCategory}
User controls: budgetMode=${budgetMode}, decisionMode=${decisionMode}, panicMode=${panicMode}
Retrieval intent: ${shoppingIntentContext?.shoppingIntentText || userRequest}
Required product roles: ${JSON.stringify(shoppingIntentContext?.requiredProductRoles || [])}
Excluded filler traits: ${JSON.stringify(shoppingIntentContext?.excludedProductTraits || [])}

Candidate products:
${JSON.stringify(
  products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    aisle: product.aisle,
    price: product.price,
    etaMinutes: product.etaMinutes,
    tags: product.tags,
    searchText: product.searchText,
    searchText: product.searchText,
    semanticScore: Number(getProductSemanticScore(product).toFixed(4)),
    plannerReason: productReasons?.[product.id] || "",
  }))
)}

Rules:
1. Keep a product only if an average customer would immediately use it for this exact situation.
2. The product must map clearly to at least one requiredProductRole. If it does not, score it below 35 and do not keep it.
3. Do not keep products only because they are cheap, fast, broadly useful, or vaguely related.
4. A smaller accurate cart is better than a larger cart with filler. It is okay to keep only 1 to 4 products.
5. Keep at most 7 products.
6. optionalProductIds are only for genuinely useful extras that were not kept.
7. Use only IDs from the candidate list. Do not invent IDs.
8. productScores must reflect direct usefulness only, not speed. 90-100 = essential, 70-89 = useful, 40-69 = weak, below 40 = remove.
9. productReasons must explain the actual job the product does. Never use generic reasons like "directly helps".

Return ONLY valid JSON:
{
  "keptProductIds": ["valid_product_id"],
  "optionalProductIds": ["valid_product_id"],
  "productScores": { "valid_product_id": 0 },
  "productReasons": { "valid_product_id": "short user-facing reason" },
  "summary": "one short sentence"
}
${skippedProductsLine}
`;
};

const parseVerifierResult = ({
  verifierJson,
  products,
  fallbackProducts,
  userRequest,
  rankingText,
  budgetMode,
}) => {
  const productById = new Map(products.map((product) => [product.id, product]));
  const validIds = new Set(productById.keys());

  const uniqueValidIds = (ids, max) =>
    Array.isArray(ids)
      ? ids
          .map((id) => String(id || "").trim())
          .filter((id) => validIds.has(id))
          .filter((id, index, arr) => arr.indexOf(id) === index)
          .slice(0, max)
      : [];

  const rawScores =
    verifierJson?.productScores &&
    typeof verifierJson.productScores === "object"
      ? verifierJson.productScores
      : {};

  const rawReasons =
    verifierJson?.productReasons &&
    typeof verifierJson.productReasons === "object"
      ? verifierJson.productReasons
      : {};

  let keptIds = uniqueValidIds(verifierJson?.keptProductIds, 7);
  const optionalIds = uniqueValidIds(
    verifierJson?.optionalProductIds,
    3
  ).filter((id) => !keptIds.includes(id));

  const scoreForId = (id) =>
    clampNumber(
      rawScores[id],
      0,
      100,
      genericProductScore({
        product: productById.get(id),
        userRequest: rankingText || userRequest,
        budgetMode,
      })
    );

  keptIds = keptIds.filter((id) => scoreForId(id) >= 72);

  if (keptIds.length < 1) {
    keptIds = fallbackProducts
      .filter(
        (product) =>
          Number(product.__finalScore || 0) >= 62 ||
          getProductSemanticScore(product) >= 0.38
      )
      .map((product) => product.id)
      .filter((id) => validIds.has(id))
      .slice(0, 4);
  }

  const productReasons = {};
  [...keptIds, ...optionalIds].forEach((id) => {
    productReasons[id] = safeString(
      rawReasons[id],
      "Useful for the situation described."
    );
  });

  return {
    keptIds,
    optionalIds: optionalIds.filter((id) => scoreForId(id) >= 76),
    productScores: Object.fromEntries(
      keptIds.map((id) => [id, scoreForId(id)])
    ),
    productReasons,
    summary: safeString(
      verifierJson?.summary,
      "Kept only products that directly help with the situation."
    ),
  };
};

const localGenericProductFilter = ({
  products,
  userRequest,
  budgetMode,
  limit = 7,
}) => {
  const scored = products
    .map((product) => ({
      product,
      score: genericProductScore({ product, userRequest, budgetMode }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        Number(a.product.etaMinutes || 999) -
        Number(b.product.etaMinutes || 999)
      );
    });

  const strong = scored
    .filter(
      (entry) =>
        entry.score >= 54 || getProductSemanticScore(entry.product) >= 0.4
    )
    .map((entry) => entry.product);

  const fallback = scored
    .filter(
      (entry) =>
        entry.score >= 45 || getProductSemanticScore(entry.product) >= 0.34
    )
    .slice(0, Math.min(4, scored.length))
    .map((entry) => entry.product);
  const selected = strong.length ? strong : fallback;

  return selected.slice(0, limit).map((product) =>
    attachInternalProductScore({
      product,
      userRequest,
      budgetMode,
      verifierScore: genericProductScore({ product, userRequest, budgetMode }),
    })
  );
};

const verifyAndRerankProducts = async ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  needCategory,
  products,
  productReasons,
  shoppingIntentContext,
  userMemory,
}) => {
  const dedupedProducts = [];
  const seen = new Set();

  products.forEach((product) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    dedupedProducts.push(product);
  });

  const rankingText = buildRetrievalTextFromIntent(
    userRequest,
    shoppingIntentContext
  );

  const fallbackProducts = localGenericProductFilter({
    products: dedupedProducts,
    userRequest: rankingText,
    budgetMode,
    limit: 7,
  });

  const highConfidenceProducts = fallbackProducts.filter(
    (product) =>
      product.available !== false &&
      getProductSemanticScore(product) >= 0.82 &&
      Number(product.__finalScore || 0) >= 72
  );

  if (
    highConfidenceProducts.length >= 3 &&
    highConfidenceProducts.length <= 6
  ) {
    console.log(
      "LLM product verifier skipped; using high-confidence semantic matches:",
      {
        count: highConfidenceProducts.length,
      }
    );

    return {
      products: highConfidenceProducts.slice(0, 6),
      optionalProducts: [],
      productReasons: {},
      summary: "Selected high-confidence semantic matches directly.",
      usedVerifier: false,
    };
  }

  if (dedupedProducts.length < 2) {
    return {
      products: fallbackProducts,
      optionalProducts: [],
      productReasons: {},
      summary: "Used the strongest available matches from the product catalog.",
      usedVerifier: false,
    };
  }

  try {
    const verifierText = await callBedrockConverse({
      prompt: buildVerifierPrompt({
        userRequest,
        budgetMode,
        decisionMode,
        panicMode,
        needCategory,
        products: dedupedProducts,
        productReasons,
        shoppingIntentContext,
        userMemory,
      }),
      modelId: BEDROCK_PLANNER_MODEL_ID,
      maxTokens: 520,
      temperature: 0.05,
      topP: 0.5,
    });

    const verifierJson = parseJsonObjectFromText(verifierText);
    const parsed = parseVerifierResult({
      verifierJson,
      products: dedupedProducts,
      fallbackProducts,
      userRequest,
      rankingText,
      budgetMode,
    });

    const productById = new Map(
      dedupedProducts.map((product) => [product.id, product])
    );
    const verifiedProducts = parsed.keptIds
      .map((id) => productById.get(id))
      .filter(Boolean)
      .map((product) =>
        attachInternalProductScore({
          product,
          userRequest: rankingText,
          budgetMode,
          verifierScore: parsed.productScores[product.id],
        })
      )
      .sort(
        (a, b) => Number(b.__finalScore || 0) - Number(a.__finalScore || 0)
      );

    const optionalProducts = parsed.optionalIds
      .map((id) => productById.get(id))
      .filter(Boolean)
      .map((product) =>
        attachInternalProductScore({
          product,
          userRequest: rankingText,
          budgetMode,
          verifierScore: 78,
        })
      );

    return {
      products: verifiedProducts.length ? verifiedProducts : fallbackProducts,
      optionalProducts,
      productReasons: parsed.productReasons,
      summary: parsed.summary,
      usedVerifier: true,
    };
  } catch (error) {
    console.warn(
      "LLM product verifier skipped; using generic semantic scoring:",
      {
        message: error.message,
      }
    );

    return {
      products: fallbackProducts,
      optionalProducts: [],
      productReasons: {},
      summary: "Used semantic ranking to keep the strongest direct matches.",
      usedVerifier: false,
    };
  }
};

const scoreForMode = ({ product, mode, budgetMode }) => {
  const base = clampNumber(Number(product.__finalScore || 0) / 100, 0, 1, 0);
  const eta = etaScore(product);
  const price = priceFitScore(product, budgetMode);

  if (mode === "fastest") return base * 0.48 + eta * 0.44 + price * 0.08;
  if (mode === "bestValue") return base * 0.46 + price * 0.4 + eta * 0.14;
  return base * 0.68 + price * 0.2 + eta * 0.12;
};

const sortProductsForMode = (products, mode, budgetMode) => {
  return [...products].sort((a, b) => {
    const diff =
      scoreForMode({ product: b, mode, budgetMode }) -
      scoreForMode({ product: a, mode, budgetMode });
    if (diff !== 0) return diff;

    if (mode === "bestValue") {
      const priceDiff = Number(a.price || 9999) - Number(b.price || 9999);
      if (priceDiff !== 0) return priceDiff;
    }

    if (mode === "mostComplete" && budgetMode === "premium") {
      const priceDiff = Number(b.price || 0) - Number(a.price || 0);
      if (priceDiff !== 0) return priceDiff;
    }

    return Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999);
  });
};

const MODE_ITEM_TARGETS = {
  save: { fastest: 3, bestValue: 4, mostComplete: 5 },
  balanced: { fastest: 4, bestValue: 5, mostComplete: 6 },
  premium: { fastest: 4, bestValue: 6, mostComplete: 7 },
};

const MODE_BUDGET_CAPS = {
  save: { fastest: 320, bestValue: 440, mostComplete: 560 },
  balanced: { fastest: 560, bestValue: 760, mostComplete: 980 },
  premium: { fastest: 950, bestValue: 1250, mostComplete: 1800 },
};

const getModeItemTarget = (mode, budgetMode, availableCount) => {
  const targets = MODE_ITEM_TARGETS[budgetMode] || MODE_ITEM_TARGETS.balanced;
  return Math.max(1, Math.min(targets[mode] || 5, availableCount));
};

const getModeBudgetCap = (mode, budgetMode) => {
  const caps = MODE_BUDGET_CAPS[budgetMode] || MODE_BUDGET_CAPS.balanced;
  return caps[mode] || caps.bestValue;
};

const mergeUniqueProducts = (...productGroups) => {
  const merged = [];
  const seen = new Set();

  productGroups.flat().forEach((product) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    merged.push(product);
  });

  return merged;
};

const ensureProductModeScore = ({ product, userRequest, budgetMode }) => {
  if (Number.isFinite(Number(product.__finalScore))) return product;

  return attachInternalProductScore({
    product,
    userRequest,
    budgetMode,
    verifierScore: genericProductScore({ product, userRequest, budgetMode }),
  });
};

const buildModeProductPool = ({
  verifiedProducts,
  optionalProducts = [],
  inventoryCandidates = [],
  userRequest,
  budgetMode,
  limit = 14,
}) => {
  const verifiedIds = new Set(verifiedProducts.map((product) => product.id));
  const scoredCandidates = inventoryCandidates
    .filter((product) => !verifiedIds.has(product.id))
    .map((product) =>
      ensureProductModeScore({ product, userRequest, budgetMode })
    )
    .filter(
      (product) =>
        Number(product.__finalScore || 0) >= 48 ||
        getProductSemanticScore(product) >= 0.34 ||
        Number(product.__lexicalScore || 0) >= 10
    )
    .sort((a, b) => Number(b.__finalScore || 0) - Number(a.__finalScore || 0))
    .slice(0, Math.max(0, limit - verifiedProducts.length));

  return mergeUniqueProducts(
    verifiedProducts.map((product) =>
      ensureProductModeScore({ product, userRequest, budgetMode })
    ),
    optionalProducts.map((product) =>
      ensureProductModeScore({ product, userRequest, budgetMode })
    ),
    scoredCandidates
  );
};

const selectProductsForMode = ({ products, mode, budgetMode, userRequest }) => {
  const sortedProducts = sortProductsForMode(
    products.map((product) =>
      ensureProductModeScore({ product, userRequest, budgetMode })
    ),
    mode,
    budgetMode
  );

  const targetCount = getModeItemTarget(
    mode,
    budgetMode,
    sortedProducts.length
  );
  const minCount = Math.min(mode === "fastest" ? 2 : 3, targetCount);
  const budgetCap = getModeBudgetCap(mode, budgetMode);
  const selected = [];
  let total = 0;

  sortedProducts.forEach((product) => {
    if (selected.length >= targetCount) return;

    const nextTotal = total + Number(product.price || 0);
    const canRespectCap =
      budgetMode === "premium" ||
      selected.length < minCount ||
      nextTotal <= budgetCap;

    if (!canRespectCap) return;

    selected.push(product);
    total = nextTotal;
  });

  if (selected.length < minCount) {
    sortedProducts.forEach((product) => {
      if (selected.length >= targetCount) return;
      if (selected.some((item) => item.id === product.id)) return;
      selected.push(product);
    });
  }

  return selected.slice(0, targetCount);
};

const rankInventoryByEmbeddings = async (
  retrievalText,
  inventory,
  limit = 28
) => {
  const productsWithEmbeddings = inventory.filter(
    (product) => Array.isArray(product.embedding) && product.embedding.length
  );

  if (!ENABLE_EMBEDDING_RANKING || productsWithEmbeddings.length < 8) {
    return null;
  }

  const requestEmbedding = await generateEmbedding(retrievalText);
  if (!requestEmbedding) return null;

  const scored = productsWithEmbeddings.map((product) => {
    const semanticScore = cosineSimilarity(requestEmbedding, product.embedding);
    const availabilityPenalty = product.available === false ? -1 : 0;

    return {
      product: {
        ...product,
        __semanticScore: semanticScore,
        __retrievalScore: semanticScore + availabilityPenalty,
      },
      score: semanticScore + availabilityPenalty,
    };
  });

  return scored
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        Number(a.product.etaMinutes || 999) -
        Number(b.product.etaMinutes || 999)
      );
    })
    .map((entry) => entry.product)
    .slice(0, limit);
};

const rankInventoryByLexicalFallback = (userRequest, inventory, limit = 28) => {
  const requestTokens = expandSearchTokensForNeed(userRequest);

  const scored = inventory.map((product) => {
    const score = lexicalScoreProduct(product, requestTokens);
    return {
      product: {
        ...product,
        __semanticScore: 0,
        __retrievalScore: score / 100,
        __lexicalScore: score,
      },
      score,
    };
  });

  const relevant = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        Number(a.product.etaMinutes || 999) -
        Number(b.product.etaMinutes || 999)
      );
    })
    .map((entry) => entry.product);

  const fastFallback = [...inventory]
    .sort((a, b) => Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999))
    .slice(0, 6)
    .map((product) => ({
      ...product,
      __semanticScore: 0,
      __retrievalScore: 0,
    }));

  const merged = [];
  const seen = new Set();

  [...relevant, ...fastFallback].forEach((product) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    merged.push(product);
  });

  return merged.slice(0, limit);
};

const getRelevantInventoryCandidates = async (
  userRequest,
  inventory,
  limit = 28,
  shoppingIntentContext = null
) => {
  const retrievalText = buildRetrievalTextFromIntent(
    userRequest,
    shoppingIntentContext
  );

  try {
    const embeddedCandidates = await rankInventoryByEmbeddings(
      retrievalText,
      inventory,
      limit
    );
    if (embeddedCandidates?.length) {
      console.log("Candidate ranking used Titan embeddings:", {
        candidateCount: embeddedCandidates.length,
        modelId: BEDROCK_EMBEDDING_MODEL_ID,
      });
      return embeddedCandidates;
    }
  } catch (error) {
    console.warn(
      "Embedding candidate ranking skipped; using lexical fallback:",
      {
        message: error.message,
        modelId: BEDROCK_EMBEDDING_MODEL_ID,
      }
    );
  }

  const fallbackCandidates = rankInventoryByLexicalFallback(
    retrievalText,
    inventory,
    limit
  );
  console.log("Candidate ranking used lexical fallback:", {
    candidateCount: fallbackCandidates.length,
  });
  return fallbackCandidates;
};

const inferDeadlineMinutes = (userRequest = "") => {
  const text = String(userRequest).toLowerCase();

  const minuteMatch = text.match(/(\d+)\s*(min|mins|minute|minutes)/);
  if (minuteMatch) return clampNumber(minuteMatch[1], 5, 1440, 60);

  const hourMatch = text.match(/(\d+)\s*(hr|hrs|hour|hours)/);
  if (hourMatch) return clampNumber(Number(hourMatch[1]) * 60, 15, 1440, 120);

  if (text.includes("tonight")) return 360;
  if (text.includes("tomorrow")) return 720;
  if (text.includes("soon") || text.includes("urgent") || text.includes("now"))
    return 45;

  return null;
};

const buildCartItemFromProduct = (product, reasonMap, fallbackReason) => ({
  productId: product.id,
  name: product.name,
  quantity: 1,
  price: Number(product.price || 0),
  etaMinutes: Number(product.etaMinutes || 0),
  reason:
    reasonMap?.[product.id] ||
    fallbackReason ||
    "Helps cover the user's urgent need.",
});

const buildCartModeFromProducts = ({
  modeLabel,
  cartTitle,
  products,
  modeReason,
  itemReason,
  reasonMap,
}) => {
  const items = products.map((product) =>
    buildCartItemFromProduct(product, reasonMap, itemReason)
  );

  return {
    modeLabel,
    etaMinutes: items.length
      ? Math.max(...items.map((item) => Number(item.etaMinutes || 0)))
      : 0,
    cartTitle,
    items,
    modeReason,
  };
};

const calculateCartTotal = (items = []) =>
  items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

const calculateCartItemCount = (items = []) =>
  items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

const getTagSet = (product = {}) =>
  new Set((product.tags || []).map((tag) => String(tag || "").toLowerCase()));

const buildSubstitutions = (selectedProducts = [], candidateProducts = []) => {
  const selectedIds = new Set(selectedProducts.map((product) => product.id));

  return selectedProducts
    .filter((product) => Number(product.etaMinutes || 0) >= 20)
    .map((product) => {
      const productTags = getTagSet(product);

      const substitute = candidateProducts
        .filter((candidate) => {
          if (!candidate?.id || candidate.id === product.id) return false;
          if (selectedIds.has(candidate.id)) return false;
          if (
            Number(candidate.etaMinutes || 999) >=
            Number(product.etaMinutes || 999)
          ) {
            return false;
          }

          const sameAisle =
            String(candidate.aisle || "").toLowerCase() ===
            String(product.aisle || "").toLowerCase();

          const candidateTags = getTagSet(candidate);
          const sharedTag = [...candidateTags].some((tag) =>
            productTags.has(tag)
          );

          return sameAisle || sharedTag;
        })
        .sort((a, b) => {
          const etaDiff =
            Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999);
          if (etaDiff !== 0) return etaDiff;
          return Number(a.price || 9999) - Number(b.price || 9999);
        })[0];

      if (!substitute) return null;

      const minutesSaved = Math.max(
        0,
        Number(product.etaMinutes || 0) - Number(substitute.etaMinutes || 0)
      );

      return {
        originalProductId: product.id,
        originalName: product.name,
        suggestedProductId: substitute.id,
        suggestedName: substitute.name,
        minutesSaved,
        reason: `${substitute.name} arrives about ${minutesSaved} minutes faster than ${product.name}.`,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
};

const productCoversDimension = (product = {}, dimension = "") => {
  const dimensionTokens = normalizeTextForSearch(dimension).filter(
    (token) => token.length >= 3
  );
  if (!dimensionTokens.length) return false;

  const productText = [
    product.name,
    product.category,
    product.aisle,
    product.searchText,
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return dimensionTokens.some((token) => productText.includes(token));
};

const buildNeedGraph = ({ needCategory, selectedProducts, userRequest }) => {
  const text = String(userRequest || "").toLowerCase();

  const categoryDimensions = {
    birthday_surprise: ["celebration", "sweet dessert", "gift", "decoration"],
    travel_packing: ["hygiene", "packing", "hydration", "snack comfort"],
    interview_ready: [
      "grooming",
      "freshness",
      "presentation",
      "work readiness",
    ],
    pet_cleanup: ["surface cleanup", "odor control", "hygiene", "disposal"],
    power_cut_prep: [
      "lighting",
      "battery power",
      "hydration",
      "comfort safety",
    ],
    guest_hosting: ["snacks", "beverages", "serving", "cleanup"],
    breakfast_rush: ["food", "beverage", "fruit healthy", "quick prep"],
    quick_cleanup: ["absorb", "wipe", "disinfect", "dispose"],
    first_aid: ["wound care", "cleaning", "protection", "hygiene"],
    health_comfort: ["symptom relief", "hydration", "hygiene", "comfort"],
  };

  const dimensions = categoryDimensions[needCategory] || [
    "core need",
    "speed",
    "supporting items",
  ];

  return {
    primaryNeed: formatNeedCategory(needCategory),
    inferredFrom: text.slice(0, 140),
    dimensions: dimensions.map((dimension) => {
      const coveringProduct = selectedProducts.find((product) =>
        productCoversDimension(product, dimension)
      );

      return {
        name: dimension,
        covered: Boolean(coveringProduct),
        reason: coveringProduct
          ? `Covered by ${coveringProduct.name}.`
          : `No selected product directly covers ${dimension}.`,
      };
    }),
  };
};

const buildDeadlineSafety = ({
  userRequest,
  selectedEtaMinutes,
  panicMode,
}) => {
  const deadlineMinutes = inferDeadlineMinutes(userRequest);

  if (!deadlineMinutes) {
    return {
      hasDeadline: Boolean(panicMode),
      deadlineMinutes: null,
      selectedEtaMinutes,
      status: panicMode
        ? "urgent_but_no_exact_deadline"
        : "no_explicit_deadline",
      message: panicMode
        ? "Urgent request detected; the cart prioritizes faster items."
        : "No exact deadline detected; the cart balances relevance and speed.",
    };
  }

  const bufferMinutes = deadlineMinutes - selectedEtaMinutes;

  return {
    hasDeadline: true,
    deadlineMinutes,
    selectedEtaMinutes,
    bufferMinutes,
    status:
      bufferMinutes >= 10 ? "safe" : bufferMinutes >= 0 ? "tight" : "risk",
    message:
      bufferMinutes >= 10
        ? `Estimated delivery leaves about ${bufferMinutes} minutes of buffer.`
        : bufferMinutes >= 0
          ? `Estimated delivery fits, but the buffer is tight at about ${bufferMinutes} minutes.`
          : `Estimated delivery may miss the stated deadline by about ${Math.abs(bufferMinutes)} minutes.`,
  };
};

const buildCoverage = ({
  selectedProducts,
  needGraph,
  selectedEtaMinutes,
  userRequest,
}) => {
  const dimensions = needGraph.dimensions || [];
  const coveredCount = dimensions.filter(
    (dimension) => dimension.covered
  ).length;
  const dimensionScore = dimensions.length
    ? Math.round((coveredCount / dimensions.length) * 60)
    : 40;

  const itemScore = Math.min(25, selectedProducts.length * 4);
  const deadlineMinutes = inferDeadlineMinutes(userRequest);
  const etaScore = deadlineMinutes
    ? selectedEtaMinutes <= deadlineMinutes
      ? 15
      : 5
    : selectedEtaMinutes <= 25
      ? 15
      : 10;

  const score = clampNumber(dimensionScore + itemScore + etaScore, 0, 100, 80);

  return {
    score,
    coveredDimensions: coveredCount,
    totalDimensions: dimensions.length,
    summary:
      score >= 85
        ? "Strong coverage for the stated situation."
        : score >= 70
          ? "Good coverage with a few possible supporting gaps."
          : "Partial coverage; user may need to add more items manually.",
  };
};

const sanitizeWhileYouWait = (rawTips) => {
  const source = Array.isArray(rawTips) ? rawTips : [];

  return source
    .map((tip) => {
      if (typeof tip === "string") {
        const text = safeString(tip).slice(0, 170);
        if (!text) return null;

        return {
          title: "Quick tip",
          text,
          tone: "practical",
        };
      }

      if (!tip || typeof tip !== "object") return null;

      const title = safeString(tip.title, "Quick tip").slice(0, 42);
      const text = safeString(tip.text || tip.content || tip.message).slice(
        0,
        170
      );
      const tone = safeString(tip.tone, "practical").slice(0, 24);

      if (!text || text.length < 8) return null;

      return {
        title,
        text,
        tone,
      };
    })
    .filter(Boolean)
    .slice(0, 4);
};

const generateDynamicWhileYouWaitTips = async ({
  userRequest,
  needCategory,
  urgencyLabel,
  peopleCount,
  cartModes,
  rawTips,
}) => {
  const plannerTips = sanitizeWhileYouWait(rawTips);
  if (plannerTips.length >= 2) return plannerTips;

  const selectedItems = [
    ...(cartModes?.fastest?.items || []),
    ...(cartModes?.bestValue?.items || []),
    ...(cartModes?.mostComplete?.items || []),
  ]
    .slice(0, 12)
    .map((item) => item.name)
    .filter(Boolean);

  const prompt = `
You are writing the "while this gets ready" micro-advice section for InstaKart.

Generate 3 short tips for this exact customer situation. The tips must be dynamic and specific to the user's input, not generic emergency text.

User request: ${userRequest}
Need category: ${needCategory || "unknown"}
Urgency: ${urgencyLabel || "unknown"}
People count: ${peopleCount || 1}
Cart items being prepared: ${JSON.stringify(selectedItems)}

Style rules:
- Keep each tip short, useful, and friendly.
- If the need is medical, first-aid, baby-care, health, injury, fever, rash, bleeding, burn, or pain: give safe general care guidance, avoid diagnosis, and mention seeking medical help for severe/worsening symptoms.
- If the need is party, hosting, food, travel, office, rain, festival, pet cleanup, study, interview, or casual: tips can be practical, warm, lightly quirky, or fun.
- Do not mention unavailable products.
- Do not say "consult a doctor" for non-medical situations.
- Return ONLY valid JSON.

JSON shape:
{
  "whileYouWait": [
    {
      "title": "2 to 5 words",
      "text": "one short contextual tip",
      "tone": "medical | practical | fun | calm"
    }
  ]
}
`;

  try {
    const text = await callBedrockConverse({
      prompt,
      modelId: BEDROCK_FAST_MODEL_ID,
      maxTokens: 360,
      temperature: 0.55,
      topP: 0.8,
    });

    const parsed = parseJsonObjectFromText(text);
    const generatedTips = sanitizeWhileYouWait(
      parsed.whileYouWait || parsed.tips
    );

    return generatedTips.length ? generatedTips : plannerTips;
  } catch (error) {
    console.warn("Dynamic while-you-wait generation skipped:", {
      message: error.message,
    });

    return plannerTips;
  }
};

const sanitizeAiSelection = (
  aiSelection,
  inventoryCandidates,
  requestContext
) => {
  const validIds = new Set(inventoryCandidates.map((product) => product.id));

  const pickIds = (ids, max) =>
    Array.isArray(ids)
      ? ids
          .map((id) => String(id || "").trim())
          .filter((id) => validIds.has(id))
          .filter((id, index, arr) => arr.indexOf(id) === index)
          .slice(0, max)
      : [];

  const productReasons =
    aiSelection?.productReasons &&
    typeof aiSelection.productReasons === "object"
      ? Object.fromEntries(
          Object.entries(aiSelection.productReasons)
            .filter(([productId]) => validIds.has(productId))
            .map(([productId, reason]) => [
              productId,
              safeString(reason, "Helps with the current urgent need."),
            ])
        )
      : {};

  return {
    needCategory:
      safeString(aiSelection?.needCategory) ||
      inferSimpleNeedCategory(requestContext.userRequest),
    urgencyLabel:
      safeString(aiSelection?.urgencyLabel) ||
      (requestContext.panicMode ? "Critical" : "High"),
    urgencyScore: normalizePercent(
      aiSelection?.urgencyScore,
      requestContext.panicMode ? 90 : 75
    ),
    urgencyReason:
      safeString(aiSelection?.urgencyReason) ||
      "Urgency inferred from the user request and delivery context.",
    peopleCount: clampNumber(aiSelection?.peopleCount, 1, 20, 1),
    recommendedMode: validDecisionMode(
      aiSelection?.recommendedMode || requestContext.decisionMode
    ),
    recommendedProductIds: pickIds(aiSelection?.recommendedProductIds, 10),
    regretProductIds: pickIds(aiSelection?.regretProductIds, 4),
    productReasons,
    whileYouWait: sanitizeWhileYouWait(aiSelection?.whileYouWait),
    aiExplanation:
      safeString(aiSelection?.aiExplanation) ||
      "AI selected the best-fit products from live inventory candidates.",
    confidence: {
      overall: normalizePercent(aiSelection?.confidence?.overall, 84),
      needMatch: normalizePercent(aiSelection?.confidence?.needMatch, 84),
      availabilityFit: normalizePercent(
        aiSelection?.confidence?.availabilityFit,
        88
      ),
      budgetFit: normalizePercent(aiSelection?.confidence?.budgetFit, 80),
      completeness: normalizePercent(aiSelection?.confidence?.completeness, 82),
      reason:
        safeString(aiSelection?.confidence?.reason) ||
        "Confidence is based on AI selection, inventory match, delivery speed, and completeness.",
    },
  };
};

const buildFullPlanFromAiSelection = async ({
  aiSelection,
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  userId,
  inventoryCandidates,
  shoppingIntentContext,
  userMemory,
  modelId,
  usedFallback,
  startedAt,
}) => {
  const requestContext = { userRequest, budgetMode, decisionMode, panicMode };
  const sanitized = sanitizeAiSelection(
    aiSelection,
    inventoryCandidates,
    requestContext
  );
  sanitized.needCategory = getEffectiveNeedCategory(
    userRequest,
    sanitized.needCategory
  );

  const productById = new Map(
    inventoryCandidates.map((product) => [product.id, product])
  );
  const selectedProducts = [];
  const seen = new Set();

  sanitized.recommendedProductIds.forEach((productId) => {
    const product = productById.get(productId);
    if (!product || seen.has(product.id)) return;
    seen.add(product.id);
    selectedProducts.push(product);
  });

  inventoryCandidates.forEach((product) => {
    if (selectedProducts.length >= 24) return;
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    selectedProducts.push(product);
  });

  const verification = await verifyAndRerankProducts({
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
    needCategory: sanitized.needCategory,
    products: selectedProducts,
    productReasons: sanitized.productReasons,
    shoppingIntentContext,
    userMemory,
  });

  const verifiedProducts = verification.products.length
    ? verification.products
    : localGenericProductFilter({
        products: selectedProducts,
        userRequest,
        budgetMode,
        limit: 7,
      });

  const reasonMap = {
    ...sanitized.productReasons,
    ...verification.productReasons,
  };

  const modeProductPool = buildModeProductPool({
    verifiedProducts,
    optionalProducts: verification.optionalProducts,
    inventoryCandidates,
    userRequest: buildRetrievalTextFromIntent(
      userRequest,
      shoppingIntentContext
    ),
    budgetMode,
    limit: 16,
  });

  const fastestProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "fastest",
    budgetMode,
    userRequest,
  });

  const bestValueProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "bestValue",
    budgetMode,
    userRequest,
  });

  const mostCompleteProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "mostComplete",
    budgetMode,
    userRequest,
  });

  const categoryTitle = formatNeedCategory(sanitized.needCategory);

  const cartModes = {
    fastest: buildCartModeFromProducts({
      modeLabel: "Fastest",
      cartTitle: `${categoryTitle} Fast Kit`,
      products: fastestProducts,
      modeReason:
        "Fastest direct matches after semantic retrieval and quality verification.",
      itemReason: "Directly helps with the situation and can arrive quickly.",
      reasonMap,
    }),
    bestValue: buildCartModeFromProducts({
      modeLabel: "Best Value",
      cartTitle: `${categoryTitle} Value Kit`,
      products: bestValueProducts,
      modeReason: "Best price-speed balance from the verified product set.",
      itemReason:
        "Directly helps with the situation while keeping value in mind.",
      reasonMap,
    }),
    mostComplete: buildCartModeFromProducts({
      modeLabel: "Most Complete",
      cartTitle: `${categoryTitle} Complete Kit`,
      products: mostCompleteProducts,
      modeReason:
        "Broadest coverage from products verified as directly useful.",
      itemReason: "Adds useful coverage for the situation described.",
      reasonMap,
    }),
  };

  const selectedMode = validDecisionMode(
    sanitized.recommendedMode || decisionMode
  );
  const selectedCart = cartModes[selectedMode] || cartModes.mostComplete;
  const selectedItems = selectedCart.items || [];

  const cartProductIds = new Set([
    ...cartModes.fastest.items.map((item) => item.productId),
    ...cartModes.bestValue.items.map((item) => item.productId),
    ...cartModes.mostComplete.items.map((item) => item.productId),
  ]);

  const regretPrevention = verification.optionalProducts
    .filter((product) => !cartProductIds.has(product.id))
    .slice(0, 3)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      price: Number(product.price || 0),
      etaMinutes: Number(product.etaMinutes || 0),
      reason:
        reasonMap?.[product.id] ||
        "A genuinely useful optional item for this situation.",
    }));

  const needGraph = buildNeedGraph({
    needCategory: sanitized.needCategory,
    selectedProducts: mostCompleteProducts,
    userRequest,
  });

  const deadlineSafety = buildDeadlineSafety({
    userRequest,
    selectedEtaMinutes: selectedCart.etaMinutes || 0,
    panicMode,
  });

  const coverage = buildCoverage({
    selectedProducts: mostCompleteProducts,
    needGraph,
    selectedEtaMinutes: selectedCart.etaMinutes || 0,
    userRequest,
  });

  const verifierNote = verification.usedVerifier
    ? " Verified for direct usefulness."
    : "";
  const dynamicWhileYouWait = await generateDynamicWhileYouWaitTips({
    userRequest,
    needCategory: sanitized.needCategory,
    urgencyLabel: sanitized.urgencyLabel,
    peopleCount: sanitized.peopleCount,
    cartModes,
    rawTips: sanitized.whileYouWait,
  });

  return {
    planId: `plan_${randomUUID()}`,
    userRequest,
    needCategory: sanitized.needCategory,
    urgencyLabel: sanitized.urgencyLabel,
    urgencyScore: sanitized.urgencyScore,
    urgencyReason: sanitized.urgencyReason,
    peopleCount: sanitized.peopleCount,
    timeContext: {
      timeOfDay: getTimeContext().timeOfDay,
      reason:
        "Used for urgency and delivery-context interpretation; explicit user request remains the strongest signal.",
    },
    budgetMode,
    panicMode,
    recommendedMode: selectedMode,
    cartModes,
    regretPrevention,
    substitutions: buildSubstitutions(
      mostCompleteProducts,
      inventoryCandidates
    ),
    needGraph,
    deadlineSafety,
    coverage,
    whileYouWait: dynamicWhileYouWait,
    confidence: {
      ...sanitized.confidence,
      overall: Math.max(
        sanitized.confidence.overall,
        verifiedProducts.length >= 3 ? 84 : 76
      ),
      reason: `${sanitized.confidence.reason}${verifierNote}`,
    },
    aiExplanation: verification.summary || sanitized.aiExplanation,
    checkoutSummary: {
      estimatedTotal: calculateCartTotal(selectedItems),
      itemCount: calculateCartItemCount(selectedItems),
      etaMinutes: selectedCart.etaMinutes || 0,
      oneTapMessage: `Review the ${categoryTitle.toLowerCase()} cart and add it instantly.`,
    },
    metrics: {
      estimatedTimeToCartSeconds: Math.max(
        2,
        Math.ceil((Date.now() - startedAt) / 1000)
      ),
      decisionsReducedFrom: Math.max(20, inventoryCandidates.length + 8),
      decisionsReducedTo: 3,
      forgottenEssentialsPrevented: Math.max(
        1,
        regretPrevention.length || coverage.coveredDimensions || 1
      ),
    },
    userId,
    generatedAt: new Date().toISOString(),
    modelId,
    usedFallback,
  };
};

const buildPlannerPrompt = ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  timeContext,
  inventoryCandidates,
  userMemory,
  refinementContext,
  shoppingIntentContext,
}) => `
You are InstaKart Assist, an AI product-selection planner for urgent quick-commerce.

Select the best products for the user's real-life need using ONLY the inventory candidates.
Return ONLY valid JSON. No markdown. No commentary.

User request: ${userRequest}
User controls: budgetMode=${budgetMode}, decisionMode=${decisionMode}, panicMode=${panicMode}
${
  refinementContext
    ? `Refinement context: ${JSON.stringify(refinementContext)}
Keep the original goal, but apply this refinement. If the user changes people count, budget, exclusions, adds another need, or asks to remove expensive items, update the selected product IDs and peopleCount accordingly.`
    : ""
}
Time context: ${timeContext.timeOfDay}
User memory summary: ${JSON.stringify(userMemory)}
Shopping intent: ${shoppingIntentContext?.shoppingIntentText || userRequest}
Required product roles: ${JSON.stringify(shoppingIntentContext?.requiredProductRoles || [])}
Do not select products that do not clearly satisfy one of these roles.

Inventory candidates:
${JSON.stringify(
  inventoryCandidates.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    aisle: product.aisle,
    price: product.price,
    etaMinutes: product.etaMinutes,
    tags: product.tags,
    searchText: product.searchText,
  }))
)}

Rules:
1. Use only product IDs from inventory candidates.
2. Do not invent products or product IDs.
3. Select 3 to 8 recommendedProductIds, ranked by direct usefulness for the situation.
4. Do not add filler products just to make the cart larger. A smaller accurate cart is better.
5. Respect budgetMode: save = lean/value/basic products, balanced = practical mix, premium = richer/complete/premium alternatives when useful.
6. Respect decisionMode: fastest = quickest sufficient kit, bestValue = lowest useful total, mostComplete = widest relevant coverage.
7. Select 0 to 3 regretProductIds only if they are strongly relevant and not already recommended.
8. productReasons must contain short situation-specific reasons for every recommendedProductId and regretProductId.
9. needCategory must be specific, such as birthday_surprise, travel_packing, interview_ready, pet_cleanup, power_cut_prep, guest_hosting, breakfast_rush, study_session, health_comfort, quick_cleanup, first_aid.
10. recommendedMode should respect decisionMode unless another mode is clearly better.
11. Keep all text short. No generic reasons like "selected by AI".
12. whileYouWait must contain 2 to 4 short contextual tips for the exact user request.
    - For medical/first-aid/baby/health needs, give safe first-aid style guidance and tell the user to seek medical help for severe symptoms.
    - For social, party, festival, food, travel, work, or casual needs, the tips can be practical, warm, and lightly quirky.
    - Do not repeat the same generic emergency advice for every situation.

JSON shape:
{
  "needCategory": "short_snake_case",
  "urgencyLabel": "Low | Medium | High | Critical",
  "urgencyScore": 0,
  "urgencyReason": "short reason",
  "peopleCount": 1,
  "recommendedMode": "fastest | bestValue | mostComplete",
  "recommendedProductIds": ["valid_product_id"],
  "regretProductIds": ["valid_product_id"],
  "productReasons": {
    "valid_product_id": "short product-specific reason"
  },
  "aiExplanation": "one short sentence explaining the cart strategy",
  "whileYouWait": [
    {
      "title": "short label",
      "text": "short situation-specific tip",
      "tone": "medical | practical | fun | calm"
    }
  ],
  "confidence": {
    "overall": 0,
    "needMatch": 0,
    "availabilityFit": 0,
    "budgetFit": 0,
    "completeness": 0,
    "reason": "short reason"
  }
}
`;

const generatePlanWithBedrock = async ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  userId,
  inventory,
  refinementContext,
}) => {
  const startedAt = Date.now();
  const timeContext = getTimeContext();

  const [shoppingIntentContext, userMemory] = await Promise.all([
    extractShoppingIntent({
      userRequest,
      budgetMode,
      decisionMode,
      panicMode,
    }),
    getUserMemory(userId).catch((error) => {
      console.warn("User memory skipped:", { message: error.message });
      return {
        previousNeedCategories: [],
        likedProducts: [],
        skippedProducts: [],
      };
    }),
  ]);

  const inventoryCandidates = await getRelevantInventoryCandidates(
    userRequest,
    inventory,
    36,
    shoppingIntentContext
  );

  console.log("Inventory candidate retrieval:", {
    userRequest,
    totalInventory: inventory.length,
    candidateCount: inventoryCandidates.length,
    candidateIds: inventoryCandidates.map((item) => item.id),
  });

  const prompt = buildPlannerPrompt({
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
    timeContext,
    inventoryCandidates,
    userMemory,
    refinementContext,
    shoppingIntentContext,
  });

  const plannerResult = await callPlannerWithFallback({
    prompt,
    maxTokens: 650,
    temperature: 0.12,
    topP: 0.65,
  });

  const aiSelection = parseJsonObjectFromText(plannerResult.text);

  return await buildFullPlanFromAiSelection({
    aiSelection,
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
    userId,
    inventoryCandidates,
    shoppingIntentContext,
    userMemory,
    modelId: plannerResult.modelId,
    usedFallback: plannerResult.usedFallback,
    startedAt,
  });
};

const inferFallbackNeedMetadata = (userRequest, panicMode) => {
  const needCategory = inferSimpleNeedCategory(userRequest);
  const fallbackKeywords = expandSearchTokensForNeed(userRequest);

  return {
    needCategory,
    cartTitle: `${formatNeedCategory(needCategory)} Kit`,
    urgencyReason: panicMode
      ? "User described a time-sensitive situation."
      : "User requested a useful quick-commerce plan.",
    aiExplanation:
      "Selected the strongest direct matches from live inventory using semantic and lexical ranking.",
    keywords: fallbackKeywords.length
      ? fallbackKeywords
      : normalizeTextForSearch(userRequest),
  };
};

const scoreProductForKeywords = (product, keywords) => {
  const searchableText = [
    product.name,
    product.category,
    product.aisle,
    product.searchText,
    ...(product.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  keywords.forEach((keyword) => {
    const normalizedKeyword = String(keyword || "").toLowerCase();
    if (!normalizedKeyword) return;
    if (searchableText.includes(normalizedKeyword)) score += 6;
    if (
      String(product.name || "")
        .toLowerCase()
        .includes(normalizedKeyword)
    )
      score += 10;
  });

  const eta = Number(product.etaMinutes || 999);
  return (
    score + Math.max(0, 25 - eta) / 5 + getProductSemanticScore(product) * 30
  );
};

const toFallbackCartItem = (product, reason) => ({
  productId: product.id,
  name: product.name,
  quantity: 1,
  price: Number(product.price || 0),
  etaMinutes: Number(product.etaMinutes || 0),
  reason,
});

const buildDeterministicFallbackPlan = async ({
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  userId,
  inventory,
}) => {
  const startedAt = Date.now();
  const metadata = inferFallbackNeedMetadata(userRequest, panicMode);

  const semanticCandidates = await getRelevantInventoryCandidates(
    userRequest,
    inventory,
    28
  );
  const scoredProducts = semanticCandidates
    .map((product) => ({
      product,
      score: Math.max(
        scoreProductForKeywords(product, metadata.keywords),
        genericProductScore({ product, userRequest, budgetMode })
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        Number(a.product.etaMinutes || 999) -
        Number(b.product.etaMinutes || 999)
      );
    })
    .map((entry) => entry.product);

  const verifiedProducts = localGenericProductFilter({
    products: scoredProducts.length ? scoredProducts : semanticCandidates,
    userRequest,
    budgetMode,
    limit: 7,
  });

  if (verifiedProducts.length < 2) return null;

  const modeProductPool = buildModeProductPool({
    verifiedProducts,
    optionalProducts: [],
    inventoryCandidates: semanticCandidates,
    userRequest,
    budgetMode,
    limit: 16,
  });

  const fastestProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "fastest",
    budgetMode,
    userRequest,
  });
  const bestValueProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "bestValue",
    budgetMode,
    userRequest,
  });
  const mostCompleteProducts = selectProductsForMode({
    products: modeProductPool,
    mode: "mostComplete",
    budgetMode,
    userRequest,
  });

  const categoryTitle = formatNeedCategory(metadata.needCategory);

  const cartModes = {
    fastest: {
      modeLabel: "Fastest",
      etaMinutes: Math.max(
        ...fastestProducts.map((item) => Number(item.etaMinutes || 0))
      ),
      cartTitle: `${categoryTitle} Fast Kit`,
      items: fastestProducts.map((product) =>
        toFallbackCartItem(
          product,
          `Fast useful item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Fastest direct matches available from live inventory.",
    },
    bestValue: {
      modeLabel: "Best Value",
      etaMinutes: Math.max(
        ...bestValueProducts.map((item) => Number(item.etaMinutes || 0))
      ),
      cartTitle: `${categoryTitle} Value Kit`,
      items: bestValueProducts.map((product) =>
        toFallbackCartItem(
          product,
          `Value-focused useful item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Lower-cost direct matches available from live inventory.",
    },
    mostComplete: {
      modeLabel: "Most Complete",
      etaMinutes: Math.max(
        ...mostCompleteProducts.map((item) => Number(item.etaMinutes || 0))
      ),
      cartTitle: `${categoryTitle} Complete Kit`,
      items: mostCompleteProducts.map((product) =>
        toFallbackCartItem(
          product,
          `Coverage item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Broadest direct coverage available from live inventory.",
    },
  };

  const selectedMode = validDecisionMode(decisionMode || "mostComplete");
  const selectedCart = cartModes[selectedMode] || cartModes.mostComplete;
  const needGraph = buildNeedGraph({
    needCategory: metadata.needCategory,
    selectedProducts: mostCompleteProducts,
    userRequest,
  });
  const deadlineSafety = buildDeadlineSafety({
    userRequest,
    selectedEtaMinutes: selectedCart.etaMinutes,
    panicMode,
  });
  const coverage = buildCoverage({
    selectedProducts: mostCompleteProducts,
    needGraph,
    selectedEtaMinutes: selectedCart.etaMinutes,
    userRequest,
  });
  const dynamicWhileYouWait = await generateDynamicWhileYouWaitTips({
    userRequest,
    needCategory: metadata.needCategory,
    urgencyLabel: panicMode ? "Critical" : "High",
    peopleCount: 1,
    cartModes,
    rawTips: [],
  });

  return {
    planId: `plan_fallback_${randomUUID()}`,
    userRequest,
    needCategory: metadata.needCategory,
    urgencyLabel: panicMode ? "Critical" : "High",
    urgencyScore: panicMode ? 92 : 78,
    urgencyReason: `${metadata.urgencyReason} Generated with resilient fallback because the AI planner was unavailable or exceeded the response budget.`,
    peopleCount: 1,
    timeContext: {
      timeOfDay: getTimeContext().timeOfDay,
      reason: "Fallback used explicit request and current time context.",
    },
    budgetMode,
    panicMode,
    recommendedMode: selectedMode,
    cartModes,
    regretPrevention: [],
    substitutions: buildSubstitutions(mostCompleteProducts, semanticCandidates),
    needGraph,
    deadlineSafety,
    coverage,
    whileYouWait: dynamicWhileYouWait,
    confidence: {
      overall: 78,
      needMatch: 80,
      availabilityFit: 86,
      budgetFit: budgetMode === "premium" ? 78 : 82,
      completeness: coverage.score,
      reason:
        "Fallback confidence is based on semantic relevance, speed, and coverage.",
    },
    aiExplanation: metadata.aiExplanation,
    checkoutSummary: {
      estimatedTotal: calculateCartTotal(selectedCart.items),
      itemCount: calculateCartItemCount(selectedCart.items),
      etaMinutes: selectedCart.etaMinutes,
      oneTapMessage: `Review the ${categoryTitle.toLowerCase()} cart and add it instantly.`,
    },
    metrics: {
      estimatedTimeToCartSeconds: Math.max(
        2,
        Math.ceil((Date.now() - startedAt) / 1000)
      ),
      decisionsReducedFrom: Math.max(20, inventory.length),
      decisionsReducedTo: 3,
      forgottenEssentialsPrevented: Math.max(
        1,
        coverage.coveredDimensions || 1
      ),
    },
    userId,
    generatedAt: new Date().toISOString(),
    modelId: "semantic-fallback",
    usedFallback: true,
  };
};

module.exports.health = async () =>
  jsonResponse(200, {
    success: true,
    message: "HackOn 6.0 backend is healthy",
    service: "hackon6-api",
    timestamp: new Date().toISOString(),
  });

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
      new PutCommand({ TableName: ITEMS_TABLE, Item: item })
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
      new ScanCommand({ TableName: ITEMS_TABLE })
    );
    const items = result.Items || [];
    items.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

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

    const answer = await callBedrockConverse({
      prompt: `You are an expert AWS solutions architect helping a hackathon team. Answer clearly, practically, and concisely.\n\nQuestion: ${question}`,
      modelId: BEDROCK_FAST_MODEL_ID,
      maxTokens: 500,
      temperature: 0.4,
      topP: 0.9,
    });

    return jsonResponse(200, {
      success: true,
      question,
      answer: answer || "No answer generated.",
      modelId: BEDROCK_FAST_MODEL_ID,
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

module.exports.seedNowInventory = async () =>
  jsonResponse(200, {
    success: true,
    message:
      "Product catalog is managed in DynamoDB. Use backend/scripts/seed-products.js for controlled catalog seeding.",
  });

const handleGenerateNowPlan = async (event, { allowGuest = false } = {}) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser && !allowGuest) return unauthorizedResponse();

    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const userRequest = body.userRequest?.trim();
    const userId = authUser?.userId || null;
    const budgetMode = validBudgetMode(body.budgetMode || "balanced");
    const decisionMode = validDecisionMode(body.decisionMode || "fastest");
    const panicMode = Boolean(body.panicMode);
    const refinementContext =
      body.refinementContext && typeof body.refinementContext === "object"
        ? body.refinementContext
        : null;

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

    const inventory = (
      await getInventory({ forceRefresh: true })
    ).filter(isProductPurchasable);

    let plan;

    try {
      plan = await withTimeout(
        generatePlanWithBedrock({
          userRequest,
          budgetMode,
          decisionMode,
          panicMode,
          userId,
          inventory,
          refinementContext,
        }),
        PLANNER_TIMEOUT_MS,
        "AI_PLANNER_TIMEOUT"
      );
    } catch (plannerError) {
      console.error(
        "Planner failed or timed out, using deterministic fallback:",
        {
          message: plannerError.message,
        }
      );

      const fallbackPlan = await buildDeterministicFallbackPlan({
        userRequest,
        budgetMode,
        decisionMode,
        panicMode,
        userId,
        inventory,
      });

      if (!fallbackPlan) throw plannerError;
      plan = fallbackPlan;
    }

    if (userId) {
      await docClient.send(
        new PutCommand({
          TableName: ITEMS_TABLE,
          Item: {
            id: plan.planId,
            entityType: "SHOPPING_PLAN",
            userId,
            userRequest,
            plan,
            modelId: plan.modelId,
            usedFallback: plan.usedFallback,
            createdAt: new Date().toISOString(),
          },
        })
      );
    }

    return jsonResponse(200, { success: true, plan });
  } catch (error) {
    console.error("generateNowPlan error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to generate InstaKart plan",
      error: error.message,
    });
  }
};

module.exports.generateNowPlan = (event) => handleGenerateNowPlan(event);
module.exports.generateGuestNowPlan = (event) =>
  handleGenerateNowPlan(event, { allowGuest: true });

module.exports.checkoutNowOrder = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, {
        success: false,
        message: "Invalid JSON body",
      });
    }

    const userId = authUser.userId;
    const plan = body.plan;
    const selectedMode = validDecisionMode(
      body.selectedMode || plan?.recommendedMode || "fastest"
    );

    if (!plan) {
      return jsonResponse(400, { success: false, message: "plan is required" });
    }

    const checkoutItems = plan.cartModes?.[selectedMode]?.items || [];
    if (!checkoutItems.length) {
      return jsonResponse(400, {
        success: false,
        message: "The selected cart is empty.",
      });
    }

    const inventory = await getInventory({ forceRefresh: true });
    const productsById = new Map(
      inventory.map((product) => [product.id, product])
    );
    const requestedQuantities = new Map();

    checkoutItems.forEach((item) => {
      requestedQuantities.set(
        item.productId,
        Number(requestedQuantities.get(item.productId) || 0) +
          Math.max(1, Math.floor(Number(item.quantity || 1)))
      );
    });

    if (requestedQuantities.size > 99) {
      return jsonResponse(400, {
        success: false,
        message: "A checkout can contain at most 99 unique products.",
      });
    }

    const unavailableItems = [...requestedQuantities.entries()]
      .filter(([productId, quantity]) => {
        const product = productsById.get(productId);
        return (
          !product ||
          !isProductPurchasable(product) ||
          getProductQuantity(product) < quantity
        );
      })
      .map(([productId]) => productsById.get(productId)?.name || productId);

    if (unavailableItems.length) {
      return jsonResponse(409, {
        success: false,
        message: `Some items are out of stock: ${unavailableItems.join(", ")}`,
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

    const updatedAt = new Date().toISOString();
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          ...[...requestedQuantities.entries()].map(
            ([productId, quantity]) => ({
              Update: {
                TableName: ITEMS_TABLE,
                Key: { id: productId },
                UpdateExpression:
                  "SET quantity = if_not_exists(quantity, :legacyQuantity) - :quantity, updatedAt = :updatedAt",
                ConditionExpression:
                  "(attribute_not_exists(quantity) OR quantity >= :quantity) AND (attribute_not_exists(available) OR available = :true) AND (attribute_not_exists(isAvailable) OR isAvailable = :true)",
                ExpressionAttributeValues: {
                  ":legacyQuantity": 100,
                  ":quantity": quantity,
                  ":updatedAt": updatedAt,
                  ":true": true,
                },
              },
            })
          ),
          {
            Put: {
              TableName: ITEMS_TABLE,
              Item: order,
            },
          },
        ],
      })
    );
    inventoryCache = { items: null, fetchedAt: 0 };

    return jsonResponse(201, {
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    console.error("checkoutNowOrder error:", error);
    if (error.name === "TransactionCanceledException") {
      return jsonResponse(409, {
        success: false,
        message:
          "Inventory changed while checking out. Review your cart and try again.",
      });
    }
    return jsonResponse(500, {
      success: false,
      message: "Failed to checkout order",
      error: error.message,
    });
  }
};

module.exports.listNowOrders = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    const entities = await queryUserEntities(authUser.userId, 120);
    const orders = entities.filter(
      (item) =>
        item.entityType === "ORDER" && item.userId === authUser.userId
    );

    orders.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    return jsonResponse(200, {
      success: true,
      count: orders.length,
      orders,
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
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

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
      userId: authUser.userId,
      planId: body.planId || "",
      action: body.action || "unknown",
      productId: body.productId || "",
      productName: body.productName || "",
      selectedMode: body.selectedMode || "",
      note: body.note || "",
      needCategory: body.needCategory || "",
      urgencyScore: Number(body.urgencyScore || 0),
      cartMode: body.cartMode || body.selectedMode || "",
      sessionEtaMinutes: Number(body.sessionEtaMinutes || 0),
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({ TableName: ITEMS_TABLE, Item: feedback })
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

const computeOrderStatus = (order = {}) => {
  const etaMs =
    Number(order.plan?.checkoutSummary?.etaMinutes || 15) * 60 * 1000;
  const createdAtMs = new Date(order.createdAt || Date.now()).getTime();
  const ageMs = Math.max(0, Date.now() - createdAtMs);
  const progress = etaMs > 0 ? Math.min(1, ageMs / etaMs) : 0;

  if (progress < 0.05) {
    return {
      status: "PLACED",
      label: "Order placed",
      emoji: "📋",
      progressPct: 5,
    };
  }
  if (progress < 0.2) {
    return {
      status: "CONFIRMED",
      label: "Order confirmed",
      emoji: "✅",
      progressPct: 20,
    };
  }
  if (progress < 0.5) {
    return {
      status: "PICKING",
      label: "Picking your items",
      emoji: "🧺",
      progressPct: 50,
    };
  }
  if (progress < 0.85) {
    return {
      status: "OUT_FOR_DELIVERY",
      label: "On the way",
      emoji: "🛵",
      progressPct: 85,
    };
  }
  return {
    status: "DELIVERED",
    label: "Delivered",
    emoji: "🏠",
    progressPct: 100,
  };
};

module.exports.trackNowOrder = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    const orderId =
      event.pathParameters?.orderId || event.queryStringParameters?.orderId;
    if (!orderId) {
      return jsonResponse(400, {
        success: false,
        message: "orderId is required",
      });
    }

    const orders = await scanByEntityType("ORDER", 500);
    const order = orders.find(
      (item) => item.id === orderId && item.userId === authUser.userId
    );

    if (!order) {
      return jsonResponse(404, { success: false, message: "Order not found" });
    }

    const tracking = computeOrderStatus(order);

    return jsonResponse(200, {
      success: true,
      orderId,
      ...tracking,
      etaMinutes: order.plan?.checkoutSummary?.etaMinutes || 15,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error("trackNowOrder error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to track order",
      error: error.message,
    });
  }
};

module.exports.getNowCart = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    const result = await docClient.send(
      new GetCommand({
        TableName: ITEMS_TABLE,
        Key: { id: `cart_${authUser.userId}` },
      })
    );

    return jsonResponse(200, {
      success: true,
      items: result.Item?.items || [],
      updatedAt: result.Item?.updatedAt || null,
    });
  } catch (error) {
    console.error("getNowCart error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to load cart",
      error: error.message,
    });
  }
};

module.exports.saveNowCart = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    const body = parseBody(event);
    if (!body || !Array.isArray(body.items)) {
      return jsonResponse(400, {
        success: false,
        message: "items must be an array",
      });
    }

    const items = body.items.slice(0, 100).map((item) => ({
      productId: safeString(item.productId),
      name: safeString(item.name),
      quantity: clampNumber(item.quantity, 1, 99, 1),
      price: clampNumber(item.price, 0, 1000000, 0),
      etaMinutes: clampNumber(item.etaMinutes, 0, 1440, 0),
      reason: safeString(item.reason),
    }));
    const updatedAt = new Date().toISOString();

    await docClient.send(
      new PutCommand({
        TableName: ITEMS_TABLE,
        Item: {
          id: `cart_${authUser.userId}`,
          entityType: "CART",
          userId: authUser.userId,
          items,
          createdAt: updatedAt,
          updatedAt,
        },
      })
    );

    return jsonResponse(200, { success: true, items, updatedAt });
  } catch (error) {
    console.error("saveNowCart error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to save cart",
      error: error.message,
    });
  }
};

module.exports.clearNowCart = async (event) => {
  try {
    const authUser = await getAuthenticatedUser(event);
    if (!authUser) return unauthorizedResponse();

    await docClient.send(
      new DeleteCommand({
        TableName: ITEMS_TABLE,
        Key: { id: `cart_${authUser.userId}` },
      })
    );

    return jsonResponse(200, { success: true, items: [] });
  } catch (error) {
    console.error("clearNowCart error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to clear cart",
      error: error.message,
    });
  }
};

const parseInventoryProduct = (body = {}, existing = null) => {
  const value = { ...(existing || {}), ...body };
  const name = safeString(value.name);
  const category = safeString(value.category);
  const price = Number(value.price);
  const quantity = getProductQuantity(value);
  const etaMinutes = Number(value.etaMinutes);

  if (!name) return { error: "name is required" };
  if (!category) return { error: "category is required" };
  if (!Number.isFinite(price) || price < 0) {
    return { error: "price must be zero or greater" };
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "quantity must be zero or greater" };
  }
  if (!Number.isFinite(etaMinutes) || etaMinutes < 0) {
    return { error: "etaMinutes must be zero or greater" };
  }

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => safeString(String(tag))).filter(Boolean)
    : String(value.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
  const isAvailable =
    typeof value.isAvailable === "boolean"
      ? value.isAvailable
      : value.available !== false;
  const now = new Date().toISOString();

  return {
    product: {
      ...(existing || {}),
      id:
        existing?.id ||
        safeString(body.id) ||
        `prod_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      entityType: "PRODUCT",
      name,
      category,
      description: safeString(value.description),
      price,
      quantity: Math.floor(quantity),
      imageUrl: safeString(value.imageUrl),
      etaMinutes: Math.floor(etaMinutes),
      storeLocation: safeString(value.storeLocation),
      aisle: safeString(value.aisle, category),
      tags,
      isAvailable,
      available: isAvailable,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
  };
};

module.exports.listAdminInventory = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();

    const products = normalizeProducts(await queryProducts(500)).map(
      stripProductEmbedding
    );
    return jsonResponse(200, {
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("listAdminInventory error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to load inventory",
      error: error.message,
    });
  }
};

module.exports.createAdminInventory = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();

    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, { success: false, message: "Invalid JSON body" });
    }

    const parsed = parseInventoryProduct(body);
    if (parsed.error) {
      return jsonResponse(400, { success: false, message: parsed.error });
    }

    const existing = await docClient.send(
      new GetCommand({
        TableName: ITEMS_TABLE,
        Key: { id: parsed.product.id },
      })
    );
    if (existing.Item) {
      return jsonResponse(409, {
        success: false,
        message: "A product with this ID already exists.",
      });
    }

    await docClient.send(
      new PutCommand({ TableName: ITEMS_TABLE, Item: parsed.product })
    );
    inventoryCache = { items: null, fetchedAt: 0 };
    return jsonResponse(201, { success: true, product: parsed.product });
  } catch (error) {
    console.error("createAdminInventory error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to create product",
      error: error.message,
    });
  }
};

module.exports.updateAdminInventory = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();

    const id = safeString(event.pathParameters?.id);
    const body = parseBody(event);
    if (!id || !body) {
      return jsonResponse(400, {
        success: false,
        message: "Product ID and valid JSON body are required.",
      });
    }

    const result = await docClient.send(
      new GetCommand({ TableName: ITEMS_TABLE, Key: { id } })
    );
    if (!result.Item || result.Item.entityType !== "PRODUCT") {
      return jsonResponse(404, {
        success: false,
        message: "Product not found.",
      });
    }

    const parsed = parseInventoryProduct(body, result.Item);
    if (parsed.error) {
      return jsonResponse(400, { success: false, message: parsed.error });
    }

    await docClient.send(
      new PutCommand({ TableName: ITEMS_TABLE, Item: parsed.product })
    );
    inventoryCache = { items: null, fetchedAt: 0 };
    return jsonResponse(200, { success: true, product: parsed.product });
  } catch (error) {
    console.error("updateAdminInventory error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

module.exports.deleteAdminInventory = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();

    const id = safeString(event.pathParameters?.id);
    if (!id) {
      return jsonResponse(400, {
        success: false,
        message: "Product ID is required.",
      });
    }

    const result = await docClient.send(
      new GetCommand({ TableName: ITEMS_TABLE, Key: { id } })
    );
    if (!result.Item || result.Item.entityType !== "PRODUCT") {
      return jsonResponse(404, {
        success: false,
        message: "Product not found.",
      });
    }

    await docClient.send(
      new DeleteCommand({ TableName: ITEMS_TABLE, Key: { id } })
    );
    inventoryCache = { items: null, fetchedAt: 0 };
    return jsonResponse(200, { success: true, id });
  } catch (error) {
    console.error("deleteAdminInventory error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

const buildAdminAnalytics = async () => {
  const [rawProducts, orders] = await Promise.all([
    queryProducts(500),
    scanByEntityType("ORDER", 1000),
  ]);
  const products = normalizeProducts(rawProducts);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const inventoryByCategory = new Map();
  const productSales = new Map();
  const categorySales = new Map();
  const revenueByDate = new Map();
  let estimatedRevenue = 0;

  products.forEach((product) => {
    const category = safeString(product.category, "Uncategorized");
    const current = inventoryByCategory.get(category) || {
      category,
      products: 0,
      quantity: 0,
    };
    current.products += 1;
    current.quantity += getProductQuantity(product);
    inventoryByCategory.set(category, current);
  });

  orders.forEach((order) => {
    const selectedMode = validDecisionMode(
      order.selectedMode || order.plan?.recommendedMode || "fastest"
    );
    const items = order.plan?.cartModes?.[selectedMode]?.items || [];
    const orderRevenue = Number(
      order.plan?.checkoutSummary?.estimatedTotal ||
        items.reduce(
          (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 1),
          0
        )
    );
    estimatedRevenue += orderRevenue;
    const date = String(order.createdAt || "").slice(0, 10);
    if (date) {
      const current = revenueByDate.get(date) || {
        date,
        orders: 0,
        revenue: 0,
      };
      current.orders += 1;
      current.revenue += orderRevenue;
      revenueByDate.set(date, current);
    }

    items.forEach((item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const product = productsById.get(item.productId);
      const productName = product?.name || item.name || item.productId;
      const category = product?.category || "Uncategorized";
      productSales.set(
        productName,
        Number(productSales.get(productName) || 0) + quantity
      );
      categorySales.set(
        category,
        Number(categorySales.get(category) || 0) + quantity
      );
    });
  });

  const outOfStockProducts = products.filter(
    (product) => getProductQuantity(product) === 0
  ).length;
  const lowStockProducts = products.filter((product) => {
    const quantity = getProductQuantity(product);
    return quantity > 0 && quantity < 5;
  }).length;
  const unavailableProducts = products.filter(
    (product) => product.available === false || product.isAvailable === false
  ).length;
  const availableProducts = products.filter(isProductPurchasable).length;
  const toTopList = (map, nameKey) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, quantity]) => ({ [nameKey]: name, quantity }));

  return {
    totalProducts: products.length,
    availableProducts,
    outOfStockProducts,
    lowStockProducts,
    unavailableProducts,
    totalOrders: orders.length,
    estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
    averageOrderValue:
      orders.length > 0
        ? Math.round((estimatedRevenue / orders.length) * 100) / 100
        : 0,
    inventoryByCategory: [...inventoryByCategory.values()].sort(
      (a, b) => b.quantity - a.quantity
    ),
    stockStatusBreakdown: [
      {
        status: "Available",
        value: products.filter((product) => {
          const quantity = getProductQuantity(product);
          return isProductPurchasable(product) && quantity >= 5;
        }).length,
      },
      {
        status: "Low stock",
        value: products.filter((product) => {
          const quantity = getProductQuantity(product);
          return isProductPurchasable(product) && quantity > 0 && quantity < 5;
        }).length,
      },
      {
        status: "Out of stock",
        value: products.filter(
          (product) =>
            product.available !== false &&
            product.isAvailable !== false &&
            getProductQuantity(product) === 0
        ).length,
      },
      { status: "Unavailable", value: unavailableProducts },
    ],
    revenueTrend: [...revenueByDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
    topProducts: toTopList(productSales, "name"),
    topCategories: toTopList(categorySales, "category"),
  };
};

const buildRuleBasedInsights = (analytics) => {
  const insights = [];
  if (analytics.lowStockProducts > 0) {
    insights.push(
      `${analytics.lowStockProducts} products have fewer than 5 units and should be reviewed for restocking.`
    );
  }
  if (analytics.outOfStockProducts > 0) {
    insights.push(
      `${analytics.outOfStockProducts} products are out of stock and unavailable to customers and AI recommendations.`
    );
  }
  if (analytics.unavailableProducts > 0) {
    insights.push(
      `${analytics.unavailableProducts} products are manually disabled; confirm whether they should return to sale.`
    );
  }
  if (analytics.topCategories[0]) {
    insights.push(
      `${analytics.topCategories[0].category} is the most ordered category with ${analytics.topCategories[0].quantity} units ordered.`
    );
  }
  if (analytics.totalOrders === 0) {
    insights.push(
      "No orders are available yet; monitor early category demand before making large stock changes."
    );
  } else {
    insights.push(
      `Average order value is ₹${Math.round(analytics.averageOrderValue)} across ${analytics.totalOrders} orders.`
    );
  }
  return insights.slice(0, 5);
};

module.exports.getAdminAnalytics = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();
    const analytics = await buildAdminAnalytics();
    return jsonResponse(200, { success: true, analytics });
  } catch (error) {
    console.error("getAdminAnalytics error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to load business analytics",
      error: error.message,
    });
  }
};

module.exports.generateAdminInsights = async (event) => {
  try {
    const admin = await getAdminUser(event);
    if (!admin) return forbiddenResponse();
    const analytics = await buildAdminAnalytics();
    const fallbackInsights = buildRuleBasedInsights(analytics);
    let insights = fallbackInsights;
    let source = "rules";

    try {
      const summary = {
        totalProducts: analytics.totalProducts,
        availableProducts: analytics.availableProducts,
        outOfStockProducts: analytics.outOfStockProducts,
        lowStockProducts: analytics.lowStockProducts,
        unavailableProducts: analytics.unavailableProducts,
        totalOrders: analytics.totalOrders,
        estimatedRevenue: analytics.estimatedRevenue,
        averageOrderValue: analytics.averageOrderValue,
        inventoryByCategory: analytics.inventoryByCategory.slice(0, 10),
        topProducts: analytics.topProducts.slice(0, 5),
        topCategories: analytics.topCategories.slice(0, 5),
      };
      const text = await callBedrockConverse({
        modelId: BEDROCK_FAST_MODEL_ID,
        maxTokens: 350,
        temperature: 0.2,
        topP: 0.7,
        prompt: `You are an ecommerce inventory analyst for an Indian store. All monetary values are Indian rupees. Always format currency with the ₹ symbol or INR, never with dollars. Return JSON only in this shape: {"insights":["short actionable insight"]}. Produce 3 to 5 concise insights based only on these aggregate metrics. Do not invent facts or mention users.\n${JSON.stringify(summary)}`,
      });
      const parsed = parseJsonObjectFromText(text);
      if (Array.isArray(parsed.insights) && parsed.insights.length) {
        insights = parsed.insights
          .map((insight) => safeString(String(insight)))
          .map((insight) => insight.replace(/\$/g, "₹"))
          .filter(Boolean)
          .slice(0, 5);
        source = "bedrock";
      }
    } catch (aiError) {
      console.warn("Admin insights AI fallback used:", aiError.message);
    }

    return jsonResponse(200, {
      success: true,
      insights,
      source,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("generateAdminInsights error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to generate business insights",
      error: error.message,
    });
  }
};

module.exports.embedProducts = async () => {
  try {
    const products = await queryProducts(300);
    const unembedded = products.filter(
      (product) =>
        !Array.isArray(product.embedding) || !product.embedding.length
    );

    console.log(
      `Embedding ${unembedded.length} products (${products.length - unembedded.length} already embedded).`
    );

    let embedded = 0;
    let failed = 0;

    for (const product of unembedded) {
      try {
        const embedding = await generateEmbedding(
          buildProductEmbeddingText(product)
        );
        await docClient.send(
          new PutCommand({
            TableName: ITEMS_TABLE,
            Item: {
              ...product,
              embedding,
              embeddedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        );
        embedded += 1;
        await new Promise((resolve) => setTimeout(resolve, 60));
      } catch (error) {
        failed += 1;
        console.warn(`Embedding failed for ${product.id}:`, {
          message: error.message,
        });
      }
    }

    inventoryCache = { items: null, fetchedAt: 0 };

    return jsonResponse(200, {
      success: true,
      embedded,
      failed,
      total: products.length,
      embeddingModelId: BEDROCK_EMBEDDING_MODEL_ID,
    });
  } catch (error) {
    console.error("embedProducts error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to embed products",
      error: error.message,
    });
  }
};

module.exports.listNowProducts = async (event) => {
  try {
    const products = await getInventory();

    return jsonResponse(200, {
      success: true,
      count: products.length,
      products: products.map(stripProductEmbedding),
    });
  } catch (error) {
    console.error("listNowProducts error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to list InstaKart products",
      error: error.message,
    });
  }
};
