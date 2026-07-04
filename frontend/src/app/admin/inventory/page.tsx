"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAdminProduct,
  deleteAdminProduct,
  getAdminInventory,
  updateAdminProduct,
  type AdminProductInput,
  type NowProduct,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice, productEmoji } from "@/lib/ui";

type ProductForm = Omit<AdminProductInput, "tags"> & { tags: string };

const emptyForm: ProductForm = {
  id: "",
  name: "",
  category: "",
  description: "",
  price: 0,
  quantity: 0,
  imageUrl: "",
  etaMinutes: 10,
  storeLocation: "",
  tags: "",
  isAvailable: true,
};

const defaultCategories = [
  "Grocery",
  "Snacks",
  "Beverages",
  "Health",
  "Personal Care",
  "Household",
  "Electronics",
  "Baby Care",
  "Pet Care",
  "Stationery",
];

function ProductEditor({
  product,
  onClose,
  onSave,
  saving,
  categories,
}: {
  product: NowProduct | null;
  onClose: () => void;
  onSave: (input: AdminProductInput) => Promise<void>;
  saving: boolean;
  categories: string[];
}) {
  const [form, setForm] = useState<ProductForm>(() =>
    product
      ? {
          id: product.id,
          name: product.name,
          category: product.category || "",
          description: product.description || "",
          price: Number(product.price || 0),
          quantity: Number(product.quantity || 0),
          imageUrl: product.imageUrl || "",
          etaMinutes: Number(product.etaMinutes || 0),
          storeLocation: product.storeLocation || "",
          tags: (product.tags || []).join(", "),
          isAvailable:
            product.isAvailable !== false && product.available !== false,
        }
      : emptyForm
  );
  const [error, setError] = useState("");

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    const category = form.category.trim();

    if (!name || !category) {
      setError("Name and category are required.");
      return;
    }
    if (form.price < 0 || form.quantity < 0 || form.etaMinutes < 0) {
      setError("Price, quantity, and ETA cannot be negative.");
      return;
    }

    setError("");
    try {
      await onSave({
        ...form,
        id: form.id?.trim() || undefined,
        name,
        category,
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
        storeLocation: form.storeLocation.trim(),
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save product."
      );
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="h-1.5 bg-gradient-to-r from-amber-300 to-orange-500" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {product ? "Edit product" : "Add product"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Changes update the customer catalog and AI inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1 text-xl text-slate-500 hover:bg-slate-100"
              aria-label="Close product editor"
            >
              ×
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {!product ? (
              <label className="text-sm font-bold text-slate-700">
                Product ID <span className="font-normal text-slate-400">(optional)</span>
                <input
                  value={form.id}
                  onChange={(event) => update("id", event.target.value)}
                  className={inputClass}
                  placeholder="Generated automatically if blank"
                />
              </label>
            ) : null}
            <label className="text-sm font-bold text-slate-700">
              Name *
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Category *
              <select
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                className={inputClass}
              >
                <option value="">Select category</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => update("price", Number(event.target.value))}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Quantity
              <input
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={(event) =>
                  update("quantity", Number(event.target.value))
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              ETA minutes
              <input
                type="number"
                min="0"
                step="1"
                value={form.etaMinutes}
                onChange={(event) =>
                  update("etaMinutes", Number(event.target.value))
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Store location
              <input
                value={form.storeLocation}
                onChange={(event) =>
                  update("storeLocation", event.target.value)
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Image URL
              <input
                type="url"
                value={form.imageUrl}
                onChange={(event) => update("imageUrl", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Tags <span className="font-normal text-slate-400">(comma separated)</span>
              <input
                value={form.tags}
                onChange={(event) => update("tags", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold text-slate-700 sm:col-span-2">
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(event) => update("isAvailable", event.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            Product is available for purchase
          </label>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-black text-slate-700"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {saving ? "Saving…" : product ? "Save changes" : "Add product"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AdminInventoryPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<NowProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [availability, setAvailability] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<NowProduct | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.isAdmin) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    getAdminInventory()
      .then((response) => {
        if (cancelled) return;
        setProducts(response.products || []);
        setError("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load inventory."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(products.map((product) => product.category).filter(Boolean))
      ).sort(),
    ],
    [products]
  );
  const editorCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...defaultCategories,
          ...products
            .map((product) => product.category)
            .filter((item): item is string => Boolean(item)),
        ])
      ).sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !query ||
        `${product.name} ${product.category} ${(product.tags || []).join(" ")}`
          .toLowerCase()
          .includes(query);
      const matchesCategory =
        category === "All" || product.category === category;
      const quantity = Number(product.quantity || 0);
      const enabled =
        product.available !== false && product.isAvailable !== false;
      const matchesAvailability =
        availability === "all" ||
        (availability === "available" && enabled && quantity >= 5) ||
        (availability === "low" &&
          enabled &&
          quantity > 0 &&
          quantity < 5) ||
        (availability === "out" && quantity === 0) ||
        (availability === "disabled" && !enabled);
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [availability, category, products, search]);

  async function saveProduct(input: AdminProductInput) {
    setSaving(true);
    setError("");
    try {
      const response = editingProduct
        ? await updateAdminProduct(editingProduct.id, input)
        : await createAdminProduct(input);
      setProducts((current) => {
        const withoutSaved = current.filter(
          (product) => product.id !== response.product.id
        );
        return [response.product, ...withoutSaved];
      });
      setEditorOpen(false);
      setEditingProduct(null);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not save product.";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(product: NowProduct) {
    try {
      const response = await updateAdminProduct(product.id, {
        isAvailable: !(
          product.isAvailable !== false && product.available !== false
        ),
      });
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? response.product : item
        )
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update product."
      );
    }
  }

  async function removeProduct(product: NowProduct) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await deleteAdminProduct(product.id);
      setProducts((current) =>
        current.filter((item) => item.id !== product.id)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete product."
      );
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

  return (
    <main className="min-h-screen bg-[#eaeded] text-slate-950">
      <header className="sticky top-0 z-40 bg-[#131921] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 font-black text-slate-950">
              a
            </div>
            <div>
              <p className="text-sm font-black leading-none">InstaKart Admin</p>
              <p className="text-[10px] text-slate-300">Inventory control</p>
            </div>
          </div>
          <nav className="ml-auto flex items-center gap-2 text-xs font-black sm:text-sm">
            <a href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/10">
              Dashboard
            </a>
            <a href="/admin/inventory" className="rounded-lg bg-white/10 px-3 py-2 text-amber-300">
              Inventory
            </a>
            <button
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-600 px-3 py-2 hover:border-amber-400 hover:text-amber-300"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Inventory</h2>
              <p className="text-sm text-slate-500">
                {filteredProducts.length} of {products.length} products
              </p>
            </div>
            <button
              onClick={() => {
                setEditingProduct(null);
                setEditorOpen(true);
              }}
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300"
            >
              + Add product
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              value={availability}
              onChange={(event) => setAvailability(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
            >
              <option value="all">All availability</option>
              <option value="available">Available</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="disabled">Unavailable</option>
            </select>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : filteredProducts.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const quantity = Number(product.quantity || 0);
                const enabled =
                  product.available !== false && product.isAvailable !== false;
                return (
                  <article key={product.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-2xl">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          productEmoji(product.name)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-black">{product.name}</h3>
                        <p className="text-xs text-slate-500">{product.category}</p>
                        <p className="mt-1 text-sm font-black">{formatPrice(product.price)}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black ${
                          quantity === 0
                            ? "bg-red-100 text-red-700"
                            : quantity < 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {quantity === 0
                          ? "Out of stock"
                          : quantity < 5
                            ? `Only ${quantity} left`
                            : `${quantity} in stock`}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500">Status</p>
                        <p className="text-sm font-bold">
                          {!enabled ? "Disabled" : quantity === 0 ? "Out of stock" : "Available"}
                        </p>
                      </div>
                      <button
                        onClick={() => void toggleAvailability(product)}
                        className={`rounded-full px-3 py-1.5 text-xs font-black ${
                          enabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {enabled ? "On" : "Off"}
                      </button>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <dt className="font-black uppercase text-slate-400">ETA</dt>
                        <dd className="mt-1 font-bold text-slate-700">
                          {product.etaMinutes} min
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2.5">
                        <dt className="font-black uppercase text-slate-400">Location</dt>
                        <dd className="mt-1 truncate font-bold text-slate-700">
                          {product.storeLocation || "Not set"}
                        </dd>
                      </div>
                      <div className="col-span-2 rounded-xl bg-slate-50 p-2.5">
                        <dt className="font-black uppercase text-slate-400">Updated</dt>
                        <dd className="mt-1 font-bold text-slate-700">
                          {product.updatedAt
                            ? new Date(product.updatedAt).toLocaleString()
                            : "No update recorded"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setEditorOpen(true);
                        }}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void removeProduct(product)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-black text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500">
              No products match these filters.
            </div>
          )}
        </section>
      </div>

      {editorOpen ? (
        <ProductEditor
          key={editingProduct?.id || "new"}
          product={editingProduct}
          saving={saving}
          categories={editorCategories}
          onSave={saveProduct}
          onClose={() => {
            setEditorOpen(false);
            setEditingProduct(null);
          }}
        />
      ) : null}
    </main>
  );
}
