import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "initializing";
  }

  return NextResponse.json({
    status: "ok",
    app: "model-dashboard",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
}
