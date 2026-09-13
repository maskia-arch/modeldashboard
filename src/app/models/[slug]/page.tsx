import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { ModelDetailClient } from "./ModelDetailClient";

export const revalidate = 0;

interface PageProps {
  params: { slug: string };
}

export default async function ModelDetailPage({ params }: PageProps) {
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

  const financials = calculateFinancials(
    model.id,
    model.openInvestBalance,
    model.expenses,
    model.starTransactions,
    model.payouts
  );

  return <ModelDetailClient initialModel={model} initialFinancials={financials} />;
}
