"use client";

import {useState} from "react";
import {useAuth} from "@/lib/auth";

export const demoAccounts = [
  {label: "Demo user", email: "demo.user@instakart.example", password: "InstaKartUser!2026", route: "/"},
  {label: "Demo admin", email: "demo.admin@instakart.example", password: "InstaKartAdmin!2026", route: "/admin"},
];

export function DemoAccounts() {
  const {login, configured} = useAuth();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function enter(account: typeof demoAccounts[number]) {
    setBusy(account.label); setError("");
    try { await login(account.email, account.password); window.location.assign(account.route); }
    catch { setError("Demo sign-in is unavailable right now. Please try again shortly."); setBusy(""); }
  }
  return <div>
    <p className="mb-3 text-xs leading-5 text-slate-600">Public portfolio accounts. Explore shopping and admin tools with sample data. Each shared demo workspace resets after 30 minutes or a server restart.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {demoAccounts.map(account => <div key={account.label} className="min-w-0 rounded-xl border border-amber-200 bg-white p-3 text-slate-900">
        <p className="text-sm font-black">{account.label}</p>
        <p className="mt-2 break-all text-xs"><span className="font-semibold">Email:</span> {account.email}</p>
        <p className="mt-1 break-all text-xs"><span className="font-semibold">Password:</span> <code>{account.password}</code></p>
        <button type="button" disabled={!configured || Boolean(busy)} onClick={() => enter(account)} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === account.label ? "Signing in…" : `Try ${account.label.toLowerCase()}`}</button>
      </div>)}
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}

export function DemoAccess() {
  const {user} = useAuth();
  return <aside className="border-b border-amber-200 bg-amber-50 px-4 py-2">
    {user?.isDemo && <p className="mx-auto mb-1 max-w-5xl text-xs font-bold text-amber-950">Demo workspace · Disposable sample data · Your changes stay separate from the live store</p>}
    <details open={!user} className="mx-auto max-w-5xl">
      <summary className="cursor-pointer text-sm font-bold text-amber-950">Try demo accounts — user &amp; admin</summary>
      <div className="py-3"><DemoAccounts /></div>
    </details>
  </aside>;
}
