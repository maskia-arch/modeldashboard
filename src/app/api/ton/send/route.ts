import { NextResponse } from "next/server";
import { TonClient, WalletContractV4, internal, toNano, fromNano, Address } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { getCurrentUser, logUserActivity } from "@/lib/auth";
import { isValidTonAddress } from "@/lib/ton";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { mnemonic, recipient, amount, comment } = body;

    // 1. Validate Recipient
    if (!recipient || !isValidTonAddress(recipient)) {
      return NextResponse.json(
        { error: "Ungültige Empfänger TON-Adresse." },
        { status: 400 }
      );
    }

    // 2. Validate Amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Bitte geben Sie einen gültigen Betrag größer als 0 ein." },
        { status: 400 }
      );
    }

    // 3. Validate Mnemonic
    let words: string[] = [];
    if (Array.isArray(mnemonic)) {
      words = mnemonic;
    } else if (typeof mnemonic === "string") {
      words = mnemonic.trim().split(/\s+/);
    }

    if (words.length !== 24) {
      return NextResponse.json(
        { error: "Zur Freigabe der Transaktion ist eine gültige 24-Wort Secret Recovery Phrase erforderlich." },
        { status: 400 }
      );
    }

    // 4. Initialize TonClient & Contract
    const endpoint = process.env.TON_API_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
    const apiKey = process.env.TON_API_KEY || undefined;

    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const keyPair = await mnemonicToPrivateKey(words);
    const walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const wallet = client.open(walletContract);

    // 5. Verify Balance
    const balanceNano = await wallet.getBalance();
    const requiredNano = toNano(parsedAmount.toString()) + toNano("0.02");

    if (balanceNano < requiredNano) {
      return NextResponse.json(
        {
          error: `Unzureichendes Guthaben. Aktuell verfügbar: ${fromNano(balanceNano)} TON. Erforderlich: ${fromNano(requiredNano)} TON (inkl. ca. 0.02 TON Netzwerk-Reserve).`,
        },
        { status: 400 }
      );
    }

    // 6. Get Seqno & Send Transfer
    const seqno = await wallet.getSeqno();

    await wallet.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: Address.parse(recipient.trim()),
          value: toNano(parsedAmount.toString()),
          body: comment ? comment.trim() : "",
          bounce: false,
        }),
      ],
    });

    // 7. Log activity
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "unknown";
    await logUserActivity(
      currentUser.id,
      `SEND_TON: ${parsedAmount} TON to ${recipient.slice(0, 8)}...`,
      clientIp,
      userAgent
    );

    return NextResponse.json({
      success: true,
      message: `${parsedAmount} TON erfolgreich versendet!`,
      amount: parsedAmount,
      recipient: recipient.trim(),
      sender: walletContract.address.toString({ testOnly: false, bounceable: false }),
    });
  } catch (error: any) {
    console.error("[TON Send Error]:", error);
    return NextResponse.json(
      { error: error.message || "Fehler beim Versenden der TON-Transaktion." },
      { status: 500 }
    );
  }
}
