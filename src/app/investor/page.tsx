import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calculateChannelFinancials, calculateInvestorPortfolio } from "@/lib/financial-engine";
import { InvestorClient } from "./InvestorClient";

export const revalidate = 0;

export default async function InvestorPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch models assigned to this investor (or all if Master Admin viewing)
  const isMaster = user.role === "MASTER_ADMIN";
  const models = await prisma.model.findMany({
    where: isMaster ? undefined : { investorId: user.id },
    include: {
      expenses: {
        orderBy: { createdAt: "desc" },
      },
      starTransactions: {
        orderBy: { transactionDate: "desc" },
      },
      payouts: {
        orderBy: { paidAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const channelFinancialsList = models.map((model) => {
    return calculateChannelFinancials(
      model.id,
      model.openInvestBalance,
      model.expenses as any[],
      model.starTransactions,
      model.payouts,
      {
        modelName: model.name,
        channelTitle: model.channelTitle,
        investorSharePercent: model.investorSharePercent,
        enableExpenseRecoupment: model.enableExpenseRecoupment,
      }
    );
  });

  const portfolio = calculateInvestorPortfolio(user.id, channelFinancialsList);

  // Fetch submitted expenses by this user
  const submittedExpenses = await prisma.expense.findMany({
    where: isMaster ? undefined : { submittedById: user.id },
    include: {
      model: {
        select: { id: true, name: true, channelTitle: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Collect all fulfilled payouts across investor's channels
  const fulfilledPayouts = models
    .flatMap((m) =>
      m.payouts.map((p) => ({
        ...p,
        modelName: m.name,
        channelTitle: m.channelTitle,
      }))
    )
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  return (
    <InvestorClient
      investor={user}
      portfolio={portfolio}
      assignedModels={models.map((m) => ({
        id: m.id,
        name: m.name,
        channelTitle: m.channelTitle,
        enableExpenseRecoupment: m.enableExpenseRecoupment,
      }))}
      submittedExpenses={submittedExpenses}
      fulfilledPayouts={fulfilledPayouts}
    />
  );
}
