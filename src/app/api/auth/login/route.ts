import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, signToken, logUserActivity, ensureMasterAdmin } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 1. Check Master Admin Credentials via Environment Variables
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link").toLowerCase().trim();
    const masterPass = process.env.MASTER_ADMIN_PASSWORD || "MasterAdmin2025!";

    let user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (cleanEmail === masterEmail) {
      if (password === masterPass) {
        // Master admin authenticated directly from ENV
        if (!user) {
          const hash = await hashPassword(masterPass);
          user = await prisma.user.create({
            data: {
              email: masterEmail,
              name: "Master Administrator",
              passwordHash: hash,
              role: Role.MASTER_ADMIN,
              isRegistered: true,
              isActive: true,
            },
          });
        }
      } else {
        // Password mismatch for master
        return NextResponse.json({ error: "Invalid master admin credentials" }, { status: 401 });
      }
    } else {
      // Investor authentication from DB
      if (!user) {
        return NextResponse.json({ error: "Account not found or registration key required" }, { status: 404 });
      }

      if (!user.isActive) {
        return NextResponse.json({ error: "Your account has been suspended by the Master Administrator." }, { status: 403 });
      }

      if (!user.isRegistered || !user.passwordHash) {
        return NextResponse.json({ error: "Registration not completed. Please register with your invitation key." }, { status: 403 });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 });
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
