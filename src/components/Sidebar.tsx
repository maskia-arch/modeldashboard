"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Sparkles,
  Settings,
  Flame,
  ShieldCheck,
  TrendingUp,
  KeyRound,
  FileCheck2,
  PieChart,
  CalendarClock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useNavigation } from "@/context/NavigationContext";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { isMobileMenuOpen, closeMobileMenu } = useNavigation();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, closeMobileMenu]);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  // Smooth detection: If on investor route or userRole is INVESTOR, immediately render investor navigation
  const isInvestor = userRole === "INVESTOR" || pathname.startsWith("/investor") || pathname.startsWith("/settings/wallet");

  const NAV_ITEMS = isInvestor
    ? [
        {
          label: t.sidebar.myPortfolio,
          href: "/investor",
          icon: PieChart,
        },
        {
          label: t.sidebar.schedule,
          href: "/investor?tab=schedule",
          icon: CalendarClock,
        },
        {
          label: t.sidebar.tonWallet,
          href: "/settings/wallet",
          icon: Wallet,
        },
      ]
    : [
        {
          label: t.sidebar.overview,
          href: "/",
          icon: LayoutDashboard,
        },
        {
          label: t.sidebar.creatorModels,
          href: "/models",
          icon: Users,
        },
        {
          label: t.sidebar.schedule,
          href: "/schedule",
          icon: CalendarClock,
        },
        {
          label: t.sidebar.financialLedger,
          href: "/finances",
          icon: TrendingUp,
        },
        {
          label: t.sidebar.investorKeys,
          href: "/admin/users",
          icon: KeyRound,
        },
        {
          label: t.sidebar.expenseApprovals,
          href: "/admin/expenses",
          icon: FileCheck2,
        },
        {
          label: t.sidebar.investorView,
          href: "/investor",
          icon: PieChart,
        },
        {
          label: t.sidebar.tonWallet,
          href: "/settings/wallet",
          icon: Wallet,
        },
        {
          label: t.sidebar.settings,
          href: "/settings",
          icon: Settings,
        },
      ];

  return (
    <>
      {/* Desktop Sidebar (visible on md screens and wider) */}
      <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col justify-between hidden md:flex shrink-0 min-h-screen">
        <div>
          {/* Brand Header */}
          <div className="h-16 border-b border-border flex items-center px-6 gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md">
              <Flame className="h-4 w-4 fill-current" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-sm text-foreground block">
                AutoActs
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {isInvestor ? t.sidebar.investorGateway : t.sidebar.masterManagement}
              </span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Status Box */}
        <div className="p-4 border-t border-border">
          <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {t.sidebar.role}: {isInvestor ? "Investor" : "Master"}
              </span>
              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                {t.common.active}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isInvestor ? t.sidebar.channelRecoupmentActive : t.sidebar.workerActive}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer & Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden transition-all duration-300",
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Backdrop overlay */}
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          onClick={closeMobileMenu}
        />

        {/* Slide-out Sidebar Panel */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-card border-r border-border shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-in-out z-50",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div>
            {/* Mobile Header with Brand & Close Button */}
            <div className="h-16 border-b border-border flex items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md">
                  <Flame className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <span className="font-bold tracking-tight text-sm text-foreground block">
                    AutoActs
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {isInvestor ? t.sidebar.investorGateway : t.sidebar.masterManagement}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileMenu}
                aria-label="Close navigation menu"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Navigation Links */}
            <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)]">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Status Box in Mobile Drawer */}
          <div className="p-4 border-t border-border space-y-3">
            <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {t.sidebar.role}: {isInvestor ? "Investor" : "Master"}
                </span>
                <Badge variant="success" className="text-[10px] px-1.5 py-0">
                  {t.common.active}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isInvestor ? t.sidebar.channelRecoupmentActive : t.sidebar.workerActive}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
