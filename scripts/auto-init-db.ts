import { execSync } from "child_process";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

console.log("=================================================");
console.log("🚀 [Auto-Init] Starting Database Auto-Setup & Sync");
console.log("=================================================");

async function autoSetupDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ [Auto-Init] DATABASE_URL is not set! Skipping auto-migration.");
    return;
  }

  // 1. Run prisma db push to apply / update schema non-destructively
  console.log("🔄 [Auto-Init] Synchronizing Prisma Schema with Database...");
  try {
    execSync("npx prisma db push --skip-generate", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("✅ [Auto-Init] Database schema is up-to-date.");
  } catch (error) {
    console.error("⚠️ [Auto-Init] Warning during 'prisma db push':", error);
  }

  // 2. Ensure Master Admin Account from ENV exists
  const prisma = new PrismaClient();
  try {
    const masterEmail = (process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link").toLowerCase().trim();
    const masterPass = process.env.MASTER_ADMIN_PASSWORD || "MasterAdmin2025!";
    const masterPasswordHash = await bcrypt.hash(masterPass, 10);

    const existingMaster = await prisma.user.findUnique({
      where: { email: masterEmail },
    });

    if (!existingMaster) {
      console.log(`👤 [Auto-Init] Creating Master Admin account (${masterEmail})...`);
      await prisma.user.create({
        data: {
          email: masterEmail,
          name: "Master Administrator",
          passwordHash: masterPasswordHash,
          role: Role.MASTER_ADMIN,
          isRegistered: true,
          isActive: true,
        },
      });
      console.log("✅ [Auto-Init] Master Admin created successfully.");
    } else {
      // Update password hash in case Master changed it in .env
      await prisma.user.update({
        where: { id: existingMaster.id },
        data: {
          passwordHash: masterPasswordHash,
          role: Role.MASTER_ADMIN,
          isActive: true,
        },
      });
      console.log("✅ [Auto-Init] Master Admin verified & synced with current environment credentials.");
    }

    // 3. Ensure Default Models exist if DB is empty
    const modelCount = await prisma.model.count();
    if (modelCount === 0) {
      console.log("📦 [Auto-Init] No creator channels found. Seeding default channels...");
      await prisma.model.createMany({
        data: [
          {
            name: "Luna Starr",
            slug: "luna-starr",
            telegramChannelId: "-1002145896321",
            channelTitle: "Luna Starr Official VIP ✨",
            openInvestBalance: 0.0,
          },
          {
            name: "Elena Fox",
            slug: "elena-fox",
            telegramChannelId: "-1002987654321",
            channelTitle: "Elena Fox Club 🔥",
            openInvestBalance: 0.0,
          },
        ],
      });
      console.log("✅ [Auto-Init] Default channels seeded.");
    }
  } catch (err) {
    console.error("⚠️ [Auto-Init] Error during master account / model verification:", err);
  } finally {
    await prisma.$disconnect();
  }

  console.log("=================================================");
  console.log("✨ [Auto-Init] Database ready. Starting Service...");
  console.log("=================================================");
}

await autoSetupDatabase();
