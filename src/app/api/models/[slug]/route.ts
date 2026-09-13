import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    if (user.role !== "MASTER_ADMIN" && model.investorId !== user.id) {
      return NextResponse.json({ error: "Forbidden. Channel not assigned to your account." }, { status: 403 });
    }

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
        enableExpenseRecoupment: model.enableExpenseRecoupment,
      }
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

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { slug } = params;
    const body = await req.json();

    const updateData: any = {};
    if (body.investorId !== undefined) {
      updateData.investorId = body.investorId && body.investorId !== "NONE" ? body.investorId : null;
    }
    if (body.investorSharePercent !== undefined) {
      updateData.investorSharePercent = parseFloat(body.investorSharePercent) || 50.0;
    }
    if (body.enableExpenseRecoupment !== undefined) {
      updateData.enableExpenseRecoupment = Boolean(body.enableExpenseRecoupment);
    }
    if (body.name !== undefined) updateData.name = body.name;
    if (body.channelTitle !== undefined) updateData.channelTitle = body.channelTitle;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
    if (body.openInvestBalance !== undefined) {
      updateData.openInvestBalance = parseFloat(body.openInvestBalance) || 0.0;
    }

    const updated = await prisma.model.update({
      where: { slug },
      data: updateData,
      include: {
        investor: {
          select: { id: true, name: true, email: true, tonAddress: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating model:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
