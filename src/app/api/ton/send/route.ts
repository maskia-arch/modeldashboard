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
      return NextResponse.json(
        {
          error: "Kein aktiver Wallet-Schlüssel gefunden. Bitte richten Sie Ihr Wallet in den Einstellungen neu ein oder sichern Sie es ab.",
        },
        { status: 400 }
      );
    }

    // 6. Initialize TonClient & Contract
    const endpoint = process.env.TON_API_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
    const apiKey = process.env.TON_API_KEY || undefined;

    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const keyPair = await mnemonicToPrivateKey(words);
    const walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const wallet = client.open(walletContract);

    // 7. Verify Balance
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

    // 8. Get Seqno & Send Transfer
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

    // 9. Log activity
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
