import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ExpenseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin review required." }, { status: 403 });
    }

    const body = await req.json();
    const { expenseId, status, reviewNote } = body;

    if (!expenseId || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "expenseId and valid status (APPROVED | REJECTED) are required" }, { status: 400 });
    }

    const updatedExpense = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        status: status as ExpenseStatus,
        reviewedAt: new Date(),
        reviewNote: reviewNote || null,
      },
      include: {
        model: true,
        submittedBy: true,
      },
    });

    return NextResponse.json({
      success: true,
      expense: updatedExpense,
      message: `Expense ${status === "APPROVED" ? "approved & added to channel recoupment" : "rejected"}.`,
    });
  } catch (error: any) {
    console.error("Expense review error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
