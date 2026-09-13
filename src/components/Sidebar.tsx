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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [userRole, setUserRole] = useState<string>("MASTER_ADMIN");

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  const isInvestor = userRole === "INVESTOR";

  const NAV_ITEMS = isInvestor
    ? [
        {
          label: t.sidebar.myPortfolio,
          href: "/investor",
          icon: PieChart,
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
  );
}
