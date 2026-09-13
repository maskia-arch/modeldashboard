import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, generateRegistrationKey } from "@/lib/auth";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      include: {
        assignedModels: {
          select: { id: true, name: true, slug: true, telegramChannelId: true },
        },
        _count: {
          select: {
            submittedExpenses: true,
            activityLogs: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { email, name, assignedModelIds, role } = body;

    let cleanEmail: string | null = null;
    if (email && typeof email === "string" && email.trim()) {
      cleanEmail = email.toLowerCase().trim();
      const existing = await prisma.user.findFirst({ where: { email: cleanEmail } });
      if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
    }

    const cleanName = name && typeof name === "string" && name.trim() ? name.trim() : null;
    const targetRole = role === "MASTER_ADMIN" ? Role.MASTER_ADMIN : Role.INVESTOR;
    const keyPrefix = targetRole === Role.MASTER_ADMIN ? "ACTS-MST" : "ACTS-INV";

    // Generate unique Registration Key
    const registrationKey = generateRegistrationKey(keyPrefix);

    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: cleanName,
        role: targetRole,
        registrationKey,
        isRegistered: false,
        isActive: true,
        assignedModels: assignedModelIds && Array.isArray(assignedModelIds) && targetRole === Role.INVESTOR ? {
          connect: assignedModelIds.map((id: string) => ({ id })),
        } : undefined,
      },
      include: {
        assignedModels: true,
      },
    });

    const inviteUrl = cleanEmail
      ? `https://model.autoacts.link/register?key=${registrationKey}&email=${encodeURIComponent(cleanEmail)}`
      : `https://model.autoacts.link/register?key=${registrationKey}`;

    return NextResponse.json({
      success: true,
      user: newUser,
      registrationKey,
      inviteUrl,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating investor invitation:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
