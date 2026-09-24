import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calculateChannelFinancials, calculateInvestorPortfolio } from "@/lib/financial-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If Master Admin, return portfolio across all models or user's assigned
    const isMaster = user.role === "MASTER_ADMIN";

    const models = await prisma.model.findMany({
      where: isMaster ? undefined : { investorId: user.id },
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
          slug: model.slug,
          avatarUrl: model.avatarUrl,
          investorSharePercent: model.investorSharePercent,
          enableExpenseRecoupment: model.enableExpenseRecoupment,
          telegramAvailableStars: model.telegramAvailableStars,
          telegramCurrentBalance: model.telegramCurrentBalance,
          telegramOverallRevenue: model.telegramOverallRevenue,
          telegramUsdRate: model.telegramUsdRate,
          telegramWithdrawalEnabled: model.telegramWithdrawalEnabled,
        }
      );
    });

    const portfolio = calculateInvestorPortfolio(user.id, channelFinancialsList);

    return NextResponse.json({
      investor: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tonAddress: user.tonAddress,
      },
      portfolio,
    });
  } catch (error: any) {
    console.error("Investor portfolio error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
