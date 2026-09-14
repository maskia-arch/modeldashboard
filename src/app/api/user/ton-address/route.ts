import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isValidTonAddress } from "@/lib/ton";
import { encryptMnemonic } from "@/lib/wallet-crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, tonAddress: true, tonWalletEncrypted: true, role: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      tonAddress: user.tonAddress,
      hasEncryptedWallet: Boolean(user.tonWalletEncrypted),
      role: user.role,
      name: user.name,
      email: user.email,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { tonAddress, mnemonic } = body;

    if (!tonAddress || !isValidTonAddress(tonAddress)) {
      return NextResponse.json({ error: "Invalid TON wallet address format" }, { status: 400 });
    }

    let encryptedPayload: string | undefined;
    if (mnemonic) {
      const words = Array.isArray(mnemonic)
        ? mnemonic
        : typeof mnemonic === "string"
        ? mnemonic.trim().split(/\s+/)
        : [];
      if (words.length === 24) {
        encryptedPayload = encryptMnemonic(words);
      }
    }

    const updateData: any = {
      tonAddress: tonAddress.trim(),
    };
    if (encryptedPayload) {
      updateData.tonWalletEncrypted = encryptedPayload;
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      tonAddress: updated.tonAddress,
      hasEncryptedWallet: Boolean(updated.tonWalletEncrypted),
      message: "TON payout address successfully linked to your account.",
    });
  } catch (error: any) {
    console.error("Error saving TON address:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        tonAddress: null,
        tonWalletEncrypted: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "TON address unlinked from account.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
