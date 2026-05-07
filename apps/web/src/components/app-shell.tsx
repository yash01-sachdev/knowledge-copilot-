"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/nav-items";
import { SiteHeader } from "@/components/site-header";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isWorkspacePage = pathname === "/memory" || pathname === "/write" || pathname === "/ask";

  if (pathname === "/") {
    return <>{children}</>;
  }

  if (isWorkspacePage) {
    return (
      <div className="relative flex min-h-screen w-full flex-col">
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-end px-4 sm:px-6 lg:px-8">
          <nav className="pointer-events-auto flex items-center gap-2 rounded-[20px] border border-white/10 bg-[rgba(7,12,14,0.88)] p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-[rgba(65,214,147,0.16)] text-foreground shadow-[inset_0_0_0_1px_rgba(65,214,147,0.22)]"
                      : "text-muted hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-1 flex-col pt-24 sm:pt-28">{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1580px] flex-col px-4 sm:px-6 lg:px-8">
      <SiteHeader />
      <div className="flex flex-1 flex-col pb-8">{children}</div>
    </div>
  );
}
