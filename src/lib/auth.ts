import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_autoacts";

export interface SessionUser {
  id: string;
  email: string | null;
  name?: string | null;
  role: "MASTER_ADMIN" | "INVESTOR";
  tonAddress?: string | null;
  isActive: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: SessionUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tonAddress: user.tonAddress,
      isActive: user.isActive,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionUser;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Retrieves the current session user from the auth_token cookie.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;

  const session = verifyToken(token);
  if (!session) return null;

  // Verify from DB if active
  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, tonAddress: true, isActive: true },
  });

  if (!dbUser || !dbUser.isActive) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as "MASTER_ADMIN" | "INVESTOR",
    tonAddress: dbUser.tonAddress,
    isActive: dbUser.isActive,
  };
}

/**
 * Ensures the Master Admin account configured in environment variables
 * exists in PostgreSQL and has the correct password hash.
 */
export async function ensureMasterAdmin(): Promise<void> {
  const masterEmail = process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link";
  const masterPassword = process.env.MASTER_ADMIN_PASSWORD || "MasterAdmin2025!";

  const existingMaster = await prisma.user.findUnique({
    where: { email: masterEmail },
  });

  if (!existingMaster) {
    const hash = await hashPassword(masterPassword);
    await prisma.user.create({
      data: {
        email: masterEmail,
        name: "Master Administrator",
        passwordHash: hash,
        role: Role.MASTER_ADMIN,
        isRegistered: true,
        isActive: true,
      },
    });
    console.log(`[Auth] Master Admin initialized for ${masterEmail}`);
  } else if (existingMaster.role !== Role.MASTER_ADMIN) {
    await prisma.user.update({
      where: { id: existingMaster.id },
      data: { role: Role.MASTER_ADMIN },
    });
  }
}

/**
 * Logs a user activity action (Login, submit expense, view, etc.)
 */
export async function logUserActivity(
  userId: string,
  action: string,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<void> {
  try {
    await prisma.userActivityLog.create({
      data: {
        userId,
        action,
        ipAddress: clientIp || "unknown",
        userAgent: userAgent || "unknown",
      },
    });
  } catch (err) {
    console.error("[Auth] Failed to log user activity:", err);
  }
}

/**
 * Generates a cryptographically random registration key for inviting an Investor.
 */
export function generateRegistrationKey(prefix = "ACTS-INV"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${random}`;
}
