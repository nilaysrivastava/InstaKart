"use client";

import { useEffect, useMemo, useState } from "react";
import { AssistPanel } from "@/components/AssistPanel";
import { CartDrawer } from "@/components/CartDrawer";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { OrdersDrawer } from "@/components/OrdersDrawer";
import { ProductShelf } from "@/components/ProductShelf";
import {
  checkoutNowOrder,
  generateNowPlan,
  getHealth,
  getNowOrders,
  getNowProducts,
  sendNowFeedback,
  type BudgetMode,
  type DecisionMode,
  type NowCartItem,
  type NowOrder,
  type NowPlan,
} from "@/lib/api";
import {
  buildDeckFromPlan,
  categoryMatches,
  DEMO_USER_ID,
  formatPrice,
  getCartCount,
  getCartEta,
  getCartTotal,
  type PreventableEvent,
  type StoreProduct,
} from "@/lib/ui";

export default function Home() {
  const [healthStatus, setHealthStatus] = useState("Checking");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<NowOrder[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const [assistOpen, setAssistOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const [userRequest, setUserRequest] = useState("Finger cut while cooking");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("balanced");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("fastest");
  const [panicMode, setPanicMode] = useState(true);

  const [plan, setPlan] = useState<NowPlan | null>(null);
  const [deckItems, setDeckItems] = useState<NowCartItem[]>([]);
  const [cartItems, setCartItems] = useState<NowCartItem[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const searchable = `${product.name} ${product.category || ""} ${
        product.aisle || ""
      } ${(product.tags || []).join(" ")}`.toLowerCase();

      const matchesSearch = query ? searchable.includes(query) : true;
      const matchesCategory = categoryMatches(product, activeCategory);

      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const productsByAisle = useMemo(() => {
    const grouped = new Map<string, StoreProduct[]>();

    filteredProducts.forEach((product) => {
      const key = product.aisle || product.category || "Amazon Now";
      const existing = grouped.get(key) || [];
      grouped.set(key, [...existing, product]);
    });

    return Array.from(grouped.entries());
  }, [filteredProducts]);

  const cartTotal = getCartTotal(cartItems);
  const cartCount = getCartCount(cartItems);
  const cartEta = getCartEta(cartItems);

  async function loadInitialData() {
    try {
      const [health, productResponse, orderResponse] = await Promise.all([
        getHealth(),
        getNowProducts(),
        getNowOrders(DEMO_USER_ID).catch(() => ({
          success: true,
          count: 0,
          orders: [],
        })),
      ]);

      setHealthStatus(health?.success ? "Live" : "Offline");

      const productList = productResponse.products || [];

      productList.sort((a, b) => {
        return (a.etaMinutes || 99) - (b.etaMinutes || 99);
      });

      setProducts(productList);
      setOrders(orderResponse.orders || []);
    } catch (err) {
      console.error(err);
      setHealthStatus("Offline");
    }
  }

  useEffect(() => {
    loadInitialData();

    const sharedCart = new URLSearchParams(window.location.search).get(
      "sharedCart"
    );
    if (sharedCart) {
      try {
        const decoded = JSON.parse(window.atob(sharedCart)) as {
          userRequest?: string;
          cartItems?: NowCartItem[];
        };

        if (decoded.cartItems?.length) {
          setCartItems(decoded.cartItems);
          setUserRequest(decoded.userRequest || "Shared Amazon Now cart");
          setCartOpen(true);
        }
      } catch (err) {
        console.warn("Could not open shared cart", err);
      }
    }
  }, []);

  function addItemsToCart(itemsToAdd: NowCartItem[]) {
    if (!itemsToAdd.length) return;

    setCartItems((current) => {
      const merged = [...current];

      itemsToAdd.forEach((item) => {
        const existingIndex = merged.findIndex(
          (cartItem) => cartItem.productId === item.productId
        );

        if (existingIndex >= 0) {
          const existing = merged[existingIndex];

          merged[existingIndex] = {
            ...existing,
            quantity:
              Number(existing.quantity || 1) + Number(item.quantity || 1),
            etaMinutes: Math.min(
              Number(existing.etaMinutes || item.etaMinutes || 0),
              Number(item.etaMinutes || existing.etaMinutes || 0)
            ),
          };
          return;
        }

        merged.push({
          ...item,
          quantity: Number(item.quantity || 1),
        });
      });

      return merged;
    });
  }

  function addToCart(item: NowCartItem) {
    addItemsToCart([item]);
  }

  function removeFromCart(productId: string) {
    setCartItems((current) =>
      current.filter((item) => item.productId !== productId)
    );
  }

  function clearCart() {
    setCartItems([]);
    setCheckoutMessage("");
  }

  async function handleReorderOrder(order: NowOrder) {
    const selectedMode = (order.selectedMode ||
      order.plan?.recommendedMode ||
      "fastest") as DecisionMode;
    const selectedCart = order.plan?.cartModes?.[selectedMode];
    const reorderItems = selectedCart?.items || [];

    if (!reorderItems.length) return;

    setPlan(order.plan);
    setDecisionMode(selectedMode);
    setUserRequest(order.plan?.userRequest || "Reordered Amazon Now cart");
    setCheckoutMessage(
      `${reorderItems.length} items added from your previous order.`
    );
    addItemsToCart(reorderItems);
    setOrdersOpen(false);
    setCartOpen(true);

    await sendNowFeedback({
      userId: DEMO_USER_ID,
      planId: order.plan?.planId,
      action: "reordered_order",
      selectedMode,
      note: `Reordered ${reorderItems.length} items from order ${order.id}.`,
    }).catch(() => null);
  }

  function openInstantCartWithPrompt(prompt?: string) {
    if (prompt) {
      setUserRequest(prompt);
    }

    setAssistOpen(true);
  }

  function handleDecisionModeChange(mode: DecisionMode) {
    setDecisionMode(mode);

    if (plan) {
      setDeckItems(buildDeckFromPlan(plan, mode));
    }
  }

  async function handleGenerate(event?: PreventableEvent) {
    event?.preventDefault();

    const trimmed = userRequest.trim();

    if (!trimmed) {
      setError("Describe what you need.");
      return;
    }

    setError("");
    setCheckoutMessage("");
    setIsGenerating(true);

    try {
      const response = await generateNowPlan({
        userId: DEMO_USER_ID,
        userRequest: trimmed,
        budgetMode,
        decisionMode,
        panicMode,
      });

      setPlan(response.plan);
      setDeckItems(buildDeckFromPlan(response.plan, decisionMode));

      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: response.plan.planId,
        action: "generated_recommendation_deck",
        selectedMode: decisionMode,
        note: trimmed,
      }).catch(() => null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create cart.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAddDeckItem() {
    const item = deckItems[0];
    if (!item) return;

    addToCart(item);
    setDeckItems((current) => current.slice(1));

    if (plan) {
      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: plan.planId,
        action: "added_to_cart",
        productId: item.productId,
        productName: item.name,
        selectedMode: decisionMode,
        note: "Added from instant cart.",
      }).catch(() => null);
    }
  }

  async function handleSkipDeckItem() {
    const item = deckItems[0];
    if (!item) return;

    setDeckItems((current) => current.slice(1));

    if (plan) {
      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: plan.planId,
        action: "skipped_recommendation",
        productId: item.productId,
        productName: item.name,
        selectedMode: decisionMode,
        note: "Skipped from instant cart.",
      }).catch(() => null);
    }
  }

  function buildCheckoutPlan(): NowPlan {
    const now = new Date().toISOString();

    if (plan) {
      return {
        ...plan,
        checkoutSummary: {
          ...plan.checkoutSummary,
          estimatedTotal: cartTotal,
          itemCount: cartCount,
          etaMinutes: cartEta,
        },
        cartModes: {
          ...plan.cartModes,
          [decisionMode]: {
            ...plan.cartModes[decisionMode],
            items: cartItems,
            etaMinutes: cartEta,
            cartTitle: "Selected cart",
          },
        },
      };
    }

    return {
      planId: `manual_${Date.now()}`,
      userRequest: "Manual Amazon Now cart",
      needCategory: "manual_cart",
      urgencyLabel: "Medium",
      urgencyScore: 50,
      urgencyReason: "Customer selected products manually.",
      peopleCount: 1,
      timeContext: {
        timeOfDay: "current",
        reason: "Manual storefront order.",
      },
      budgetMode,
      panicMode: false,
      recommendedMode: decisionMode,
      cartModes: {
        fastest: {
          modeLabel: "Fastest",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
        bestValue: {
          modeLabel: "Best Value",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
        mostComplete: {
          modeLabel: "Most Complete",
          etaMinutes: cartEta,
          cartTitle: "Manual Cart",
          items: cartItems,
          modeReason: "Customer selected these items manually.",
        },
      },
      regretPrevention: [],
      substitutions: [],
      confidence: {
        overall: 80,
        needMatch: 80,
        availabilityFit: 85,
        budgetFit: 80,
        completeness: 75,
        reason: "Manual cart created from storefront selections.",
      },
      aiExplanation:
        "This order was created from manual Amazon Now selections.",
      checkoutSummary: {
        estimatedTotal: cartTotal,
        itemCount: cartCount,
        etaMinutes: cartEta,
        oneTapMessage: "Checkout your selected Amazon Now cart.",
      },
      metrics: {
        estimatedTimeToCartSeconds: 0,
        decisionsReducedFrom: cartCount,
        decisionsReducedTo: cartCount,
        forgottenEssentialsPrevented: 0,
      },
      userId: DEMO_USER_ID,
      generatedAt: now,
      modelId: "manual",
    };
  }

  async function handleRefineCart(instruction: string) {
    if (!plan || !instruction.trim()) return;

    setError("");
    setIsGenerating(true);

    try {
      const currentCart = plan.cartModes[decisionMode]?.items || [];
      const response = await generateNowPlan({
        userId: DEMO_USER_ID,
        userRequest: plan.userRequest || userRequest,
        budgetMode,
        decisionMode,
        panicMode,
        refinementContext: {
          originalRequest: plan.userRequest,
          currentNeedCategory: plan.needCategory,
          currentPeopleCount: plan.peopleCount,
          currentCartItems: currentCart.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            etaMinutes: item.etaMinutes,
          })),
          instruction: instruction.trim(),
        },
      });

      setPlan(response.plan);
      setDeckItems(buildDeckFromPlan(response.plan, decisionMode));

      await sendNowFeedback({
        userId: DEMO_USER_ID,
        planId: response.plan.planId,
        action: "refined_cart",
        selectedMode: decisionMode,
        note: instruction.trim(),
      }).catch(() => null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to update cart.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShareCart() {
    if (!cartItems.length) return;

    const payload = window.btoa(
      JSON.stringify({
        userRequest:
          plan?.userRequest || userRequest || "Shared Amazon Now cart",
        cartItems,
      })
    );

    const shareUrl = `${window.location.origin}${window.location.pathname}?sharedCart=${payload}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Amazon Now cart",
          text: "Here is an Amazon Now cart you can review.",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCheckoutMessage("Cart link copied.");
      }
    } catch (err) {
      await navigator.clipboard.writeText(shareUrl).catch(() => null);
      setCheckoutMessage("Cart link copied.");
    }
  }

  async function handleCheckout() {
    if (!cartItems.length) return;

    setIsCheckingOut(true);
    setCheckoutMessage("");
    setError("");

    try {
      const checkoutPlan = buildCheckoutPlan();

      const response = await checkoutNowOrder({
        userId: DEMO_USER_ID,
        plan: checkoutPlan,
        selectedMode: decisionMode,
      });

      setCheckoutMessage(response.message || "Order placed successfully.");

      const orderResponse = await getNowOrders(DEMO_USER_ID);
      setOrders(orderResponse.orders || []);

      setCartItems([]);
      setCartOpen(false);
      setOrdersOpen(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eaeded] text-slate-950">
      <Header
        search={search}
        setSearch={setSearch}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        ordersLength={orders.length}
        cartCount={cartCount}
        onOpenOrders={() => setOrdersOpen(true)}
        onOpenCart={() => setCartOpen(true)}
      />

      <div className="mx-auto max-w-7xl px-4 py-5">
        <Hero
          healthStatus={healthStatus}
          onOpenInstantCart={openInstantCartWithPrompt}
        />

        <ProductShelf productsByAisle={productsByAisle} onAdd={addToCart} />
      </div>

      <Footer healthStatus={healthStatus} />

      {cartItems.length ? (
        <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-8px_25px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                {cartCount} items · {formatPrice(cartTotal)}
              </p>
              <p className="text-xs text-slate-500">
                Estimated delivery {cartEta} min
              </p>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300"
            >
              View cart
            </button>
          </div>
        </div>
      ) : null}

      <AssistPanel
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        userRequest={userRequest}
        setUserRequest={setUserRequest}
        budgetMode={budgetMode}
        setBudgetMode={setBudgetMode}
        decisionMode={decisionMode}
        setDecisionMode={handleDecisionModeChange}
        panicMode={panicMode}
        setPanicMode={setPanicMode}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        plan={plan}
        deckItems={deckItems}
        onAddDeckItem={handleAddDeckItem}
        onSkipDeckItem={handleSkipDeckItem}
        onOpenCart={() => {
          setAssistOpen(false);
          setCartOpen(true);
        }}
        onRefine={handleRefineCart}
        error={error}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onRemove={removeFromCart}
        onClearCart={clearCart}
        onCheckout={handleCheckout}
        onShare={handleShareCart}
        isCheckingOut={isCheckingOut}
        checkoutMessage={checkoutMessage}
      />

      <OrdersDrawer
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        orders={orders}
        onReorder={handleReorderOrder}
      />
    </main>
  );
}
