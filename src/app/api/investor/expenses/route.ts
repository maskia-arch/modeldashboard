import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, logUserActivity } from "@/lib/auth";
import { ExpenseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expenses = await prisma.expense.findMany({
      where: user.role === "MASTER_ADMIN" ? undefined : { submittedById: user.id },
      include: {
        model: {
          select: { id: true, name: true, channelTitle: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(expenses);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { modelId, description, amountUsd, receiptUrl } = body;

    if (!modelId || !description || !amountUsd) {
      return NextResponse.json(
        { error: "modelId, description, and amountUsd are required" },
        { status: 400 }
      );
    }

    // Verify model exists and if investor, check if assigned
    const model = await prisma.model.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      return NextResponse.json({ error: "Model channel not found" }, { status: 404 });
    }

    if (user.role !== "MASTER_ADMIN" && model.investorId !== user.id) {
      return NextResponse.json(
        { error: "You are not authorized to submit expenses for this channel." },
        { status: 403 }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        modelId,
        description,
        amountUsd: parseFloat(amountUsd),
        receiptUrl: receiptUrl || null,
        status: user.role === "MASTER_ADMIN" ? ExpenseStatus.APPROVED : ExpenseStatus.PENDING_REVIEW,
        submittedById: user.id,
      },
      include: {
        model: true,
      },
    });

    // Log Activity
    const clientIp = req.headers.get("x-forwarded-for") || "127.0.0.1";
    await logUserActivity(user.id, `SUBMIT_EXPENSE_${model.name}`, clientIp);

    return NextResponse.json({
      success: true,
      expense,
      message: user.role === "MASTER_ADMIN"
        ? "Expense created and approved directly."
        : "Expense submitted for Master Admin review.",
    }, { status: 201 });
  } catch (error: any) {
    console.error("Expense submission error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
