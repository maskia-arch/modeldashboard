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
    const { isActive, assignedModelIds, regenerateKey } = body;

    const dataToUpdate: any = {};
    if (typeof isActive === "boolean") {
      dataToUpdate.isActive = isActive;
    }
    if (regenerateKey) {
      dataToUpdate.registrationKey = generateRegistrationKey("ACTS-INV");
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
