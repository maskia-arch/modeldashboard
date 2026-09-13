import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ExpenseReviewClient } from "./ExpenseReviewClient";

export const revalidate = 0;

export default async function AdminExpensesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "MASTER_ADMIN") {
    redirect("/login");
  }

  const expenses = await prisma.expense.findMany({
    include: {
      model: {
        select: { id: true, name: true, slug: true, telegramChannelId: true },
      },
      submittedBy: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <ExpenseReviewClient initialExpenses={expenses} />;
}
