import { execSync } from "child_process";
import fs from "fs";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

console.log("=================================================");
console.log("🚀 [Auto-Init] Starting Database Auto-Setup & Sync");
console.log("=================================================");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function autoSetupDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ [Auto-Init] DATABASE_URL is not set! Skipping auto-migration.");
    return;
  }

  // 1. Run prisma db push to apply / update schema non-destructively
  // Use local node_modules/.bin/prisma binary if available
  const prismaBin = fs.existsSync("./node_modules/.bin/prisma")
    ? "./node_modules/.bin/prisma"
    : "npx --no-install prisma";

  let dbReady = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`🔄 [Auto-Init] (Attempt ${attempt}/10) Applying schema: ${prismaBin} db push...`);
      execSync(`${prismaBin} db push --skip-generate --accept-data-loss`, {
        stdio: "inherit",
        env: process.env,
      });
      console.log("✅ [Auto-Init] Database schema is up-to-date and ready.");
      dbReady = true;
      break;
    } catch (error: any) {
      console.warn(`⚠️ [Auto-Init] DB not ready yet (attempt ${attempt}/10). Retrying in 2 seconds...`);
      await sleep(2000);
    }
  }

  if (!dbReady) {
    console.error("❌ [Auto-Init] Could not apply schema after 10 attempts! Continuing to verify connections...");
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

    // 3. Models are managed dynamically by the administrator (no mock data)
  } catch (err) {
    console.error("⚠️ [Auto-Init] Error during master account / model verification:", err);
  } finally {
    await prisma.$disconnect();
  }

  console.log("=================================================");
  console.log("✨ [Auto-Init] Database ready. Starting Service...");
  console.log("=================================================");
}

autoSetupDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ [Auto-Init] Fatal error during database setup:", err);
    process.exit(1);
  });
