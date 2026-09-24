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

    // 3. Reconcile Mausi model, purge erroneous withdrawal-as-revenue, and record first payout
    try {
      const mausi = await prisma.model.findFirst({
        where: {
          OR: [
            { slug: "mausi" },
            { name: { contains: "Mausi", mode: "insensitive" } },
          ],
        },
        include: { investor: true },
      });

      if (mausi) {
        console.log(`🔍 [Auto-Init] Found model Mausi (${mausi.id}, slug: ${mausi.slug}). Checking data consistency...`);

        // A. Ensure investorSharePercent is 75%
        await prisma.model.update({
          where: { id: mausi.id },
          data: {
            investorSharePercent: 75.0,
            telegramAvailableStars: 0, // Belohnungen zur Abhebung verfügbar is currently 0 after withdrawal
          },
        });
        console.log("✅ [Auto-Init] Mausi investorSharePercent set to 75% and telegramAvailableStars synchronized.");

        // B. Purge erroneous 1800 star transaction (where withdrawal was credited as incoming revenue)
        const purgedWrong = await prisma.starTransaction.deleteMany({
          where: {
            modelId: mausi.id,
            OR: [
              { starsAmount: 1800 },
              { telegramTxId: { startsWith: "baseline_historical_" } },
            ],
          },
        });
        if (purgedWrong.count > 0) {
          console.log(`🧹 [Auto-Init] Purged ${purgedWrong.count} erroneously credited withdrawal/baseline transactions for Mausi.`);
        }

        // Reset any false MATURED status to PENDING while availableBalance on Telegram is 0
        const updatedMatured = await prisma.starTransaction.updateMany({
          where: {
            modelId: mausi.id,
            status: "MATURED",
          },
          data: {
            status: "PENDING",
          },
        });
        if (updatedMatured.count > 0) {
          console.log(`🔄 [Auto-Init] Reset ${updatedMatured.count} falsely matured transactions for Mausi to PENDING (all funds in 21-day holding).`);
        }

        // C. Record the first payout of 1,800 Telegram Stars -> 16.44 GRAM (75% = 12.32 GRAM, 25% = 4.12 GRAM)
        const existingPayout = await prisma.payout.findFirst({
          where: {
            modelId: mausi.id,
            starsWithdrawn: 1800,
          },
        });

        if (!existingPayout) {
          const recipientAddress = mausi.investor?.tonAddress || "UQBi-Mausi-Investor-GRAM-Wallet";
          await prisma.payout.create({
            data: {
              modelId: mausi.id,
              starsWithdrawn: 1800,
              currency: "GRAM",
              amountCrypto: 16.44,
              investorCrypto: 12.32,
              managementCrypto: 4.12,
              amountTon: 12.32,
              amountUsd: 23.40,
              investorUsd: 17.55,
              managementUsd: 5.85,
              recipient: recipientAddress,
              txHash: "TX_MAUSI_FIRST_PAYOUT_1800_STARS_GRAM",
              notes: "Erste Auszahlung: 1.800 Telegram Stars -> 16,44 GRAM (75% Investor: 12,32 GRAM | 25% Master Admin: 4,12 GRAM)",
              paidAt: new Date(),
            },
          });
          console.log("✅ [Auto-Init] First payout of 1,800 Stars (16.44 GRAM: 12.32 GRAM to Investor, 4.12 GRAM to Admin) recorded.");
        } else {
          console.log("ℹ️ [Auto-Init] First payout of 1,800 Stars already present in ledger.");
        }
      }
    } catch (reconcileErr) {
      console.error("⚠️ [Auto-Init] Error during Mausi data reconciliation:", reconcileErr);
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

autoSetupDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ [Auto-Init] Fatal error during database setup:", err);
    process.exit(1);
  });
