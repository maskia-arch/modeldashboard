import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decryptMnemonic } from "@/lib/wallet-crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Bitte geben Sie Ihr Account-Passwort ein." },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, passwordHash: true, tonWalletEncrypted: true, tonAddress: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Benutzer nicht gefunden." }, { status: 404 });
    }

    if (!dbUser.passwordHash) {
      return NextResponse.json(
        { error: "Kein Passwort für dieses Konto hinterlegt." },
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

    if (!dbUser.tonWalletEncrypted) {
      return NextResponse.json(
        {
          error: "Keine Dashboard-generierten Schlüssel im Profil hinterlegt. Es handelt sich um eine externe Wallet (Watch-Only).",
          isExternalWallet: true,
        },
        { status: 400 }
      );
    }

    const words = decryptMnemonic(dbUser.tonWalletEncrypted);
    return NextResponse.json({
      success: true,
      mnemonic: words,
      tonAddress: dbUser.tonAddress,
    });
  } catch (error: any) {
    console.error("Error revealing wallet mnemonic:", error);
    return NextResponse.json(
      { error: error.message || "Fehler beim Entschlüsseln der Wallet-Schlüssel." },
      { status: 500 }
    );
  }
}
