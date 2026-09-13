import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "AutoActs • Telegram Model & Financial Management",
  description: "Enterprise Agency Dashboard with Telegram Stars MTProto Sync, Recoupment & TON Payouts",
};

import { LanguageProvider } from "@/context/LanguageContext";
import { NavigationProvider } from "@/context/NavigationContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased flex">
        <LanguageProvider>
          <NavigationProvider>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 min-h-screen">
              <Navbar />
              <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
                {children}
              </main>
            </div>
          </NavigationProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
