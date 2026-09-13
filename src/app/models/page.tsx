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
import { ModelsListClient } from "./ModelsListClient";

export const revalidate = 0;

export default async function ModelsPage() {
  const models = await prisma.model.findMany({
    include: {
      expenses: true,
      starTransactions: true,
      payouts: true,
      _count: {
        select: {
          assets: true,
          posts: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const modelsWithFin = models.map((m) => ({
    ...m,
    fin: calculateFinancials(m.id, m.openInvestBalance, m.expenses, m.starTransactions, m.payouts),
  }));

  return <ModelsListClient initialModels={modelsWithFin} />;
}
