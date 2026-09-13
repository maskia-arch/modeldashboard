import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, logUserActivity } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { error: "Registrierungsschlüssel erforderlich" },
        { status: 400 }
      );
    }

    const cleanKey = key.trim().toUpperCase();
    const user = await prisma.user.findFirst({
      where: {
        registrationKey: cleanKey,
      },
      include: {
        assignedModels: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Ungültiger Registrierungsschlüssel. Bitte wenden Sie sich an den Master Administrator." },
        { status: 404 }
      );
    }

    if (user.isRegistered) {
      return NextResponse.json(
        { error: "Dieser Registrierungsschlüssel wurde bereits eingelöst. Bitte loggen Sie sich ein." },
        { status: 409 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Dieser Zugangsschlüssel wurde vom Administrator deaktiviert." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: user.email || "",
      name: user.name || "",
      role: user.role,
      assignedModels: user.assignedModels || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { registrationKey, email, password, name, tonAddress } = body;

    if (!registrationKey || !email || !password) {
      return NextResponse.json(
        { error: "Registration key, email, and password are required" },
        { status: 400 }
      );
    }

    const cleanKey = registrationKey.trim().toUpperCase();
    const cleanEmail = email.toLowerCase().trim();

    // Verify key in database
    const user = await prisma.user.findFirst({
      where: {
        registrationKey: cleanKey,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid registration key. You must obtain an access key from the Master Administrator." },
        { status: 403 }
      );
    }

    if (user.isRegistered) {
      return NextResponse.json(
        { error: "This registration key has already been used. Please log in directly." },
        { status: 409 }
      );
    }

    // Verify email is not already taken by another user
    const existingWithEmail = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        id: { not: user.id },
      },
    });
    if (existingWithEmail) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits von einem anderen Benutzer verwendet." },
        { status: 409 }
      );
    }

    // Complete registration
    const passwordHash = await hashPassword(password);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: cleanEmail,
        name: name || user.name || "Investor",
        passwordHash,
        isRegistered: true,
        isActive: true,
        tonAddress: tonAddress || user.tonAddress,
        lastLoginAt: new Date(),
      },
    });

    // Log registration activity
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "unknown";
    await logUserActivity(updatedUser.id, "REGISTER_VIA_KEY", clientIp, userAgent);

    // Sign JWT session
    const token = signToken({
      id: updatedUser.id,
      email: cleanEmail,
      name: updatedUser.name,
      role: updatedUser.role as "MASTER_ADMIN" | "INVESTOR",
      tonAddress: updatedUser.tonAddress,
      isActive: updatedUser.isActive,
    });

    const response = NextResponse.json({
      success: true,
      message: "Registration completed successfully.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      },
    });

    response.cookies.set({
      name: "auth_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });

    return response;
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
