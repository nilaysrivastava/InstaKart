"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BudgetMode,
  type DecisionMode,
  type NowCartItem,
  type NowPlan,
} from "@/lib/api";
import {
  budgetOptions,
  buildDeckFromPlan,
  modeOptions,
  quickPrompts,
  type PreventableEvent,
} from "@/lib/ui";
import { AiCartLoader } from "./AiCartLoader";
import { CartModeComparison } from "./CartModeComparison";
import { CartStage } from "./CartStage";
import { DeckCard } from "./DeckCard";
import { MiniPlanDetails } from "./MiniPlanDetails";
import { SituationTimeline } from "./SituationTimeline";

type LoadingCopy = {
  eyebrow: string;
  title: string;
  lines: string[];
};

const loadingCopies: LoadingCopy[] = [
  {
    eyebrow: "Cart magic in progress",
    title: "Teaching the cart to read the room.",
    lines: [
      "Sorting useful stuff from random stuff.",
      "Asking prices and ETAs to behave.",
      "Keeping the chaos outside your cart.",
    ],
  },
  {
    eyebrow: "Tiny shopping brain active",
    title: "Your cart is doing a quick warm-up.",
    lines: [
      "Stretching the product list.",
      "Running past the irrelevant aisle.",
      "Picking the items that actually make sense.",
    ],
  },
  {
    eyebrow: "Almost there",
    title: "The AI is speed-dating the catalog.",
    lines: [
      "Bad matches are being politely rejected.",
      "Good matches are getting cart-ready.",
      "No unnecessary drama, only useful items.",
    ],
  },
  {
    eyebrow: "Smart cart loading",
    title: "We are assembling the squad.",
    lines: [
      "Essentials first.",
      "Filler products last. Actually, never.",
      "Your future cart is getting organized.",
    ],
  },
  {
    eyebrow: "Hold tight",
    title: "The products are in a group discussion.",
    lines: [
      "Only the useful ones get to speak.",
      "ETA is making its case.",
      "Price is trying to look attractive.",
    ],
  },
  {
    eyebrow: "Kitchen-table science",
    title: "What has aisles but no legs?",
    lines: [
      "Your cart, once it starts walking toward checkout.",
      "We are giving it better direction first.",
      "A useful bundle is on the way.",
    ],
  },
  {
    eyebrow: "Cart detective mode",
    title: "Looking for clues in your situation.",
    lines: [
      "Need detected.",
      "Random products questioned.",
      "Useful items invited to the final list.",
    ],
  },
  {
    eyebrow: "Quick-commerce wizardry",
    title: "No wand, just relevance.",
    lines: [
      "Mixing urgency with usefulness.",
      "Adding a pinch of ETA.",
      "Removing anything that feels suspiciously unnecessary.",
    ],
  },
  {
    eyebrow: "Almost cart o'clock",
    title: "Your items are getting their boarding pass.",
    lines: [
      "Destination: your cart.",
      "Layover: relevance check.",
      "Arrival: very soon.",
    ],
  },
  {
    eyebrow: "Friendly cart audit",
    title: "We are asking every item one question.",
    lines: [
      "Do you actually help here?",
      "If yes, proceed.",
      "If no, thank you for your service.",
    ],
  },
  {
    eyebrow: "Good things loading",
    title: "The cart is avoiding main-character energy.",
    lines: [
      "No random snacks unless the moment deserves them.",
      "No speed winners without usefulness.",
      "Just a cleaner, smarter cart.",
    ],
  },
  {
    eyebrow: "Tiny riddle break",
    title: "What gets filled but never complains?",
    lines: [
      "A cart with relevant items.",
      "We are working on that exact thing.",
      "One smart bundle coming up.",
    ],
  },
];

