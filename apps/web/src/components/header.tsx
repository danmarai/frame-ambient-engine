"use client";

import { logout } from "@/app/login/actions";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-frame-border bg-frame-surface px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-frame-success" />
        <span className="text-xs text-frame-muted">System Healthy</span>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="text-xs text-frame-muted transition-colors hover:text-frame-text"
        >
          Sign Out
        </button>
      </form>
    </header>
  );
}
