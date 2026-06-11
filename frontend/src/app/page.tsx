"use client";

import { FormEvent, useEffect, useState } from "react";
import { askBedrock, createItem, getHealth, getItems, Item } from "@/lib/api";

const features = [
  {
    title: "Customer-Obsessed Workflow",
    description:
      "A clean end-to-end experience designed around the real user problem, not just the technology.",
  },
  {
    title: "Scalable Serverless Core",
    description:
      "Powered by AWS Lambda, API Gateway, DynamoDB, and secure cloud-native expansion.",
  },
  {
    title: "AI-Ready Architecture",
    description:
      "Prepared for Amazon Bedrock-powered intelligence, recommendations, summaries, and automation.",
  },
];

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [healthStatus, setHealthStatus] = useState("Checking...");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  async function loadData() {
    try {
      setError("");
      setIsLoading(true);

      const [health, liveItems] = await Promise.all([getHealth(), getItems()]);

      setHealthStatus(health?.success ? "Live" : "Degraded");
      setItems(liveItems);
    } catch (err) {
      console.error(err);
      setHealthStatus("Offline");
      setError("Unable to reach backend. Check API URL or deployed Lambda.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    try {
      setError("");
      setIsCreating(true);

      await createItem({
        title,
        description,
        status: "active",
      });

      setTitle("");
      setDescription("");
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Failed to create item.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAskBedrock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!question.trim()) {
      setError("Question is required.");
      return;
    }

    try {
      setError("");
      setIsAsking(true);
      setAnswer("");

      const result = await askBedrock(question);
      setAnswer(result.answer);
    } catch (err) {
      console.error(err);
      setError("Failed to get Bedrock answer.");
    } finally {
      setIsAsking(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff9900] font-bold text-slate-950">
              H6
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">HackOn 6.0</p>
              <p className="text-xs text-slate-500">
                AWS-powered prototype base
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-950">
              Features
            </a>
            <a href="#live-demo" className="hover:text-slate-950">
              Live Demo
            </a>
            <a href="#architecture" className="hover:text-slate-950">
              Architecture
            </a>
          </div>

          <div className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">
            Backend: {healthStatus}
          </div>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700">
            Built with Customer Obsession, Ownership, and Bias for Action
          </div>

          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">
            A scalable AWS-first solution base for HackOn 6.0.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            This prototype already has a live Next.js frontend, AWS Lambda APIs,
            API Gateway routing, and DynamoDB persistence. Once the problem
            statement arrives, we will adapt this into the final winning
            workflow.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#live-demo"
              className="rounded-xl bg-[#ff9900] px-6 py-3 text-center font-semibold text-slate-950 shadow-sm transition hover:bg-[#f3a21b]"
            >
              Test Live Workflow
            </a>
            <a
              href="#architecture"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              View Architecture
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Frontend", value: "Next.js" },
              { label: "Backend", value: "Lambda" },
              { label: "Database", value: "DynamoDB" },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-2xl font-bold text-slate-950">
                  {metric.value}
                </p>
                <p className="mt-1 text-sm text-slate-500">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="rounded-2xl bg-linear-to-br from-slate-950 via-slate-800 to-slate-700 p-6 text-white">
            <div className="mb-8 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-300">
                System Status
              </p>
              <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                {healthStatus}
              </span>
            </div>

            <div className="space-y-4">
              {[
                "Next.js frontend initialized",
                "AWS CLI configured",
                "Lambda API deployed",
                "DynamoDB persistence working",
                "Ready for Bedrock AI layer",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl bg-white/10 p-4"
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-[#ff9900]" />
                  <span className="text-sm text-slate-100">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="live-demo" className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={handleCreateItem}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
              Live DynamoDB Test
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Create a workflow item
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              This form sends data to API Gateway, triggers Lambda, and stores
              the item in DynamoDB.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Validate user journey"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#ff9900] focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what this workflow item represents."
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#ff9900] focus:ring-4 focus:ring-orange-100"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <button
                disabled={isCreating}
                className="w-full rounded-xl bg-[#ff9900] px-6 py-3 font-semibold text-slate-950 shadow-sm transition hover:bg-[#f3a21b] disabled:opacity-60"
              >
                {isCreating ? "Creating..." : "Create Item"}
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
                  Stored Items
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  Live records from DynamoDB
                </h2>
              </div>

              <button
                onClick={loadData}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-slate-500">
                  Loading records...
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-slate-500">
                  No items yet. Create one from the form.
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {item.title}
                        </h3>
                        <p className="mt-2 leading-7 text-slate-600">
                          {item.description || "No description provided."}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-4 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="ask-bedrock" className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={handleAskBedrock}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
              Amazon Bedrock Test
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Ask the AI Architect
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              This sends your question to API Gateway, triggers Lambda, and
              invokes Amazon Bedrock Nova Micro.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Question
                </label>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Example: What AWS architecture should we use for a scalable hackathon prototype?"
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#ff9900] focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <button
                disabled={isAsking}
                className="w-full rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isAsking ? "Asking Bedrock..." : "Ask Bedrock"}
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
              AI Response
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Nova Micro answer
            </h2>

            <div className="mt-6 rounded-2xl bg-slate-50 p-5 leading-8 text-slate-700">
              {isAsking ? (
                "Generating answer..."
              ) : answer ? (
                <p className="whitespace-pre-line">{answer}</p>
              ) : (
                "Ask a question to test Amazon Bedrock integration."
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
            Prototype Principles
          </p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            Designed to impress judges and stay buildable in 48 hours.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 h-12 w-12 rounded-2xl bg-orange-100" />
              <h3 className="text-lg font-bold text-slate-950">
                {feature.title}
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="architecture" className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#ff9900]">
            Live Architecture
          </p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            Next.js → API Gateway → Lambda → DynamoDB
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-slate-600">
            The current implementation already uses a deployed AWS serverless
            backend and persistent database. Tomorrow, we will map the final
            problem statement onto this working base and add the right AI,
            analytics, auth, or workflow features.
          </p>
        </div>
      </section>

      <footer className="mt-12 border-t border-slate-200 bg-white px-6 py-6 text-center text-sm text-slate-500">
        HackOn 6.0 Prototype Base · Built for speed, scale, and customer impact
      </footer>
    </main>
  );
}
