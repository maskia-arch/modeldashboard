import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, signToken, logUserActivity, ensureMasterAdmin } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = (body.username || body.email || "").trim();
    const password = (body.password || "").trim();

    if (!identifier || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const cleanIdentifier = identifier.toLowerCase();
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 1. Check Master Admin Credentials
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link").toLowerCase().trim();
    const masterPass = process.env.MASTER_ADMIN_PASSWORD || "MasterAdmin2025!";
    const masterUsername = (process.env.MASTER_ADMIN_USERNAME || "admin").toLowerCase().trim();

    let user: any = null;

    if (cleanIdentifier === masterEmail || cleanIdentifier === masterUsername) {
      if (password === masterPass) {
        // Authenticate Master Admin
        user = await prisma.user.findUnique({
          where: { email: masterEmail },
        });

        if (!user) {
          const hash = await hashPassword(masterPass);
          user = await prisma.user.create({
            data: {
              email: masterEmail,
              name: "Administrator",
              passwordHash: hash,
              role: Role.MASTER_ADMIN,
              isRegistered: true,
              isActive: true,
            },
          });
        }
      } else {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }
    } else {
      // 2. Authenticate Investor from DB (via email or username)
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: cleanIdentifier },
            { name: { equals: identifier, mode: "insensitive" } },
          ],
        },
      });

      if (!user) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }

      if (!user.isActive) {
        return NextResponse.json({ error: "Your access has been suspended. Please contact support." }, { status: 403 });
      }

      if (!user.isRegistered || !user.passwordHash) {
        return NextResponse.json({ error: "Account not activated yet. Please register with your invitation key." }, { status: 403 });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log Activity
    await logUserActivity(user.id, "LOGIN", clientIp, userAgent);

    // Sign JWT
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "MASTER_ADMIN" | "INVESTOR",
      tonAddress: user.tonAddress,
      isActive: user.isActive,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tonAddress: user.tonAddress,
      },
    });

    // Set cookie
    response.cookies.set({
      name: "auth_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: "lax",
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
