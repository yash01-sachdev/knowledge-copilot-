import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
