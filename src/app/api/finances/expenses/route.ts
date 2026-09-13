import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, description, amountUsd, receiptUrl } = body;

    if (!modelId || !description || amountUsd === undefined) {
      return NextResponse.json(
        { error: "modelId, description, and amountUsd are required" },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        modelId,
        description,
        amountUsd: parseFloat(amountUsd),
        receiptUrl: receiptUrl || null,
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    console.error("Error creating expense:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
