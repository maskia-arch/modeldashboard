import React from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { getCurrentUser } from "@/lib/auth";
import { ModelDetailClient } from "./ModelDetailClient";

export const revalidate = 0;

interface PageProps {
  params: { slug: string };
}

export default async function ModelDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { slug } = params;

  const model = await prisma.model.findUnique({
    where: { slug },
    include: {
      assets: {
        orderBy: { createdAt: "desc" },
      },
      posts: {
        include: { asset: true },
        orderBy: { scheduledFor: "desc" },
      },
      expenses: {
        orderBy: { createdAt: "desc" },
      },
      starTransactions: {
        orderBy: { transactionDate: "desc" },
      },
      payouts: {
        orderBy: { paidAt: "desc" },
      },
      investor: {
        select: { id: true, name: true, email: true, tonAddress: true },
      },
    },
  });

  if (!model) {
    notFound();
  }

  // Investors can only access channels explicitly assigned to them
  if (user.role === "INVESTOR" && model.investorId !== user.id) {
    redirect("/investor");
  }

  const financials = calculateFinancials(
    model.id,
    model.openInvestBalance,
    model.expenses,
    model.starTransactions,
    model.payouts
  );

  return <ModelDetailClient initialModel={model} initialFinancials={financials} />;
}
