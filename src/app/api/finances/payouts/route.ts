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

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const action = searchParams.get("action");
    const modelId = searchParams.get("modelId");

    // Case 1: Auto-reconciliation of Fragment duplicate / failed withdrawal
    if (action === "reconcile-fragment" && modelId) {
      const model = await prisma.model.findUnique({
        where: { id: modelId },
        include: {
          payouts: {
            orderBy: { paidAt: "asc" },
          },
        },
      });

      if (!model) {
        return NextResponse.json({ error: "Model nicht gefunden." }, { status: 404 });
      }

      const overallRevenue = model.telegramOverallRevenue || 0;
      const currentBalance = model.telegramCurrentBalance || 0;
      const telegramNetWithdrawn = Math.max(0, overallRevenue - currentBalance);
      const totalDbWithdrawn = model.payouts.reduce((sum, p) => sum + (p.starsWithdrawn || 0), 0);
      const excessStars = totalDbWithdrawn - telegramNetWithdrawn;

      if (excessStars <= 0) {
        return NextResponse.json({
          message: "Keine Abhebungs-Differenz vorhanden. Hauptbuch und Telegram stimmen bereits exakt überein.",
          reconciled: false,
        });
      }

      // Find candidate payout to delete:
      // Priority 1: Payout with exact starsWithdrawn matching excessStars (prefer earlier timestamp = failed attempt before retry)
      let candidate = model.payouts.find((p) => p.starsWithdrawn === excessStars);

      // Priority 2: Payout with identical stars withdrawn occurring more than once (the earlier one)
      if (!candidate) {
        for (let i = 0; i < model.payouts.length; i++) {
          for (let j = i + 1; j < model.payouts.length; j++) {
            if (model.payouts[i].starsWithdrawn === model.payouts[j].starsWithdrawn && model.payouts[i].starsWithdrawn > 0) {
              candidate = model.payouts[i];
              break;
            }
          }
          if (candidate) break;
        }
      }

      // Priority 3: Payout whose note mentions failure/error/refund
      if (!candidate) {
        candidate = model.payouts.find((p) => {
          const n = (p.notes || "").toLowerCase();
          return n.includes("fail") || n.includes("fehler") || n.includes("error") || n.includes("storno") || n.includes("rück");
        });
      }

      if (!candidate) {
        return NextResponse.json(
          { error: `Keine passende Buchung für die Differenz von ${excessStars} Sternen gefunden. Bitte manuell im Hauptbuch löschen.` },
          { status: 400 }
        );
      }

      await prisma.payout.delete({
        where: { id: candidate.id },
      });

      console.log(
        `[Payouts API DELETE] Auto-reconciled Fragment error for model ${model.name}: deleted duplicate payout ${candidate.id} (${candidate.starsWithdrawn} stars).`
      );

      return NextResponse.json({
        success: true,
        reconciled: true,
        deletedPayoutId: candidate.id,
        starsReconciled: candidate.starsWithdrawn,
        message: `Erfolgreich bereinigt: Fehlgeschlagene Abhebung über ${candidate.starsWithdrawn.toLocaleString()} Sterne wurde aus dem Hauptbuch gelöscht.`,
      });
    }

    // Case 2: Delete specific payout by ID
    if (!id) {
      return NextResponse.json({ error: "Payout ID oder reconcile-action erforderlich." }, { status: 400 });
    }

    const existing = await prisma.payout.findUnique({
      where: { id },
      include: { model: { select: { name: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Auszahlung nicht gefunden." }, { status: 404 });
    }

    await prisma.payout.delete({
      where: { id },
    });

    console.log(
      `[Payouts API DELETE] Successfully deleted payout ${id} (${existing.starsWithdrawn} stars, model: ${existing.model?.name}).`
    );

    return NextResponse.json({
      success: true,
      deletedId: id,
      starsWithdrawn: existing.starsWithdrawn,
      message: "Buchung erfolgreich gelöscht.",
    });
  } catch (error: any) {
    console.error("[Payouts API DELETE] Error deleting payout:", error);
    return NextResponse.json({ error: error.message || "Failed to delete payout" }, { status: 500 });
  }
}
