import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { getCurrentUser } from "@/lib/auth";
import { normalizeTelegramChatId } from "@/lib/telegram-bot";

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
      const parsed = parseFloat(body.investorSharePercent);
      updateData.investorSharePercent = !isNaN(parsed) ? Math.max(0, Math.min(100, parsed)) : 50.0;
    }
    if (body.enableExpenseRecoupment !== undefined) {
      updateData.enableExpenseRecoupment = Boolean(body.enableExpenseRecoupment);
    }
    if (body.name !== undefined) updateData.name = body.name;
    if (body.channelTitle !== undefined) updateData.channelTitle = body.channelTitle;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
    if (body.telegramChannelId !== undefined && body.telegramChannelId.trim()) {
      updateData.telegramChannelId = normalizeTelegramChatId(body.telegramChannelId);
    }
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

export async function DELETE(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Nur Master Administratoren dürfen Models löschen." },
        { status: 403 }
      );
    }

    const { slug } = params;
    const model = await prisma.model.findUnique({
      where: { slug },
      include: {
        assets: true,
        expenses: true,
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model nicht gefunden." }, { status: 404 });
    }

    // 1. Physische Mediendateien des Models von der Festplatte löschen
    const { deleteAssetLocalFile } = await import("@/lib/assets");
    let deletedFilesCount = 0;

    for (const asset of model.assets) {
      if (asset.fileUrl) {
        try {
          const removed = await deleteAssetLocalFile(asset.fileUrl);
          if (removed) deletedFilesCount++;
        } catch (e) {
          console.warn(`[DeleteModel] Fehler beim Löschen der Datei für Asset ${asset.id}:`, e);
        }
      }
    }

    // 2. Lokale Belege & Avatare löschen, falls vorhanden
    for (const expense of model.expenses) {
      if (expense.receiptUrl && expense.receiptUrl.startsWith("/uploads/")) {
        try {
          await deleteAssetLocalFile(expense.receiptUrl);
        } catch {}
      }
    }

    if (model.avatarUrl && model.avatarUrl.startsWith("/uploads/")) {
      try {
        await deleteAssetLocalFile(model.avatarUrl);
      } catch {}
    }

    // 3. Kaskadierendes Löschen aller Datenbankeinträge in einer Transaktion
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { modelId: model.id } }),
      prisma.asset.deleteMany({ where: { modelId: model.id } }),
      prisma.expense.deleteMany({ where: { modelId: model.id } }),
      prisma.starTransaction.deleteMany({ where: { modelId: model.id } }),
      prisma.payout.deleteMany({ where: { modelId: model.id } }),
      prisma.model.delete({ where: { id: model.id } }),
    ]);

    // 4. Audit-Log erstellen
    try {
      await prisma.userActivityLog.create({
        data: {
          userId: user.id,
          action: `DELETE_MODEL:${model.name}`,
          ipAddress: req.headers.get("x-forwarded-for") || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        },
      });
    } catch {}

    console.log(`[DeleteModel] Model "${model.name}" (${model.id}) and ${deletedFilesCount} disk files successfully deleted.`);

    return NextResponse.json({
      success: true,
      deletedFilesCount,
      message: `Model "${model.name}" und ${deletedFilesCount} Mediendateien wurden vollständig von der Festplatte und Datenbank gelöscht.`,
    });
  } catch (error: any) {
    console.error("Error deleting model:", error);
    return NextResponse.json(
      { error: error.message || "Fehler beim Löschen des Models." },
      { status: 500 }
    );
  }
}

