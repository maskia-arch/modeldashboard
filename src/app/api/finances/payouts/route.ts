import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTonTransaction } from "@/lib/ton";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, recipient, amountUsd, amountTon, txHash } = body;

    if (!modelId || !recipient || !amountUsd || !amountTon || !txHash) {
      return NextResponse.json(
        { error: "modelId, recipient, amountUsd, amountTon, and txHash are required" },
        { status: 400 }
      );
    }

    // Check if txHash has already been logged
    const existing = await prisma.payout.findUnique({
      where: { txHash },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This TON transaction hash has already been booked into the ledger." },
        { status: 409 }
      );
    }

    // Verify on-chain status
    const verification = await verifyTonTransaction({
      txHash,
      recipientAddress: recipient,
      expectedAmountTon: parseFloat(amountTon),
    });

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || "TON Blockchain transaction verification failed" },
        { status: 422 }
      );
    }

    // Record payout in database ledger
    const payout = await prisma.payout.create({
      data: {
        modelId,
        recipient,
        amountUsd: parseFloat(amountUsd),
        amountTon: parseFloat(amountTon),
        txHash,
      },
    });

    return NextResponse.json(payout, { status: 201 });
  } catch (error: any) {
    console.error("Error logging payout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
