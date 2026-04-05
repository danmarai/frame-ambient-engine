"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "H" },
  { href: "/dashboard/preview", label: "Preview Studio", icon: "P" },
  { href: "/dashboard/settings", label: "Settings", icon: "S" },
  { href: "/dashboard/health", label: "Health", icon: "+" },
  { href: "/dashboard/history", label: "History", icon: "L" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r border-frame-border bg-frame-surface">
      <div className="p-5">
        <h2 className="text-lg font-semibold text-frame-text">Frame</h2>
        <p className="text-xs text-frame-muted">Ambient Engine</p>
      </div>

      <nav className="flex-1 px-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-frame-accent/10 text-frame-accent"
                  : "text-frame-muted hover:bg-frame-bg hover:text-frame-text"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-frame-bg text-xs font-medium">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-frame-border p-4">
        <p className="text-xs text-frame-muted">v0.1.0 — Milestone 0</p>
      </div>
    </aside>
  );
}
