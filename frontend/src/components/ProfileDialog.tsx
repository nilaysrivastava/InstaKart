"use client";

import type { AuthUser } from "@/lib/auth";

export function ProfileDialog({
  open,
  user,
  onClose,
  onLogout,
}: {
  open: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onLogout: () => void;
}) {
  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-amber-300 to-orange-500" />
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xl font-black text-slate-950">Your profile</p>
              <p className="mt-1 text-sm text-slate-500">
                Your InstaKart account details.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100"
              aria-label="Close profile"
            >
              ×
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Signed in as
            </p>
            <p className="mt-1 break-all font-black text-slate-950">{user.email}</p>
          </div>

          <button
            onClick={onLogout}
            className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