export function AssistPanel({
  open,
  onClose,
  userRequest,
  setUserRequest,
  budgetMode,
  setBudgetMode,
  decisionMode,
  setDecisionMode,
  panicMode,
  setPanicMode,
  onGenerate,
  isGenerating,
  plan,
  deckItems,
  onAddDeckItem,
  onSkipDeckItem,
  onOpenCart,
  onRefine,
  error,
}: {
  open: boolean;
  onClose: () => void;
  userRequest: string;
  setUserRequest: (value: string) => void;
  budgetMode: BudgetMode;
  setBudgetMode: (value: BudgetMode) => void;
  decisionMode: DecisionMode;
  setDecisionMode: (value: DecisionMode) => void;
  panicMode: boolean;
  setPanicMode: (value: boolean) => void;
  onGenerate: (event?: PreventableEvent) => void;
  isGenerating: boolean;
  plan: NowPlan | null;
  deckItems: NowCartItem[];
  onAddDeckItem: () => void;
  onSkipDeckItem: () => void;
  onOpenCart: () => void;
  onRefine: (instruction: string) => Promise<void>;
  error: string;
}) {
  const [followUp, setFollowUp] = useState("");

  const wasGeneratingRef = useRef(false);

  const [loadingCopyIndex, setLoadingCopyIndex] = useState(0);

  async function handleRefineSubmit(event: PreventableEvent) {
    event.preventDefault();
    const instruction = followUp.trim();
    if (!instruction) return;
    await onRefine(instruction);
    setFollowUp("");
  }

  if (!open) return null;

  const topItem = deckItems[0];
  const totalDeckItems = plan
    ? buildDeckFromPlan(plan, decisionMode).length
    : 0;
  const currentIndex = Math.max(0, totalDeckItems - deckItems.length);
  const loadingCopy = loadingCopies[loadingCopyIndex] || loadingCopies[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 p-0 sm:p-2 md:p-4">
      <div className="mx-auto flex h-dvh max-w-6xl flex-col overflow-hidden rounded-none bg-[#eaeded] shadow-2xl sm:h-[calc(100vh-16px)] sm:rounded-2xl md:h-[calc(100vh-32px)]">
        <div className="flex items-center justify-between bg-[#131921] px-4 py-3 text-white">
          <div>
            <p className="text-base font-black">Instant Cart</p>
            <p className="text-xs text-slate-300">
              Describe the situation. Add what you need.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-slate-600 px-3 py-1.5 text-sm font-black"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 items-stretch gap-3 overflow-y-auto p-2 sm:gap-4 sm:p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="flex h-full min-w-0 flex-col rounded-2xl bg-white p-4 shadow-sm lg:min-h-full">
            <form
              onSubmit={onGenerate}
              className="flex h-full min-w-0 flex-col justify-center"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">
                    Tell us what happened
                  </p>
                  <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950">
                    What do you need?
                  </h2>
                </div>

                <label className="flex cursor-pointer items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-700">
                  <input
                    type="checkbox"
                    checked={panicMode}
                    onChange={(event) => setPanicMode(event.target.checked)}
                    className="accent-red-600"
                  />
                  Urgent
                </label>
              </div>

              <textarea
                value={userRequest}
                onChange={(event) => setUserRequest(event.target.value)}
                rows={3}
                className="mt-2 min-h-8 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm font-medium outline-none focus:border-amber-400 focus:bg-white"
                placeholder="Tell us your need 😊"
              />

              <div className="mt-1 flex-col items-center justify-center">
                <p className="mb-2 text-xs font-black uppercase text-slate-500">
                  Try
                </p>
                <div className="flex flex-col gap-1">
                  {quickPrompts.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => setUserRequest(prompt)}
                      className="rounded-full max-w-xs border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 hover:bg-amber-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    Budget
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {budgetOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setBudgetMode(option.value)}
                        className={`rounded-lg border px-2 py-2 text-xs font-black ${
                          budgetMode === option.value
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    Prefer
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {modeOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setDecisionMode(option.value)}
                        className={`rounded-lg border px-2 py-2 text-left ${
                          decisionMode === option.value
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="text-xs font-black text-slate-950">
                          {option.label}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {option.helper}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error ? (
                <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isGenerating}
                className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-70"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    Building your cart
                  </span>
                ) : (
                  "Create instant cart"
                )}
              </button>
            </form>
          </section>

          <section
            className={
              plan && !isGenerating
                ? "grid h-full min-h-[520px] min-w-0 gap-4 rounded-2xl bg-white p-3 shadow-sm sm:min-h-[620px] sm:p-4 lg:min-h-full xl:grid-cols-[minmax(0,1fr)_300px]"
                : "flex h-full min-h-[520px] min-w-0 flex-col items-center justify-center gap-4 rounded-2xl bg-white p-3 shadow-sm sm:min-h-[620px] sm:p-4 lg:min-h-full xl:flex-row"
            }
          >
            <div
              className={
                plan && !isGenerating
                  ? "flex min-w-0 flex-col justify-center py-2 sm:min-h-[430px] sm:py-0"
                  : "flex w-full min-w-0 max-w-xl flex-col justify-center py-2 sm:py-0"
              }
            >
              {plan && !isGenerating ? (
                <div className="mx-auto mb-4 w-full max-w-sm min-w-0">
                  <CartModeComparison
                    plan={plan}
                    selectedMode={decisionMode}
                    onSelectMode={setDecisionMode}
                  />
                </div>
              ) : null}

              <CartStage
                stageKey={isGenerating ? "loading" : plan?.planId || "empty"}
              >
                {isGenerating ? (
                  <AiCartLoader />
                ) : !plan ? (
                  <div className="mx-auto w-full max-w-md rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
                      🛒
                    </div>
                    <h3 className="mt-4 text-xl font-black text-slate-950">
                      Your instant cart appears here
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Describe the situation on the left and review each item
                      one by one.
                    </p>
                  </div>
                ) : topItem ? (
                  <div className="min-w-0">
                    <div className="mx-auto mb-4 flex w-full max-w-sm items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          Instant Cart
                        </p>
                        <h3 className="text-lg font-black text-slate-950">
                          {plan.cartModes[decisionMode]?.cartTitle ||
                            "Recommended items"}
                        </h3>
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                        {deckItems.length} left
                      </span>
                    </div>

                    <DeckCard
                      item={topItem}
                      index={currentIndex}
                      total={totalDeckItems}
                      onAdd={onAddDeckItem}
                      onSkip={onSkipDeckItem}
                      disabled={isGenerating}
                    />
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-md rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
                    <div className="text-4xl">✅</div>
                    <h3 className="mt-3 text-xl font-black text-emerald-900">
                      All items reviewed
                    </h3>
                    <p className="mt-2 text-sm text-emerald-800">
                      Your selected items are waiting in the cart.
                    </p>
                    <button
                      onClick={onOpenCart}
                      className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800"
                    >
                      Open cart
                    </button>
                  </div>
                )}
              </CartStage>

              {plan && !isGenerating ? (
                <form
                  onSubmit={handleRefineSubmit}
                  className="mx-auto mt-4 flex w-full max-w-sm gap-2"
                >
                  <input
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    placeholder='Update cart, e.g. "make it for 6"'
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={isGenerating || !followUp.trim()}
                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
                  >
                    Update
                  </button>
                </form>
              ) : null}
            </div>

            <div
              className={
                plan && !isGenerating
                  ? "min-w-0"
                  : "flex w-full min-w-0 max-w-sm items-center py-2 sm:py-0"
              }
            >
              {plan && !isGenerating ? (
                <>
                  <div className="mb-3 w-full min-w-0">
                    <SituationTimeline plan={plan} />
                  </div>
                  <div className="w-full min-w-0">
                    <MiniPlanDetails plan={plan} />
                  </div>
                </>
              ) : isGenerating ? (
                <div className="w-full rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                    {loadingCopy.eyebrow}
                  </p>

                  <p className="mt-2 text-sm font-black leading-5 text-slate-800">
                    {loadingCopy.title}
                  </p>

                  <div className="mt-3 space-y-2">
                    {loadingCopy.lines.map((line, index) => (
                      <div key={line} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950">
                          {index + 1}
                        </span>
                        <p className="text-xs font-semibold leading-5 text-slate-700">
                          {line}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    How it works
                  </p>
                  <div className="mt-3 space-y-3">
                    {[
                      "Describe the situation",
                      "Review suggested items",
                      "Add useful items to cart",
                    ].map((text, index) => (
                      <div key={text} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-950">
                          {index + 1}
                        </span>
                        <p className="text-sm font-bold text-slate-700">
                          {text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
