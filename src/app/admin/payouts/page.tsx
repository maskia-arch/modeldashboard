import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calculateChannelFinancials } from "@/lib/financial-engine";
import { PayoutsAdminClient } from "./PayoutsAdminClient";

export const revalidate = 0;

export default async function AdminPayoutsPage() {
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
        investor: {
          select: { id: true, name: true, email: true, tonAddress: true },
        },
        expenses: true,
        starTransactions: {
          orderBy: { transactionDate: "desc" },
        },
        payouts: {
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payout.findMany({
      include: {
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            channelTitle: true,
            investorId: true,
            investor: {
              select: { id: true, name: true, email: true, tonAddress: true },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const modelsWithFin = models.map((m) => {
    const fin = calculateChannelFinancials(
      m.id,
      m.openInvestBalance,
      m.expenses as any[],
      m.starTransactions as any[],
      m.payouts as any[],
      {
        modelName: m.name,
        channelTitle: m.channelTitle,
        slug: m.slug,
        avatarUrl: m.avatarUrl,
        investorSharePercent: m.investorSharePercent,
        enableExpenseRecoupment: m.enableExpenseRecoupment,
        telegramAvailableStars: m.telegramAvailableStars,
        telegramCurrentBalance: m.telegramCurrentBalance,
        telegramOverallRevenue: m.telegramOverallRevenue,
        telegramUsdRate: m.telegramUsdRate,
        telegramWithdrawalEnabled: m.telegramWithdrawalEnabled,
      }
    );

    return {
      id: m.id,
      name: m.name,
      slug: m.slug,
      channelTitle: m.channelTitle,
      avatarUrl: m.avatarUrl,
      investorSharePercent: m.investorSharePercent,
      enableExpenseRecoupment: m.enableExpenseRecoupment,
      investor: m.investor,
      payoutsCount: m.payouts.length,
      fin,
    };
  });

  return (
    <PayoutsAdminClient
      initialModels={modelsWithFin}
      initialPayouts={payouts}
    />
  );
}
