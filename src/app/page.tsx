import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { formatUsd, formatStars } from "@/lib/utils";
import {
  Users,
  Sparkles,
  Lock,
  RefreshCw,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  Send,
  Star,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

// Server Component with on-demand revalidation
export const revalidate = 0;

import { OverviewClient } from "./OverviewClient";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Strictly protect Master Overview: only MASTER_ADMIN can access
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor");
  }

  let models: any[] = [];
  try {
    models = await prisma.model.findMany({
      include: {
        expenses: true,
        starTransactions: true,
        payouts: true,
        posts: {
          take: 3,
          orderBy: { scheduledFor: "desc" },
        },
        _count: {
          select: {
            assets: true,
            posts: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[OverviewPage] Database query warning (schema initializing?):", error);
    models = [];
  }

  const modelsWithFin = models.map((m) => ({
    ...m,
    fin: calculateFinancials(
      m.id,
      m.openInvestBalance || 0,
      m.expenses || [],
      m.starTransactions || [],
      m.payouts || [],
      {
        modelName: m.name,
        channelTitle: m.channelTitle,
        investorSharePercent: m.investorSharePercent,
        enableExpenseRecoupment: m.enableExpenseRecoupment,
      }
    ),
  }));

  // Aggregate global numbers
  const totalLocked = modelsWithFin.reduce((acc, m) => acc + (m.fin?.pipeline?.lockedPendingUsd || 0), 0);
  const totalRecouped = modelsWithFin.reduce((acc, m) => acc + (m.fin?.recoupedUsd || 0), 0);
  const totalAvailablePayout = modelsWithFin.reduce((acc, m) => acc + (m.fin?.partnerAvailablePayoutUsd || 0), 0);
  const totalGrossRevenue = modelsWithFin.reduce((acc, m) => acc + (m.fin?.totalGrossRevenueUsd || 0), 0);

  return (
    <OverviewClient
      modelsWithFin={modelsWithFin}
      totalGrossRevenue={totalGrossRevenue}
      totalLocked={totalLocked}
      totalRecouped={totalRecouped}
      totalAvailablePayout={totalAvailablePayout}
    />
  );
}
