<div align="center">
  <img src="frontend/public/logo.png" alt="InstaKart" width="150" />

# InstaKart

Situation-aware quick commerce on Render and Supabase.

Describe the moment. Compare three suggested carts. Check out essentials.
</div>

## Experience

- Text and browser voice input for situation-aware shopping.
- Fastest, Best Value, and Most Complete carts from live inventory.
- Email/password accounts, profile, persistent private carts, order history and tracking.
- Administrator inventory management, stock controls, analytics and business insights.
- Atomic checkout: locked stock validation, canonical catalog prices and order creation in one Postgres transaction.

The free deployment uses the built-in keyword/context planner. It supports explicit budgets and people counts without an external model account. Generative interpretation, generated tips and model-based insights can be enabled later with an OpenAI-compatible provider. This version has **no AWS runtime dependencies**.

Order placement and time-based delivery tracking are prototype workflows; the app does not charge cards or dispatch real deliveries.

## Architecture

![Architecture](frontend/public/architecture.svg)

| Component | Service |
| --- | --- |
| Storefront and administration | Next.js 16, React 19, Tailwind, Recharts |
| Frontend and API host | One Render Free Node.js web service |
| Authentication | Supabase Auth, email/password |
| Persistent storage | Supabase Postgres, `commerce_entities` JSON documents |
| Authorization | Server-verified Supabase users; admin role in trusted `app_metadata.groups` |
| Planning | Built-in inventory planner; optional OpenAI-compatible model |

The browser calls the same-origin `/api` endpoints. The server forwards each verified user session to Supabase. Row-level policies allow public catalog reads, private owner records and administrator inventory actions. Checkout calls a private transactional function that verifies `auth.uid()` and order ownership. Render needs only a publishable key; no Supabase service-role secret is used.

## Local development

Use Node.js 22.13 or newer within the 22.x line.

```sh
git clone https://github.com/nilaysrivastava/InstaKart.git
cd InstaKart
npm ci --prefix frontend
npm ci --prefix backend
cp frontend/.env.example frontend/.env.local
# Fill in the Supabase URL and publishable key.
npm run dev
```

Open [localhost:3000](http://localhost:3000). Run from the repository root so the custom server serves both the Next.js pages and commerce API.

For a fresh Supabase project, apply `backend/sql/schema.sql` and run the idempotent catalog seeder with an administrator access token and the public project configuration set:

```sh
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_ACCESS_TOKEN=... npm run seed --prefix backend
```

Existing products, administrator edits and stock levels are preserved by the seeder. The repository's 233 seed products start with quantity 100 unless otherwise specified. This deployment starts with a fresh catalog: historical AWS users/orders are not imported without access to the old services or an export.

## Render deployment

Use a **Free** Node web service with the repository root as its working directory:

| Setting | Value |
| --- | --- |
| Build | `npm run build` |
| Start | `npm start` |
| Health check | `/health` |
| Node | `22.x` |
| Region | Singapore |

Set these variables before building:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE_URL=/api
NODE_VERSION=22
```

Never put a secret key in a `NEXT_PUBLIC_` variable or a committed file. Public variables are compiled into browser code; changing them requires a rebuild.

In Supabase Auth, set the Site URL to the Render URL. Add the same URL and `http://localhost:3000` to the redirect allowlist. The sign-up dialog supports email OTP verification; configure the Confirm signup email template to include `{{ .Token }}`, or use the confirmation link and then sign in. Supabase's default email sender is restricted; configure a custom SMTP provider for unrestricted public signups.

### Administrators

Create a normal account, then use the Supabase Dashboard user editor or a server-only Auth Admin client to set:

```json
{"groups":["admin"]}
```

Set this in **app metadata**, never user metadata. Sign out and back in after assignment. Customers cannot grant themselves admin access. The backend verifies the current user with Supabase on every protected request.

### Optional generative AI

Set `AI_API_KEY`, `AI_BASE_URL` (an OpenAI-compatible API base), and `AI_MODEL` in Render, then redeploy. No key is needed for the built-in planner. Provider availability, free quotas and model names depend on your provider account. On provider failure the app falls back to inventory planning and rule-based insights.

## Routes and API

Pages: `/`, `/admin`, `/admin/inventory`.

| API route | Access |
| --- | --- |
| `GET /health`, `GET /api/health` | Public |
| `GET /api/now/products`, `POST /api/now/plan/guest` | Public |
| `POST /api/now/plan` | Customer |
| `GET/PUT/DELETE /api/now/cart` | Customer |
| `POST /api/now/checkout` | Customer |
| `GET /api/now/orders`, `GET /api/now/orders/{id}/track` | Owner |
| `POST /api/now/feedback` | Customer |
| `GET/POST /api/admin/inventory` | Admin |
| `PATCH/DELETE /api/admin/inventory/{id}` | Admin |
| `GET /api/admin/analytics`, `POST /api/admin/analytics/insights` | Admin |
| `/api/items`, `/api/ask`, `/api/now/seed`, `/api/now/embed-products` | Admin maintenance |

The legacy image-plan client helper had no corresponding backend route in the original app; image-based planning is not implemented.

## Validation

```sh
npm test --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm audit --prefix frontend
npm audit --prefix backend
```

The backend tests exercise guest scenarios, budgets, people counts and unauthenticated access boundaries. Database integration validation checks canonical prices, stock deductions, oversell rejection and row-level database permissions. Live account isolation and UI checks use disposable test accounts.

## Free-plan operation

Render Free services sleep after 15 minutes idle and can take about a minute to wake up. Free hours are shared across your workspace's web services. Supabase Free projects may pause after inactivity. No paid database, worker, persistent disk or AI service is required. Usage is subject to each provider's included limits; see [Render Free](https://render.com/docs/free) and [Supabase pricing](https://supabase.com/pricing).
