const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  QueryCommand,
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
  process.env.BEDROCK_FALLBACK_MODEL_ID || "amazon.nova-pro-v1:0";
const BEDROCK_FAST_MODEL_ID =
  process.env.BEDROCK_FAST_MODEL_ID || "amazon.nova-micro-v1:0";
const BEDROCK_EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v2:0";
const ENABLE_EMBEDDING_RANKING =
  process.env.ENABLE_EMBEDDING_RANKING !== "false";

const PRODUCT_INDEX_NAME = "EntityTypeAisleIndex";
const USER_INDEX_NAME = "UserCreatedAtIndex";
const INVENTORY_CACHE_TTL_MS = Number(
  process.env.INVENTORY_CACHE_TTL_MS || 60000
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
  const hour = now.getHours();

  let timeOfDay = "night";
  if (hour >= 5 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
  else if (hour >= 17 && hour < 22) timeOfDay = "evening";

  return {
    isoTime: now.toISOString(),
    localAssumption: "Asia/Kolkata demo context",
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

const getInventory = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();

  if (
    !forceRefresh &&
    inventoryCache.items &&
    now - inventoryCache.fetchedAt < INVENTORY_CACHE_TTL_MS
  ) {
    return inventoryCache.items;
  }

  const products = await queryProducts(300);

  const inventory = products
    .filter((product) => product.available !== false)
    .map((product) => ({
      ...product,
      price: Number(product.price || 0),
      etaMinutes: Number(product.etaMinutes || 999),
      tags: Array.isArray(product.tags) ? product.tags : [],
    }))
    .sort((a, b) => Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999));

  inventoryCache = {
    items: inventory,
    fetchedAt: now,
  };

  return inventory;
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

const rankInventoryByEmbeddings = async (
  userRequest,
  inventory,
  limit = 16
) => {
  const productsWithEmbeddings = inventory.filter(
    (product) => Array.isArray(product.embedding) && product.embedding.length
  );

  if (!ENABLE_EMBEDDING_RANKING || productsWithEmbeddings.length < 8) {
    return null;
  }

  const requestEmbedding = await generateEmbedding(userRequest);
  if (!requestEmbedding) return null;

  const scored = productsWithEmbeddings.map((product) => {
    const semanticScore = cosineSimilarity(requestEmbedding, product.embedding);
    const eta = Number(product.etaMinutes || 999);
    const etaBoost = Math.max(0, 25 - eta) / 100;
    const availabilityPenalty = product.available === false ? -1 : 0;

    return {
      product,
      score: semanticScore + etaBoost + availabilityPenalty,
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

const rankInventoryByLexicalFallback = (userRequest, inventory, limit = 16) => {
  const requestTokens = normalizeTextForSearch(userRequest);

  const scored = inventory.map((product) => ({
    product,
    score: lexicalScoreProduct(product, requestTokens),
  }));

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
    .slice(0, 10);

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
  limit = 16
) => {
  try {
    const embeddedCandidates = await rankInventoryByEmbeddings(
      userRequest,
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
    userRequest,
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

const buildNeedGraph = ({ needCategory, selectedProducts, userRequest }) => {
  const text = String(userRequest || "").toLowerCase();
  const productText = selectedProducts
    .map((product) =>
      [product.name, product.category, ...(product.tags || [])].join(" ")
    )
    .join(" ")
    .toLowerCase();

  const categoryDimensions = {
    birthday_surprise: [
      "celebration",
      "sweet/dessert",
      "gift/personal touch",
      "decoration",
    ],
    travel_packing: ["hygiene", "packing", "hydration", "snack/comfort"],
    interview_ready: [
      "grooming",
      "freshness",
      "presentation",
      "work readiness",
    ],
    pet_cleanup: ["surface cleanup", "odor control", "hygiene", "disposal"],
    power_cut_prep: [
      "lighting",
      "battery/power",
      "hydration",
      "comfort/safety",
    ],
    guest_hosting: ["snacks", "beverages", "serving", "cleanup"],
    breakfast_rush: ["food", "beverage", "fruit/healthy", "quick prep"],
    quick_cleanup: ["absorb", "wipe", "disinfect", "dispose"],
  };

  const dimensions = categoryDimensions[needCategory] || [
    "core need",
    "speed",
    "supporting items",
  ];

  return {
    primaryNeed: formatNeedCategory(needCategory),
    inferredFrom: text.slice(0, 140),
    dimensions: dimensions.map((dimension) => ({
      name: dimension,
      covered:
        productText.includes(dimension.split("/")[0].split(" ")[0]) ||
        selectedProducts.length >= 5,
      reason: `Checked against selected products for ${dimension}.`,
    })),
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

const buildFullPlanFromAiSelection = ({
  aiSelection,
  userRequest,
  budgetMode,
  decisionMode,
  panicMode,
  userId,
  inventoryCandidates,
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
    if (selectedProducts.length >= 8) return;
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    selectedProducts.push(product);
  });

  const fastestProducts = [...selectedProducts]
    .sort((a, b) => Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999))
    .slice(0, 5);

  const bestValueProducts = [...selectedProducts]
    .sort((a, b) => {
      const priceDiff = Number(a.price || 9999) - Number(b.price || 9999);
      if (priceDiff !== 0) return priceDiff;
      return Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999);
    })
    .slice(0, 5);

  const mostCompleteProducts = selectedProducts.slice(0, 7);
  const categoryTitle = formatNeedCategory(sanitized.needCategory);

  const cartModes = {
    fastest: buildCartModeFromProducts({
      modeLabel: "Fastest",
      cartTitle: `${categoryTitle} Fast Kit`,
      products: fastestProducts,
      modeReason: "Lowest ETA products from the AI-ranked recommendation set.",
      itemReason: "Chosen because it can help quickly in this situation.",
      reasonMap: sanitized.productReasons,
    }),
    bestValue: buildCartModeFromProducts({
      modeLabel: "Best Value",
      cartTitle: `${categoryTitle} Value Kit`,
      products: bestValueProducts,
      modeReason:
        "Lower-cost useful products from the AI-ranked recommendation set.",
      itemReason: "Chosen because it balances usefulness and budget.",
      reasonMap: sanitized.productReasons,
    }),
    mostComplete: buildCartModeFromProducts({
      modeLabel: "Most Complete",
      cartTitle: `${categoryTitle} Complete Kit`,
      products: mostCompleteProducts,
      modeReason:
        "Broadest useful coverage from the AI-ranked recommendation set.",
      itemReason: "Chosen because it improves overall need coverage.",
      reasonMap: sanitized.productReasons,
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

  const regretPrevention = sanitized.regretProductIds
    .map((productId) => productById.get(productId))
    .filter(Boolean)
    .filter((product) => !cartProductIds.has(product.id))
    .slice(0, 3)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      price: Number(product.price || 0),
      etaMinutes: Number(product.etaMinutes || 0),
      reason:
        sanitized.productReasons?.[product.id] ||
        "A useful supporting item the user may otherwise forget.",
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
    confidence: sanitized.confidence,
    aiExplanation: sanitized.aiExplanation,
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
}) => `
You are Amazon Now Assist, an AI product-selection planner for urgent quick-commerce.

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
  }))
)}

Rules:
1. Use only product IDs from inventory candidates.
2. Do not invent products or product IDs.
3. Select 7 to 10 recommendedProductIds, ranked most important first.
4. Select 0 to 3 regretProductIds only if they are strongly relevant and not already recommended.
5. productReasons must contain short situation-specific reasons for every recommendedProductId and regretProductId.
6. needCategory must be specific, such as birthday_surprise, travel_packing, interview_ready, pet_cleanup, power_cut_prep, guest_hosting, breakfast_rush, study_session, health_comfort, quick_cleanup.
7. recommendedMode should respect decisionMode unless another mode is clearly better.
8. Keep all text short. No generic reasons like "selected by AI".

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
  const inventoryCandidates = await getRelevantInventoryCandidates(
    userRequest,
    inventory,
    16
  );
  const userMemory = await getUserMemory(userId).catch((error) => {
    console.warn("User memory skipped:", { message: error.message });
    return {
      previousNeedCategories: [],
      likedProducts: [],
      skippedProducts: [],
    };
  });

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
  });

  const plannerResult = await callPlannerWithFallback({
    prompt,
    maxTokens: 650,
    temperature: 0.12,
    topP: 0.65,
  });

  const aiSelection = parseJsonObjectFromText(plannerResult.text);

  return buildFullPlanFromAiSelection({
    aiSelection,
    userRequest,
    budgetMode,
    decisionMode,
    panicMode,
    userId,
    inventoryCandidates,
    modelId: plannerResult.modelId,
    usedFallback: plannerResult.usedFallback,
    startedAt,
  });
};

const inferFallbackNeedMetadata = (userRequest, panicMode) => {
  const needCategory = inferSimpleNeedCategory(userRequest);
  const fallbackKeywords = normalizeTextForSearch(
    `${userRequest} ${(SYNONYM_MAP[needCategory] || []).join(" ")}`
  );

  return {
    needCategory,
    cartTitle: `${formatNeedCategory(needCategory)} Kit`,
    urgencyReason: panicMode
      ? "User described a time-sensitive situation."
      : "User requested a useful quick-commerce plan.",
    aiExplanation:
      "The resilient fallback selected fast, relevant products from live DynamoDB inventory.",
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
  return score + Math.max(0, 25 - eta) / 5;
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
    24
  );
  const scoredProducts = semanticCandidates
    .map((product) => ({
      product,
      score: scoreProductForKeywords(product, metadata.keywords),
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

  const selectedProducts = [];
  const seen = new Set();

  [...scoredProducts, ...semanticCandidates, ...inventory].forEach(
    (product) => {
      if (selectedProducts.length >= 8) return;
      if (!product?.id || seen.has(product.id)) return;
      seen.add(product.id);
      selectedProducts.push(product);
    }
  );

  if (selectedProducts.length < 3) return null;

  const fastestProducts = [...selectedProducts]
    .sort((a, b) => Number(a.etaMinutes || 999) - Number(b.etaMinutes || 999))
    .slice(0, 5);

  const bestValueProducts = [...selectedProducts]
    .sort((a, b) => Number(a.price || 9999) - Number(b.price || 9999))
    .slice(0, 5);

  const mostCompleteProducts = selectedProducts.slice(0, 7);
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
          `Fast fallback item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Fastest relevant products available from live inventory.",
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
          `Value-focused fallback item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Lower-cost relevant products available from live inventory.",
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
          `Coverage fallback item for ${categoryTitle.toLowerCase()}.`
        )
      ),
      modeReason: "Broadest relevant coverage available from live inventory.",
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
    substitutions: [],
    needGraph,
    deadlineSafety,
    coverage,
    confidence: {
      overall: 78,
      needMatch: 80,
      availabilityFit: 86,
      budgetFit: budgetMode === "premium" ? 78 : 82,
      completeness: coverage.score,
      reason:
        "Fallback confidence is based on inventory relevance, speed, and coverage.",
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
    modelId: "deterministic-fallback",
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

    const inventory = await getInventory();

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

    return jsonResponse(200, { success: true, plan });
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
    const selectedMode = validDecisionMode(
      body.selectedMode || plan?.recommendedMode || "fastest"
    );

    if (!plan) {
      return jsonResponse(400, { success: false, message: "plan is required" });
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
      new PutCommand({ TableName: ITEMS_TABLE, Item: order })
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

    let orders;
    if (userId) {
      const entities = await queryUserEntities(userId, 120);
      orders = entities.filter((item) => item.entityType === "ORDER");
    } else {
      orders = await scanByEntityType("ORDER", 120);
    }

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

module.exports.listNowProducts = async (event) => {
  try {
    const forceRefresh = event.queryStringParameters?.refresh === "true";
    const products = await getInventory({ forceRefresh });

    return jsonResponse(200, {
      success: true,
      count: products.length,
      products: products.map(stripProductEmbedding),
    });
  } catch (error) {
    console.error("listNowProducts error:", error);
    return jsonResponse(500, {
      success: false,
      message: "Failed to list Amazon Now products",
      error: error.message,
    });
  }
};
