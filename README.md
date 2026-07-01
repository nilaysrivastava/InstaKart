# InstaKart

> Situation-aware quick-commerce: describe the moment, get a verified cart in seconds.

InstaKart reimagines urgent shopping for quick-commerce customers. Instead of asking users to search product-by-product, the app lets them describe a real-life situation such as **“I cut my finger while cooking”**, **“guests are coming in 30 minutes”**, or **“there may be a power cut tonight”**. The system understands the need, retrieves relevant products, builds cart modes, verifies usefulness, and lets the customer review and checkout quickly.

---

## Links

- **Demo Video:** https://drive.google.com/file/d/1D6Skov5TzY9RffPeIMj02N_qs4DCNugr/view?usp=sharing
- **Live App:** https://main.d2a6skx8ok931x.amplifyapp.com

---

## Problem

Quick-commerce customers often arrive with a situation, not a product list.

A user may know what happened, but not every SKU required to solve it. Current shopping flows still require manual searching, comparing, remembering supporting items, and assembling a cart. This creates friction precisely when urgency is highest.

InstaKart reduces that journey to:

```txt
Describe the situation → Review AI-built essentials → Checkout
```

The goal is simple: help customers discover, decide, and purchase urgent needs faster.

---

## What It Does

InstaKart converts a natural-language or voice situation into a verified, ready-to-review shopping cart.

### Core Capabilities

- **Situation-first shopping:** users describe what happened instead of searching SKU-by-SKU.
- **Voice and text input:** users can type or speak their urgent need.
- **AI-built verified cart:** backend retrieves, plans, verifies, and filters relevant products.
- **Three cart modes:** Fastest, Best Value, and Most Complete.
- **Item-by-item review deck:** users can add useful items and skip irrelevant ones.
- **Cart and checkout flow:** selected items move into a cart drawer and checkout creates an order.
- **Order history and timeline:** placed orders are stored and shown with progress.
- **Feedback capture:** add, skip, refine, and checkout signals are stored for future improvement.

---

## Example Use Cases

| Situation Prompt | Expected Cart Behavior |
|---|---|
| `I cut my finger while cooking` | First-aid essentials such as bandages, antiseptic, and cotton |
| `Guests are coming in 30 minutes` | Snacks, drinks, water, and serving essentials |
| `There may be a power cut tonight` | Candles, matchbox, torch, and batteries |
| `I have an interview in one hour` | Grooming and readiness items |
| `It is raining and I need to leave` | Raincoat, umbrella, towel, and travel support |

---

## Product Workflow

```txt
1. Describe
   User enters a text or voice prompt such as:
   “4 friends are coming in 30 minutes.”

2. Generate
   Backend extracts intent, retrieves relevant products, plans the cart,
   verifies usefulness, and returns cart modes.

3. Review
   User reviews item cards, adds or skips products,
   optionally refines the cart, and checks out.
```

---

## Architecture Flow

```txt
User situation prompt
    ↓
Next.js frontend
    ↓
API Gateway
    ↓
Lambda orchestration
    ↓
DynamoDB inventory + embeddings
    ↓
Bedrock Titan retrieval
    ↓
Nova Pro planner
    ↓
Nova verifier / reranker
    ↓
Verified cart modes
    ↓
Cart review
    ↓
Checkout
    ↓
DynamoDB orders / feedback
```

---

## AI Pipeline

The backend uses a retrieval-planning-verification pipeline instead of hardcoded scenario templates.

### 1. Intent Extraction

The user’s free-form prompt is converted into structured signals:

- need category
- urgency
- people count
- time/deadline context
- budget preference
- required product roles
- situation summary

### 2. Semantic Retrieval

Product embeddings are precomputed for the seeded catalog. At request time, the user’s intent is embedded and compared against product-purpose metadata using cosine similarity.

This helps the system rank products by meaning, not just keyword overlap.

### 3. Nova Cart Planning

Amazon Nova Pro receives a relevant candidate pool and creates situation-aware cart recommendations with:

- item reasons
- cart summaries
- suggested quantities
- urgency interpretation
- Fastest / Best Value / Most Complete modes

### 4. Verifier and Reranker

A second generic LLM pass checks whether each selected item is directly useful for the situation. It removes filler products, lowers skipped items, and allows smaller but more accurate carts when only a few products are truly relevant.

### 5. Deterministic Cart-Mode Builder

The final cart modes are built from the verified pool using:

- delivery ETA
- price
- relevance
- coverage
- usefulness signals

