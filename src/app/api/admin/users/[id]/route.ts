import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, generateRegistrationKey, hashPassword } from "@/lib/auth";

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
    const { name, email, tonAddress, password, isActive, assignedModelIds, regenerateKey, role } = body;

    const targetUser = await prisma.user.findUnique({ where: { id: params.id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const masterAdminEmail = process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link";
    const isRootMaster = targetUser.email
      ? targetUser.email.toLowerCase() === masterAdminEmail.toLowerCase()
      : false;

    const dataToUpdate: any = {};

    if (name !== undefined) {
      dataToUpdate.name = typeof name === "string" && name.trim() ? name.trim() : null;
    }

    if (email !== undefined) {
      const cleanEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
      if (cleanEmail && cleanEmail !== targetUser.email?.toLowerCase()) {
        const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (existing && existing.id !== targetUser.id) {
          return NextResponse.json(
            { error: "Diese E-Mail-Adresse wird bereits von einem anderen Benutzer verwendet." },
            { status: 400 }
          );
        }
      }
      dataToUpdate.email = cleanEmail;
    }

    if (tonAddress !== undefined) {
      dataToUpdate.tonAddress = typeof tonAddress === "string" && tonAddress.trim() ? tonAddress.trim() : null;
    }

    if (password && typeof password === "string" && password.trim()) {
      if (password.trim().length < 6) {
        return NextResponse.json(
          { error: "Das Passwort muss mindestens 6 Zeichen lang sein." },
          { status: 400 }
        );
      }
      dataToUpdate.passwordHash = await hashPassword(password.trim());
      dataToUpdate.isRegistered = true;
    }

    if (role && role !== targetUser.role) {
      if (isRootMaster) {
        return NextResponse.json(
          { error: "Das primäre Root Master Admin Konto kann nicht modifiziert oder herabgestuft werden." },
          { status: 400 }
        );
      }
      if (targetUser.id === currentUser.id) {
        return NextResponse.json(
          { error: "Sie können Ihre eigene Rolle nicht ändern, um einen Ausschluss zu verhindern." },
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
          { error: "Das primäre Root Master Admin Konto kann nicht gesperrt werden." },
          { status: 400 }
        );
      }
      dataToUpdate.isActive = isActive;
    }

    if (regenerateKey) {
      const keyPrefix = (dataToUpdate.role || targetUser.role) === "MASTER_ADMIN" ? "ACTS-MST" : "ACTS-INV";
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
      include: {
        assignedModels: {
          select: { id: true, name: true, slug: true, telegramChannelId: true, channelTitle: true },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: params.id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const masterAdminEmail = process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link";
    const isRootMaster = targetUser.email
      ? targetUser.email.toLowerCase() === masterAdminEmail.toLowerCase()
      : false;

    if (isRootMaster) {
      return NextResponse.json(
        { error: "Das primäre Root-Master-Konto kann nicht gelöscht werden." },
        { status: 400 }
      );
    }

    if (targetUser.id === currentUser.id) {
      return NextResponse.json(
        { error: "Sie können Ihr eigenes aktuell angemeldetes Administratorkonto nicht löschen." },
        { status: 400 }
      );
    }

    // Disconnect assigned models
    await prisma.model.updateMany({
      where: { investorId: targetUser.id },
      data: { investorId: null },
    });

    // Disconnect submitted expenses
    await prisma.expense.updateMany({
      where: { submittedById: targetUser.id },
      data: { submittedById: null },
    });

    // Delete user activity logs
    await prisma.userActivityLog.deleteMany({
      where: { userId: targetUser.id },
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: targetUser.id },
    });

    return NextResponse.json({ success: true, message: "Benutzer erfolgreich gelöscht." });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
