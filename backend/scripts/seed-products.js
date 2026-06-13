const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const ITEMS_TABLE = process.env.ITEMS_TABLE || "hackon6-items-dev";

const client = new DynamoDBClient({
  region: AWS_REGION,
});

const docClient = DynamoDBDocumentClient.from(client);

const productsPath = path.join(__dirname, "..", "data", "products.seed.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

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
      ...(product.tags || []),
    ]
      .join(" ")
      .toLowerCase(),
    seededFor: "amazon-now-assist",
    createdAt: product.createdAt || now,
    updatedAt: now,
  }));

  const batches = chunk(normalizedProducts, 25);

  let total = 0;

  for (const batch of batches) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [ITEMS_TABLE]: batch.map((product) => ({
            PutRequest: {
              Item: product,
            },
          })),
        },
      })
    );

    total += batch.length;
    console.log(`Seeded ${total}/${normalizedProducts.length}`);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        table: ITEMS_TABLE,
        region: AWS_REGION,
        count: normalizedProducts.length,
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