A fast product cannot enter the cart only because it has a low ETA. It must be relevant and useful for the user’s situation.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS | Responsive storefront and Instant Cart UI |
| UI Flow | React components | Prompt input, cart deck, drawers, checkout, orders |
| Backend | AWS Lambda, Node.js | Serverless orchestration and business logic |
| API | Amazon API Gateway | Public HTTPS endpoints |
| Database | Amazon DynamoDB | Products, embeddings, orders, feedback |
| AI Models | Amazon Bedrock Nova Pro, Nova Micro | Planning, verification, fallback |
| Embeddings | Amazon Titan Embed Text v2 | Semantic product retrieval |
| Deployment | AWS Amplify, Serverless Framework | Frontend and backend deployment |
| Monitoring | CloudWatch | Logs and debugging |

---

## Backend Endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/items` | Create test item |
| `GET` | `/items` | List test items |
| `POST` | `/ask` | Bedrock test route |
| `POST` | `/now/seed` | Seed product catalog |
| `GET` | `/now/products` | List products |
| `POST` | `/now/embed-products` | Generate product embeddings |
| `POST` | `/now/plan` | Generate AI cart plan |
| `POST` | `/now/checkout` | Create order |
| `GET` | `/now/orders` | List orders |
| `GET` | `/now/orders/{orderId}/track` | Track order |
| `POST` | `/now/feedback` | Store user feedback |

---

## Frontend Highlights

The frontend is designed to feel like a quick-commerce storefront.

### Implemented UI

- Amazon-inspired header and storefront layout
- Responsive mobile-ready design
- Product/category shelves
- Instant Cart assistant modal
- Text and voice prompt input
- AI loading state
- Cart-mode comparison
- Item-by-item recommendation deck
- Cart drawer with checkout
- Order history drawer
- Order progress timeline
- Footer and polished visual layout

---

## Data Model Overview

The project uses DynamoDB for a simple, scalable data layer.

### Product Records

Products include:

- product id
- title/name
- category
- aisle/entity
- price
- ETA
- tags
- product-purpose metadata
- Titan embedding vector

### Order Records

Orders include:

- order id
- user id/session id
- selected items
- total amount
- estimated delivery time
- status/timeline
- timestamps

### Feedback Records

Feedback includes:

- generated items
- added items
- skipped items
- refined prompts
- checkout actions
- need category
- cart metadata

This creates a useful loop for future personalization, skipped-product avoidance, and demand prediction.

---

## Scaling Strategy

The system is designed as a cloud-native, serverless architecture.

- **Stateless APIs:** Lambda and API Gateway scale horizontally without server management.
- **DynamoDB access patterns:** products, orders, and feedback are stored in a scalable NoSQL layer.
- **Precomputed embeddings:** product vectors are generated ahead of request time.
- **Cached inventory:** stale-while-revalidate behavior reduces repeated reads and latency.
- **Parallel operations:** independent backend operations run in parallel where possible.
- **Model fallback:** Nova Micro fallback keeps the system resilient if the primary planner path is slow or unavailable.
- **Future vector index:** at larger catalog scale, cosine ranking can move to a managed vector index while preserving the planner/verifier contract.

---

## Why This Is Different

Most shopping assistants behave like chatbots or search wrappers. InstantKart is designed as a decision system.

It does not simply return search results. It:

1. understands the user’s situation,
2. retrieves semantically relevant inventory,
3. plans a cart,
4. verifies usefulness,
5. removes filler,
6. presents simple cart modes,
7. captures feedback after review and checkout.

The key idea is **situation-to-cart intelligence**.

---

## Future Vision

Amazon Now can evolve into a situation-aware commerce layer that understands real-life moments, not just keywords.

Potential expansion areas:

- first aid and healthcare kits
- baby care
- festival hosting
- travel packing
- office and school readiness
- emergency preparedness
- household restocking
- hospitality and B2B essentials

Because the pipeline is catalog-agnostic, new segments mainly require better product metadata, fulfillment constraints, embeddings, and safety policies rather than a new app from scratch.

---

## Local Development

### Prerequisites

- Node.js 20+
- npm
- AWS CLI configured
- AWS account with Bedrock model access
- Serverless Framework v3
- DynamoDB table configured
- Amplify deployment for frontend

### Repository Setup

```bash
git clone https://github.com/nilaysrivastava/hackon6-amazon-prototype.git
cd hackon6-amazon-prototype
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npx serverless deploy
```

---

## Team Notes

This project was built as a working prototype focused on urgent quick-commerce discovery, decision-making, and checkout.

The current version demonstrates:

- deployed frontend
- deployed backend API
- DynamoDB-backed inventory/orders/feedback
- Amazon Bedrock integration
- Titan semantic retrieval
- Nova planning and verification
- end-to-end cart and checkout flow

---

## Made with 🧡
