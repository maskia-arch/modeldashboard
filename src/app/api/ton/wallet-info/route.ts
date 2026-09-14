import { NextResponse } from "next/server";
import { TonClient, Address, fromNano } from "@ton/ton";
import { isValidTonAddress } from "@/lib/ton";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const addressParam = searchParams.get("address");

    if (!addressParam || !isValidTonAddress(addressParam)) {
      return NextResponse.json(
        { error: "Invalid or missing TON address format" },
        { status: 400 }
      );
    }

    const cleanAddress = addressParam.trim();
    const endpoint = process.env.TON_API_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
    const apiKey = process.env.TON_API_KEY || undefined;

    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const parsedAddress = Address.parse(cleanAddress);

    // 1. Fetch live balance
    let balanceTon = "0";
    try {
      const balanceNano = await client.getBalance(parsedAddress);
      balanceTon = fromNano(balanceNano);
    } catch (err: any) {
      console.warn("[TON API] Could not fetch balance:", err.message);
    }

    // 2. Fetch approx TON rate in USD
    let tonRateUsd = 5.60;
    try {
      const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd", {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      });
      if (priceRes.ok) {
        const pData = await priceRes.json();
        if (pData?.["the-open-network"]?.usd) {
          tonRateUsd = pData["the-open-network"].usd;
        }
      }
    } catch {
      // Use standard fallback rate
    }

    const balanceUsd = parseFloat((parseFloat(balanceTon) * tonRateUsd).toFixed(2));

    // 3. Fetch recent transactions
    let transactions: any[] = [];
    try {
      const rawTxs = await client.getTransactions(parsedAddress, { limit: 8 });
      transactions = rawTxs.map((tx: any) => {
        const isIncoming = Boolean(
          tx.inMessage &&
          tx.inMessage.info?.type === "internal" &&
          tx.inMessage.info?.value?.coins > 0n
        );

        const amountCoins = isIncoming
          ? tx.inMessage?.info?.value?.coins || 0n
          : tx.outMessages?.[0]?.info?.value?.coins || 0n;

        const counterparty = isIncoming
          ? tx.inMessage?.info?.src?.toString({ bounceable: false })
          : tx.outMessages?.[0]?.info?.dest?.toString({ bounceable: false });

        let memo = "";
        try {
          if (tx.inMessage?.body) {
            const slice = tx.inMessage.body.beginParse();
            if (slice.remainingBits >= 32) {
              const op = slice.loadUint(32);
              if (op === 0) {
                memo = slice.loadStringTail();
              }
            }
          }
        } catch {
          // No readable text memo
        }

        return {
          hash: tx.hash().toString("hex"),
          lt: tx.lt.toString(),
          now: tx.now,
          isIncoming,
          amountTon: fromNano(amountCoins),
          counterparty: counterparty || null,
          memo: memo || null,
          feeTon: fromNano(tx.totalFees?.coins || 0n),
        };
      });
    } catch (err: any) {
      console.warn("[TON API] Could not fetch transactions:", err.message);
    }

    return NextResponse.json({
      success: true,
      address: cleanAddress,
      balanceTon,
      balanceUsd,
      tonRateUsd,
      transactions,
    });
  } catch (error: any) {
    console.error("[TON API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
