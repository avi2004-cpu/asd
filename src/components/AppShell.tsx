import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { logout, useAuth } from "../lib/auth";

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const user = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className={`mx-auto flex items-center justify-between gap-3 px-4 py-2 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-2xl">🧸</span>
            <div className="min-w-0">
              <p className="truncate font-bold text-brand-800">Early ASD Screening</p>
              {user && (
                <p className="truncate text-xs text-slate-500">
                  {user.name || user.email} · {user.role === "doctor" ? "Doctor" : "Parent"}
                </p>
              )}
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="min-h-12 shrink-0 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Log out
            </button>
          )}
        </div>
      </header>
      <main className={`mx-auto px-4 py-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>
    </div>
  );
}
