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

type VoiceRecognitionAlternative = {
  transcript: string;
};

type VoiceRecognitionResult = ArrayLike<VoiceRecognitionAlternative> & {
  isFinal?: boolean;
};

type VoiceRecognitionResultEvent = {
  results: ArrayLike<VoiceRecognitionResult>;
};

type VoiceRecognitionErrorEvent = {
  error?: string;
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null;
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;

type VoiceRecognitionWindow = Window & {
  SpeechRecognition?: VoiceRecognitionConstructor;
  webkitSpeechRecognition?: VoiceRecognitionConstructor;
};

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

  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");

  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const voiceWindow = window as VoiceRecognitionWindow;
    setVoiceSupported(
      Boolean(
        voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition
      )
    );

    return () => {
      shouldKeepListeningRef.current = false;

      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [open]);

  useEffect(() => {
    if (!isGenerating) return;

    shouldKeepListeningRef.current = false;

    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceMessage("");
  }, [isGenerating]);

  function stopVoiceInput() {
    shouldKeepListeningRef.current = false;

    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceMessage("");
  }

  function createVoiceRecognition() {
    const voiceWindow = window as VoiceRecognitionWindow;
    const Recognition =
      voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceMessage("Voice input is not available in this browser.");
      return null;
    }

    const recognition = new Recognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceMessage("Listening...");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || "";

        if (result?.isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += `${transcript} `;
        }
      }

      const spokenText = `${finalText}${interimText}`.trim();

      if (spokenText) {
        setUserRequest(spokenText);
        setVoiceMessage("Listening. Tap stop when done.");
      }
    };

    recognition.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        shouldKeepListeningRef.current = false;
        setIsListening(false);
        setVoiceMessage("Microphone permission is blocked.");
        recognitionRef.current = null;
        return;
      }

      if (event.error === "no-speech") {
        setVoiceMessage("Listening. Speak clearly.");
        return;
      }

      setVoiceMessage("Could not capture voice. Try again.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (!shouldKeepListeningRef.current || isGenerating) {
        setIsListening(false);
        return;
      }

      restartTimerRef.current = window.setTimeout(() => {
        if (!shouldKeepListeningRef.current || isGenerating) return;

        const nextRecognition = createVoiceRecognition();
        if (!nextRecognition) return;

        recognitionRef.current = nextRecognition;

        try {
          nextRecognition.start();
        } catch {
          setIsListening(false);
          setVoiceMessage("Voice input stopped. Tap again to retry.");
        }
      }, 300);
    };

    return recognition;
  }

  function handleVoiceInput() {
    if (typeof window === "undefined") return;

    if (isListening) {
      stopVoiceInput();
      return;
    }

    setUserRequest("");
    setVoiceMessage("");
    shouldKeepListeningRef.current = true;

    const recognition = createVoiceRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      shouldKeepListeningRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceMessage("Voice input could not start. Try again.");
    }
  }

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

        <div className="grid flex-1 items-start gap-3 overflow-y-auto p-2 sm:gap-4 sm:p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <form
            onSubmit={onGenerate}
            className="rounded-2xl bg-white p-4 shadow-sm"
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
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm font-medium outline-none focus:border-amber-400 focus:bg-white"
              placeholder="Example: I cut my finger while chopping vegetables"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={!voiceSupported || isGenerating}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-black transition ${
                  isListening
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-amber-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isListening ? "■ Stop voice" : "🎙 Use voice"}
              </button>

              {voiceMessage ? (
                <p className="min-w-0 flex-1 truncate text-right text-[10px] font-bold text-slate-500">
                  {voiceMessage}
                </p>
              ) : null}
            </div>

            <div className="mt-1">
              <p className="mb-2 text-xs font-black uppercase text-slate-500">
                Try
              </p>
              <div className="flex flex-col gap-1">
                {quickPrompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => setUserRequest(prompt)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 hover:bg-amber-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="mb-1 text-xs font-black uppercase text-slate-500">
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
                <p className="mb-1 text-xs font-black uppercase text-slate-500">
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

          <section className="grid min-w-0 gap-4 h-full rounded-2xl bg-white p-3 shadow-sm sm:p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col justify-center py-2 sm:min-h-[430px] sm:py-0">
              {plan ? (
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

              {plan ? (
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
                plan
                  ? "min-w-0"
                  : "flex min-w-0 items-center py-2 sm:min-h-[430px] sm:py-0"
              }
            >
              {plan ? (
                <>
                  <div className="mb-3 w-full min-w-0">
                    <SituationTimeline plan={plan} />
                  </div>
                  <div className="w-full min-w-0">
                    <MiniPlanDetails plan={plan} />
                  </div>
                </>
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
