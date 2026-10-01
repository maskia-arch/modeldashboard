import { NextResponse } from "next/server";
import { TonClient, WalletContractV4, internal, toNano, fromNano, Address } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, logUserActivity } from "@/lib/auth";
import { isValidTonAddress } from "@/lib/ton";
import { decryptMnemonic, encryptMnemonic } from "@/lib/wallet-crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { password, recipient, amount, comment, mnemonic } = body;

    // 1. Fetch user from DB to verify password and retrieve encrypted wallet
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Benutzerkonto nicht gefunden." }, { status: 404 });
    }

    // 2. Validate Password (User's account password)
    if (!password) {
      return NextResponse.json(
        { error: "Bitte geben Sie Ihr Account-Passwort ein, um die Auszahlung zu verifizieren." },
        { status: 400 }
      );
    }

    if (!dbUser.passwordHash) {
      return NextResponse.json(
        { error: "Für dieses Konto wurde noch kein Passwort festgelegt." },
        { status: 400 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, dbUser.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Falsches Account-Passwort. Bitte überprüfen Sie Ihre Eingabe." },
        { status: 403 }
      );
    }

    // 3. Validate Recipient Address
    if (!recipient || !isValidTonAddress(recipient)) {
      return NextResponse.json(
        { error: "Ungültige Empfänger TON-Adresse." },
        { status: 400 }
      );
    }

    // 4. Validate Amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Bitte geben Sie einen gültigen Betrag größer als 0 ein." },
        { status: 400 }
      );
    }

    // 5. Retrieve Wallet Mnemonic
    let words: string[] = [];

    // Priority A: Decrypt from user profile
    if (dbUser.tonWalletEncrypted) {
      try {
        words = decryptMnemonic(dbUser.tonWalletEncrypted);
      } catch (decErr: any) {
        console.error("[TON Send] Error decrypting wallet from DB:", decErr.message);
      }
    }

    // Priority B: Fallback from client payload (and auto-save to DB)
    if (words.length !== 24 && mnemonic) {
      const candidateWords = Array.isArray(mnemonic)
        ? mnemonic
        : typeof mnemonic === "string"
        ? mnemonic.trim().split(/\s+/)
        : [];
      if (candidateWords.length === 24) {
        words = candidateWords;
        try {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { tonWalletEncrypted: encryptMnemonic(words) },
          });
        } catch {}
      }
    }

    if (words.length !== 24) {
      if (dbUser.tonAddress) {
        return NextResponse.json(
          {
            error: "Externe Wallet erkannt: Für diese Adresse sind keine privaten Schlüssel im Dashboard hinterlegt. Auszahlungen werden an diese Adresse empfangen, Überweisungen müssen jedoch direkt in Ihrer externen Wallet-App (z. B. Tonkeeper oder Telegram Wallet) ausgeführt werden.",
            isExternalWallet: true,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error: "Kein aktiver Wallet-Schlüssel gefunden. Bitte richten Sie Ihr Wallet in den Einstellungen neu ein oder sichern Sie es ab.",
        },
        { status: 400 }
      );
    }

    // 6. Initialize TonClient & Contract with Multi-RPC Failover and Auto-Retry on 429
    const defaultEndpoint = process.env.TON_API_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
    const apiKey = process.env.TON_API_KEY || undefined;

    // List of candidate RPC endpoints to failover if an endpoint is throttled
    const candidateEndpoints = [
      defaultEndpoint,
      "https://toncenter.com/api/v2/jsonRPC",
    ].filter((val, idx, self) => Boolean(val) && self.indexOf(val) === idx);

    let activeClientIndex = 0;
    const getClient = () => {
      const ep = candidateEndpoints[activeClientIndex] || candidateEndpoints[0];
      return new TonClient({
        endpoint: ep,
        apiKey: ep.includes("toncenter.com") ? apiKey : undefined,
      });
    };

    let client = getClient();
    const keyPair = await mnemonicToPrivateKey(words);
    const walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    let wallet = client.open(walletContract);

    // Resilient RPC executor with exponential backoff on HTTP 429
    const executeWithRetry = async <T>(operationName: string, op: () => Promise<T>, maxRetries = 4): Promise<T> => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          return await op();
        } catch (err: any) {
          attempt++;
          const errMsg = String(err?.message || "");
          const is429 =
            err?.status === 429 ||
            err?.response?.status === 429 ||
            errMsg.includes("429") ||
            errMsg.toLowerCase().includes("too many requests") ||
            errMsg.toLowerCase().includes("rate limit");

          console.warn(`[TON Send API] ${operationName} failed (attempt ${attempt}/${maxRetries}):`, errMsg);

          if (is429 && attempt <= maxRetries) {
            // Wait with progressive backoff: 1.5s, 2.5s, 3.5s...
            const delayMs = 1200 + attempt * 1000;
            console.log(`[TON Send API] 429 encountered during ${operationName}. Waiting ${delayMs}ms before retry...`);
            await new Promise((r) => setTimeout(r, delayMs));

            // Switch to next candidate endpoint if multiple available
            if (candidateEndpoints.length > 1) {
              activeClientIndex = (activeClientIndex + 1) % candidateEndpoints.length;
              client = getClient();
              wallet = client.open(walletContract);
            }
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Max retries reached for ${operationName}`);
    };

    // 7. Verify Balance (with retry)
    const balanceNano = await executeWithRetry("getBalance", () => wallet.getBalance());
    const requiredNano = toNano(parsedAmount.toString()) + toNano("0.02");

    if (balanceNano < requiredNano) {
      return NextResponse.json(
        {
          error: `Unzureichendes Guthaben. Aktuell verfügbar: ${fromNano(balanceNano)} GRAM. Erforderlich: ${fromNano(requiredNano)} GRAM (inkl. ca. 0.02 GRAM Netzwerk-Reserve).`,
        },
        { status: 400 }
      );
    }

    // Rate-limit safety: Spaced execution to respect public RPC rate limit (1 req/sec)
    await new Promise((r) => setTimeout(r, 1250));

    // 8. Get Seqno & Send Transfer (with retry)
    const seqno = await executeWithRetry("getSeqno", () => wallet.getSeqno());

    await new Promise((r) => setTimeout(r, 1250));

    await executeWithRetry("sendTransfer", () =>
      wallet.sendTransfer({
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
      })
    );

    // 9. Log activity
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "unknown";
    await logUserActivity(
      currentUser.id,
      `SEND_GRAM: ${parsedAmount} GRAM to ${recipient.slice(0, 8)}...`,
      clientIp,
      userAgent
    );

    return NextResponse.json({
      success: true,
      message: `${parsedAmount} GRAM erfolgreich versendet!`,
      amount: parsedAmount,
      recipient: recipient.trim(),
      sender: walletContract.address.toString({ testOnly: false, bounceable: false }),
    });
  } catch (error: any) {
    console.error("[TON/GRAM Send Error]:", error);

    const errMsg = String(error?.message || "");
    const isRateLimit =
      error?.status === 429 ||
      error?.response?.status === 429 ||
      errMsg.includes("429") ||
      errMsg.toLowerCase().includes("too many requests") ||
      errMsg.toLowerCase().includes("rate limit");

    if (isRateLimit) {
      return NextResponse.json(
        {
          error: "Blockchain Rate-Limit (Fehlercode 429): Die Toncenter RPC-Schnittstelle ist kurzzeitig stark ausgelastet. Bitte warten Sie einen kurzen Augenblick und versuchen Sie es erneut.",
          code: 429,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Fehler beim Versenden der GRAM-Transaktion." },
      { status: 500 }
    );
  }
}
