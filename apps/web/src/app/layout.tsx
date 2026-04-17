import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Knowledge Copilot",
  description:
    "A grounded personal knowledge assistant for notes, journals, and dated reflections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <div className="app-mesh pointer-events-none fixed inset-0" />
        <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warm/60 to-transparent" />
        <div className="mx-auto flex min-h-screen w-full max-w-[1580px] flex-col px-4 sm:px-6 lg:px-8">
          <SiteHeader />
          <div className="flex flex-1 flex-col pb-8">{children}</div>
        </div>
      </body>
    </html>
  );
}
