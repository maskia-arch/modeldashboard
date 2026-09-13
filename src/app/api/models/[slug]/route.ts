import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
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
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const financials = calculateFinancials(
      model.id,
      model.openInvestBalance,
      model.expenses,
      model.starTransactions,
      model.payouts
    );

    return NextResponse.json({
      ...model,
      financials,
    });
  } catch (error: any) {
    console.error("Error fetching model detail:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
