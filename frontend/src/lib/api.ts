const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
}

export type Item = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
};

export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch backend health");
  }

  return response.json();
}

export async function getItems(): Promise<Item[]> {
  const response = await fetch(`${API_BASE_URL}/items`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch items");
  }

  const data = await response.json();
  return data.items || [];
}

export async function createItem(payload: {
  title: string;
  description: string;
  status?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to create item");
  }

  return response.json();
}

export async function askBedrock(question: string): Promise<{
  success: boolean;
  question: string;
  answer: string;
  modelId: string;
  timestamp: string;
}> {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error("Failed to get Bedrock answer");
  }

  return response.json();
}
