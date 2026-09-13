import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, generateRegistrationKey } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        assignedModels: true,
        submittedExpenses: {
          include: { model: true },
          orderBy: { createdAt: "desc" },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { isActive, assignedModelIds, regenerateKey, role } = body;

    const targetUser = await prisma.user.findUnique({ where: { id: params.id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const masterAdminEmail = process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link";
    const isRootMaster = targetUser.email.toLowerCase() === masterAdminEmail.toLowerCase();

    const dataToUpdate: any = {};

    if (role && role !== targetUser.role) {
      if (isRootMaster) {
        return NextResponse.json(
          { error: "The primary Root Master Admin account cannot be modified or demoted." },
          { status: 400 }
        );
      }
      if (targetUser.id === currentUser.id) {
        return NextResponse.json(
          { error: "You cannot change your own role to prevent administrative lockout." },
          { status: 400 }
        );
      }
      if (role === "MASTER_ADMIN" || role === "INVESTOR") {
        dataToUpdate.role = role;
      }
    }

    if (typeof isActive === "boolean") {
      if (isRootMaster && !isActive) {
        return NextResponse.json(
          { error: "The primary Root Master Admin account cannot be suspended." },
          { status: 400 }
        );
      }
      dataToUpdate.isActive = isActive;
    }
    if (regenerateKey) {
      const keyPrefix = targetUser.role === "MASTER_ADMIN" ? "ACTS-MST" : "ACTS-INV";
      dataToUpdate.registrationKey = generateRegistrationKey(keyPrefix);
      dataToUpdate.isRegistered = false;
      dataToUpdate.passwordHash = null;
    }
    if (Array.isArray(assignedModelIds)) {
      dataToUpdate.assignedModels = {
        set: assignedModelIds.map((id: string) => ({ id })),
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: dataToUpdate,
      include: { assignedModels: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
