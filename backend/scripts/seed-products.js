const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE || "hackon6-items-dev";
const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v2:0";
const SKIP_EMBEDDINGS = process.env.SKIP_EMBEDDINGS === "true";
const EMBEDDING_CONCURRENCY = Number(process.env.EMBEDDING_CONCURRENCY || 3);

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

const productsPath = path.join(__dirname, "..", "data", "products.seed.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const decodeBedrockBody = async (body) => {
  if (!body) return "{}";
  if (typeof body.transformToString === "function") {
    return body.transformToString();
  }
  return Buffer.from(body).toString("utf8");
};

const buildProductEmbeddingText = (product) => {
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

const generateEmbedding = async (inputText) => {
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

  return embedding;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

async function seedProducts() {
  const now = new Date().toISOString();

  const normalizedProducts = products.map((product) => ({
    ...product,
    entityType: "PRODUCT",
    available: product.available !== false,
    searchText: [
      product.name,
      product.category,
      product.aisle,
      product.budgetTier,
      product.speedTier,
      product.packSize,
      ...(product.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    seededFor: "instakart-assist",
    createdAt: product.createdAt || now,
    updatedAt: now,
  }));

  let productsToWrite = normalizedProducts;

  if (!SKIP_EMBEDDINGS) {
    console.log(
      `Generating Titan embeddings for ${normalizedProducts.length} products using ${BEDROCK_EMBEDDING_MODEL_ID}...`
    );

    productsToWrite = await mapWithConcurrency(
      normalizedProducts,
      EMBEDDING_CONCURRENCY,
      async (product, index) => {
        try {
          const embedding = await generateEmbedding(
            buildProductEmbeddingText(product)
          );
          console.log(
            `Embedded ${index + 1}/${normalizedProducts.length}: ${product.id}`
          );
          return { ...product, embedding };
        } catch (error) {
          console.warn(`Embedding skipped for ${product.id}: ${error.message}`);
          return product;
        }
      }
    );
  } else {
    console.log("Skipping embeddings because SKIP_EMBEDDINGS=true");
  }

  const batches = chunk(productsToWrite, 25);
  let total = 0;

  for (const batch of batches) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [ITEMS_TABLE]: batch.map((product) => ({
            PutRequest: { Item: product },
          })),
        },
      })
    );

    total += batch.length;
    console.log(`Seeded ${total}/${productsToWrite.length}`);
  }

  const embeddedCount = productsToWrite.filter(
    (product) => Array.isArray(product.embedding) && product.embedding.length
  ).length;

  console.log(
    JSON.stringify(
      {
        success: true,
        table: ITEMS_TABLE,
        region: AWS_REGION,
        bedrockRegion: BEDROCK_REGION,
        embeddingModelId: BEDROCK_EMBEDDING_MODEL_ID,
        count: productsToWrite.length,
        embeddedCount,
      },
      null,
      2
    )
  );
}

seedProducts().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
