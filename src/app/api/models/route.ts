import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const models = await prisma.model.findMany({
      include: {
        investor: {
          select: { id: true, name: true, email: true, tonAddress: true },
        },
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

    const modelsWithFinancials = models.map((model) => {
      const financials = calculateFinancials(
        model.id,
        model.openInvestBalance,
        model.expenses,
        model.starTransactions,
        model.payouts,
        {
          modelName: model.name,
          channelTitle: model.channelTitle,
          investorSharePercent: model.investorSharePercent,
        }
      );

      return {
        ...model,
        financials,
      };
    });

    return NextResponse.json(modelsWithFinancials);
  } catch (error: any) {
    console.error("Error fetching models:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      slug,
      telegramChannelId,
      channelTitle,
      avatarUrl,
      openInvestBalance,
      investorId,
      investorSharePercent,
    } = body;

    if (!name || !slug || !telegramChannelId) {
      return NextResponse.json(
        { error: "Name, slug, and telegramChannelId are required" },
        { status: 400 }
      );
    }

    const model = await prisma.model.create({
      data: {
        name,
        slug,
        telegramChannelId,
        channelTitle,
        avatarUrl,
        openInvestBalance: parseFloat(openInvestBalance) || 0.0,
        investorId: investorId && investorId !== "NONE" ? investorId : null,
        investorSharePercent:
          typeof investorSharePercent === "number"
            ? investorSharePercent
            : parseFloat(investorSharePercent) || 50.0,
      },
      include: {
        investor: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (error: any) {
    console.error("Error creating model:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
