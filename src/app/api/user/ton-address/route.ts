import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isValidTonAddress } from "@/lib/ton";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { tonAddress } = body;

    if (!tonAddress || !isValidTonAddress(tonAddress)) {
      return NextResponse.json({ error: "Invalid TON wallet address format" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: { tonAddress },
    });

    return NextResponse.json({
      success: true,
      tonAddress: updated.tonAddress,
      message: "TON payout address successfully linked to your account.",
    });
  } catch (error: any) {
    console.error("Error saving TON address:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
