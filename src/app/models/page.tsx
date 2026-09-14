import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { formatUsd } from "@/lib/utils";
import { Plus, ArrowRight, Star, Lock, RefreshCw, CheckCircle2, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ModelsListClient } from "./ModelsListClient";

export const revalidate = 0;

export default async function ModelsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor");
  }
  const [models, investors] = await Promise.all([
    prisma.model.findMany({
      include: {
        investor: {
          select: { id: true, name: true, email: true },
        },
        expenses: true,
        starTransactions: true,
        payouts: true,
        posts: {
          where: { status: { in: ["SCHEDULED", "PENDING"] } },
          select: { id: true, scheduledFor: true },
          orderBy: { scheduledFor: "desc" },
          take: 1,
        },
        _count: {
          select: {
            assets: true,
            posts: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "INVESTOR" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const modelsWithFin = models.map((m) => ({
    ...m,
    fin: calculateFinancials(m.id, m.openInvestBalance, m.expenses, m.starTransactions, m.payouts, {
      modelName: m.name,
      channelTitle: m.channelTitle,
      investorSharePercent: m.investorSharePercent,
      enableExpenseRecoupment: m.enableExpenseRecoupment,
    }),
  }));

  return <ModelsListClient initialModels={modelsWithFin} investors={investors} />;
}
