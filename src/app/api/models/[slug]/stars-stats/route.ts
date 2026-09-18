import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function getDayKeyBerlin(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  } catch {
    const d = new Date(date);
    return d.toISOString().split("T")[0];
  }
}

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
    const model = await prisma.model.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        telegramChannelId: true,
        channelTitle: true,
        avatarUrl: true,
        investorId: true,
        createdAt: true,
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model nicht gefunden." }, { status: 404 });
    }

    // Tamper-proof Authorization Check
    const isMaster = user.role === "MASTER_ADMIN";
    const isAssignedInvestor = user.role === "INVESTOR" && model.investorId === user.id;

    if (!isMaster && !isAssignedInvestor) {
      return NextResponse.json(
        { error: "Zugriff verweigert. Dieser Kanal ist Ihrem Investoren-Konto nicht zugewiesen." },
        { status: 403 }
      );
    }

    // Query all StarTransactions for this model
    const transactions = await prisma.starTransaction.findMany({
      where: { modelId: model.id },
      orderBy: { transactionDate: "asc" },
      select: {
        id: true,
        telegramTxId: true,
        starsAmount: true,
        estimatedUsd: true,
        transactionDate: true,
        maturesAt: true,
        status: true,
      },
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalStars = 0;
    let totalUsd = 0;
    let maturedStars = 0;
    let pendingStars = 0;
    let last7DaysStars = 0;
    let last30DaysStars = 0;

    // Daily aggregation map
    const dailyMap = new Map<
      string,
      {
        date: string;
        starsAmount: number;
        estimatedUsd: number;
        txCount: number;
        maturedStars: number;
        pendingStars: number;
      }
    >();

    for (const tx of transactions) {
      const stars = Number(tx.starsAmount) || 0;
      const usd = Number(tx.estimatedUsd) || 0;
      const txDate = new Date(tx.transactionDate);
      const isMatured = tx.status === "MATURED" || now >= new Date(tx.maturesAt);

      totalStars += stars;
      totalUsd += usd;

      if (isMatured) {
        maturedStars += stars;
      } else {
        pendingStars += stars;
      }

      if (txDate >= sevenDaysAgo) {
        last7DaysStars += stars;
      }
      if (txDate >= thirtyDaysAgo) {
        last30DaysStars += stars;
      }

      const dayKey = getDayKeyBerlin(txDate);
      const existing = dailyMap.get(dayKey);

      if (existing) {
        existing.starsAmount += stars;
        existing.estimatedUsd = Number((existing.estimatedUsd + usd).toFixed(2));
        existing.txCount += 1;
        if (isMatured) existing.maturedStars += stars;
        else existing.pendingStars += stars;
      } else {
        dailyMap.set(dayKey, {
          date: dayKey,
          starsAmount: stars,
          estimatedUsd: Number(usd.toFixed(2)),
          txCount: 1,
          maturedStars: isMatured ? stars : 0,
          pendingStars: isMatured ? 0 : stars,
        });
      }
    }

    // Convert daily map to sorted array
    const dailyHistory = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Find best single day
    let bestDay: { date: string; starsAmount: number; estimatedUsd: number } | null = null;
    for (const d of dailyHistory) {
      if (!bestDay || d.starsAmount > bestDay.starsAmount) {
        bestDay = {
          date: d.date,
          starsAmount: d.starsAmount,
          estimatedUsd: d.estimatedUsd,
        };
      }
    }

    // Average daily calculation (across active recording days)
    const activeDaysCount = dailyHistory.length;
    const averageDailyStars =
      activeDaysCount > 0 ? Math.round(totalStars / activeDaysCount) : 0;

    return NextResponse.json({
      model: {
        id: model.id,
        name: model.name,
        slug: model.slug,
        channelTitle: model.channelTitle,
        telegramChannelId: model.telegramChannelId,
        avatarUrl: model.avatarUrl,
      },
      summary: {
        totalStars,
        totalUsd: Number(totalUsd.toFixed(2)),
        totalTransactions: transactions.length,
        maturedStars,
        pendingStars,
        last7DaysStars,
        last30DaysStars,
        averageDailyStars,
        activeDaysCount,
        bestDay,
      },
      dailyHistory,
      recentTransactions: transactions.slice(-100).reverse(),
    });
  } catch (error: any) {
    console.error("[Stars Stats API] Error:", error);
    return NextResponse.json({ error: error.message || "Interner Serverfehler" }, { status: 500 });
  }
}
