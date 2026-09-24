import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTonTransaction } from "@/lib/ton";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");

    const isMaster = user.role === "MASTER_ADMIN";

    const where: any = {};
    if (modelId) {
      where.modelId = modelId;
    }
    if (!isMaster) {
      // Investors only see payouts for channels assigned to them
      where.model = { investorId: user.id };
    }

    const payouts = await prisma.payout.findMany({
      where,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            channelTitle: true,
            investorId: true,
            investorSharePercent: true,
            enableExpenseRecoupment: true,
            investor: {
              select: {
                id: true,
                name: true,
                email: true,
                tonAddress: true,
              },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    });

    return NextResponse.json({ payouts });
  } catch (error: any) {
    console.error("[Payouts API GET] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch payouts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const {
      modelId,
      recipient,
      starsWithdrawn = 0,
      currency = "GRAM",
      amountCrypto,
      investorCrypto,
      managementCrypto,
      amountUsd,
      investorUsd,
      managementUsd,
      txHash,
      notes,
    } = body;

    if (!modelId || !recipient) {
      return NextResponse.json(
        { error: "modelId und Empfänger-Adresse sind erforderlich." },
        { status: 400 }
      );
    }

    const model = await prisma.model.findUnique({
      where: { id: modelId },
      include: { investor: true },
    });
    if (!model) {
      return NextResponse.json({ error: "Model nicht gefunden." }, { status: 404 });
    }

    const parsedStars = parseInt(String(starsWithdrawn || 0), 10);
    const parsedTotalCrypto = parseFloat(String(amountCrypto || body.amountTon || 0));
    const parsedInvestorCrypto = parseFloat(String(investorCrypto || parsedTotalCrypto));
    const parsedMgmtCrypto = parseFloat(String(managementCrypto || (parsedTotalCrypto - parsedInvestorCrypto)));
    const parsedAmountUsd = parseFloat(String(amountUsd || 0));
    const parsedInvestorUsd = parseFloat(String(investorUsd || parsedAmountUsd));
    const parsedMgmtUsd = parseFloat(String(managementUsd || (parsedAmountUsd - parsedInvestorUsd)));

    // Generate safe unique hash if empty or off-chain
    const effectiveTxHash = (txHash && String(txHash).trim().length > 0)
      ? String(txHash).trim()
      : `TX_MANUAL_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Check if txHash has already been logged
    const existing = await prisma.payout.findUnique({
      where: { txHash: effectiveTxHash },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Dieser Transaktions-Hash wurde bereits im Hauptbuch verbucht." },
        { status: 409 }
      );
    }

    // Optional on-chain verification attempt for TON transactions (soft warning, does not block booking)
    if (currency === "TON" && txHash && !txHash.startsWith("TX_MANUAL_")) {
      try {
        const verification = await verifyTonTransaction({
          txHash: effectiveTxHash,
          recipientAddress: recipient,
          expectedAmountTon: parsedInvestorCrypto,
        });
        if (!verification.isValid) {
          console.warn("[Payouts API] TON transaction verification notice:", verification.error);
        }
      } catch (tonErr) {
        console.warn("[Payouts API] TON verification skipped or network timeout:", tonErr);
      }
    }

    // Record payout in database ledger
    const payout = await prisma.payout.create({
      data: {
        modelId,
        recipient: recipient.trim(),
        starsWithdrawn: isNaN(parsedStars) ? 0 : parsedStars,
        currency: currency === "TON" ? "TON" : "GRAM",
        amountCrypto: isNaN(parsedTotalCrypto) ? 0 : parsedTotalCrypto,
        investorCrypto: isNaN(parsedInvestorCrypto) ? 0 : parsedInvestorCrypto,
        managementCrypto: isNaN(parsedMgmtCrypto) ? 0 : parsedMgmtCrypto,
        amountTon: isNaN(parsedInvestorCrypto) ? 0 : parsedInvestorCrypto, // Backwards-compatibility
        amountUsd: isNaN(parsedAmountUsd) ? 0 : parsedAmountUsd,
        investorUsd: isNaN(parsedInvestorUsd) ? 0 : parsedInvestorUsd,
        managementUsd: isNaN(parsedMgmtUsd) ? 0 : parsedMgmtUsd,
        txHash: effectiveTxHash,
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            channelTitle: true,
            investorId: true,
            investor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    console.log(
      `[Payouts API] Successfully logged payout for model ${model.name}: ${parsedStars} stars withdrawn, ${parsedTotalCrypto} ${currency} total (${parsedInvestorCrypto} ${currency} to investor).`
    );

    return NextResponse.json(payout, { status: 201 });
  } catch (error: any) {
    console.error("[Payouts API POST] Error logging payout:", error);
    return NextResponse.json({ error: error.message || "Failed to log payout" }, { status: 500 });
  }
}
