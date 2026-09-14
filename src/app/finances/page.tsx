import React from "react";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FinancesClient } from "./FinancesClient";

export const revalidate = 0;

export default async function FinancesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor");
  }
  const [models, payouts] = await Promise.all([
    prisma.model.findMany({
      include: {
        expenses: true,
        starTransactions: true,
        payouts: true,
      },
    }),
    prisma.payout.findMany({
      include: { model: true },
      orderBy: { paidAt: "desc" },
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

  const totalGrossRevenue = modelsWithFin.reduce((acc, m) => acc + m.fin.totalGrossRevenueUsd, 0);
  const totalRecouped = modelsWithFin.reduce((acc, m) => acc + m.fin.recoupedUsd, 0);
  const totalAvailablePayout = modelsWithFin.reduce((acc, m) => acc + m.fin.partnerAvailablePayoutUsd, 0);
  const totalPaidOut = payouts.reduce((acc, p) => acc + p.amountUsd, 0);
  const totalPaidTon = payouts.reduce((acc, p) => acc + p.amountTon, 0);

  return (
    <FinancesClient
      totalGrossRevenue={totalGrossRevenue}
      totalRecouped={totalRecouped}
      totalAvailablePayout={totalAvailablePayout}
      totalPaidOut={totalPaidOut}
      totalPaidTon={totalPaidTon}
      payouts={payouts}
    />
  );
}
