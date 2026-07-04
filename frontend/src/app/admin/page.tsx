"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  generateAdminInsights,
  getAdminAnalytics,
  type AdminAnalytics,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/ui";

const stockColors = ["#10b981", "#f59e0b", "#ef4444", "#64748b"];

function AdminHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[#131921] text-white shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 font-black text-slate-950">
            a
          </div>
          <div>
            <p className="text-sm font-black leading-none">InstaKart Admin</p>
            <p className="text-[10px] text-slate-300">Business control center</p>
          </div>
        </div>
        <nav className="ml-auto flex items-center gap-1 text-xs font-black sm:gap-2 sm:text-sm">
          <a
            href="/admin"
            className="rounded-lg bg-white/10 px-3 py-2 text-amber-300"
          >
            Dashboard
          </a>
          <a
            href="/admin/inventory"
            className="rounded-lg px-3 py-2 hover:bg-white/10"
          >
            Inventory
          </a>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-600 px-3 py-2 hover:border-amber-400 hover:text-amber-300"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="font-black text-slate-950">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      {empty ? (
        <div className="mt-4 flex h-64 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
          No data available yet.
        </div>
      ) : (
        <div className="mt-4 h-64 w-full min-w-0">{children}</div>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [insightSource, setInsightSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [error, setError] = useState("");
  const [insightsError, setInsightsError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user?.isAdmin) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    Promise.allSettled([getAdminAnalytics(), generateAdminInsights()]).then(
      ([analyticsResult, insightsResult]) => {
        if (cancelled) return;
        if (analyticsResult.status === "fulfilled") {
          setAnalytics(analyticsResult.value.analytics);
        } else {
          setError("Could not load business analytics.");
        }
        if (insightsResult.status === "fulfilled") {
          setInsights(insightsResult.value.insights || []);
          setInsightSource(insightsResult.value.source);
        } else {
          setInsightsError("Could not generate business insights.");
        }
        setLoading(false);
        setInsightsLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  async function refreshInsights() {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const response = await generateAdminInsights();
      setInsights(response.insights || []);
      setInsightSource(response.source);
    } catch {
      setInsightsError("Could not refresh insights. Please try again.");
    } finally {
      setInsightsLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  if (authLoading || !user?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eaeded]">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-slate-900" />
          <p className="mt-3 text-sm font-black text-slate-700">
            Checking administrator access…
          </p>
        </div>
      </main>
    );
  }

  const metricCards = analytics
    ? [
        ["Total products", analytics.totalProducts, "Catalog size", "bg-white"],
        [
          "Available",
          analytics.availableProducts,
          "Ready to purchase",
          "bg-emerald-50",
        ],
        [
          "Out of stock",
          analytics.outOfStockProducts,
          "Needs attention",
          "bg-red-50",
        ],
        [
          "Low stock",
          analytics.lowStockProducts,
          "Fewer than 5 units",
          "bg-amber-50",
        ],
        ["Total orders", analytics.totalOrders, "All recorded orders", "bg-white"],
        [
          "Estimated revenue",
          formatPrice(analytics.estimatedRevenue),
          "From recorded orders",
          "bg-white",
        ],
        [
          "Average order",
          formatPrice(analytics.averageOrderValue),
          "Revenue per order",
          "bg-white",
        ],
        [
          "Top category",
          analytics.topCategories[0]?.category || "—",
          analytics.topCategories[0]
            ? `${analytics.topCategories[0].quantity} units ordered`
            : "No order data yet",
          "bg-amber-50",
        ],
      ]
    : [];

  return (
    <main className="min-h-screen bg-[#eaeded] text-slate-950">
      <AdminHeader onLogout={() => void handleLogout()} />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">
              Business dashboard
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              Store performance at a glance
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Live inventory health and order analytics from DynamoDB.
            </p>
          </div>
          <a
            href="/admin/inventory"
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-center text-sm font-black text-slate-950 hover:bg-amber-300"
          >
            Manage inventory
          </a>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl bg-white/70"
              />
            ))}
          </div>
        ) : analytics ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metricCards.map(([label, value, helper, tone]) => (
                <div
                  key={String(label)}
                  className={`rounded-2xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 truncate text-2xl font-black sm:text-3xl">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{helper}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Inventory by category"
                subtitle="Total units currently held in each category"
                empty={!analytics.inventoryByCategory.length}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.inventoryByCategory.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={55} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="quantity" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Stock status"
                subtitle="Healthy, low, out-of-stock, and disabled products"
                empty={!analytics.stockStatusBreakdown.some((item) => item.value)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.stockStatusBreakdown}
                      dataKey="value"
                      nameKey="status"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {analytics.stockStatusBreakdown.map((item, index) => (
                        <Cell key={item.status} fill={stockColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Orders and revenue trend"
                subtitle="Daily estimated revenue from recorded orders"
                empty={!analytics.revenueTrend.length}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatPrice(Number(value))} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ fill: "#f59e0b" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Top ordered products"
                subtitle="Units ordered across all recorded orders"
                empty={!analytics.topProducts.length}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={analytics.topProducts.slice(0, 6)}
                    margin={{ left: 18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={95}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip />
                    <Bar dataKey="quantity" fill="#0f766e" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-2xl bg-[#232f3e] text-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                AI Business Insights
              </p>
              <h2 className="mt-1 text-xl font-black">
                Actionable inventory signals
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                {insightSource === "bedrock"
                  ? "Generated by Amazon Bedrock from aggregate metrics."
                  : "Safe rule-based analysis is active."}
              </p>
            </div>
            <button
              onClick={() => void refreshInsights()}
              disabled={insightsLoading}
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {insightsLoading ? "Analyzing…" : "Refresh insights"}
            </button>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {insightsLoading ? (
              [1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-xl bg-white/10"
                />
              ))
            ) : insightsError ? (
              <p className="rounded-xl bg-red-500/15 p-4 text-sm text-red-100">
                {insightsError}
              </p>
            ) : insights.length ? (
              insights.map((insight, index) => (
                <article
                  key={`${index}-${insight}`}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-950">
                    {index + 1}
                  </span>
                  <p className="mt-3 text-sm leading-6 text-slate-100">
                    {insight}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">
                No business insights are available yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
