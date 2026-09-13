import { PrismaClient, Role, AssetType, ExplicitLevel, PostStatus, TxStatus, ExpenseStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with Master Admin & Investor Roles...");

  // Clean existing data in order
  await prisma.userActivityLog.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.starTransaction.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.post.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.model.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Master Admin from Environment Variables
  const masterEmail = process.env.MASTER_ADMIN_EMAIL || "admin@autoacts.link";
  const masterPasswordRaw = process.env.MASTER_ADMIN_PASSWORD || "MasterAdmin2025!";
  const masterPasswordHash = await bcrypt.hash(masterPasswordRaw, 10);

  const masterAdmin = await prisma.user.create({
    data: {
      email: masterEmail,
      name: "Master Administrator",
      passwordHash: masterPasswordHash,
      role: Role.MASTER_ADMIN,
      isRegistered: true,
      isActive: true,
      tonAddress: "EQBvW8Z5huBkMJYdn3PCDnHoKKULeSuwxmY3GvWGmn3ZsV22",
    },
  });

  // 2. Create Registered Investor: Markus Weber
  const investorPassword = await bcrypt.hash("Investor2025!", 10);
  const investor1 = await prisma.user.create({
    data: {
      email: "investor@autoacts.link",
      name: "Markus Weber",
      passwordHash: investorPassword,
      role: Role.INVESTOR,
      registrationKey: "ACTS-KEY-MARKUS-7788",
      isRegistered: true,
      isActive: true,
      lastLoginAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      tonAddress: "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
    },
  });

  // 3. Create Invited (Pending Registration) Investor
  const investor2 = await prisma.user.create({
    data: {
      email: "sarah.invest@autoacts.link",
      name: "Sarah Jenkins",
      passwordHash: null,
      role: Role.INVESTOR,
      registrationKey: "ACTS-INV-849204",
      isRegistered: false,
      isActive: true,
    },
  });

  console.log(`Created users: Master (${masterAdmin.email}), Investor (${investor1.email}), Invited (${investor2.email})`);

  // 4. Create Models with Investor Assignments (Channel-Specific)
  const luna = await prisma.model.create({
    data: {
      name: "Luna Starr",
      slug: "luna-starr",
      telegramChannelId: "-1002145896321",
      channelTitle: "Luna Starr Official VIP ✨",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80",
      openInvestBalance: 2500.0,
      investorId: investor1.id, // Assigned to Markus Weber
    },
  });

  const elena = await prisma.model.create({
    data: {
      name: "Elena Fox",
      slug: "elena-fox",
      telegramChannelId: "-1002987654321",
      channelTitle: "Elena Fox Club 🔥",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80",
      openInvestBalance: 800.0,
      investorId: investor1.id, // Also assigned to Markus
    },
  });

  // 5. Create Expenses with Status Workflow (APPROVED vs PENDING_REVIEW)
  await prisma.expense.createMany({
    data: [
      {
        modelId: luna.id,
        description: "Initial Studio Photoshoot & Wardrobe",
        amountUsd: 1500.0,
        receiptUrl: "https://autoacts.link/receipts/shoot_01.pdf",
        status: ExpenseStatus.APPROVED,
        submittedById: investor1.id,
        reviewedAt: new Date(),
        reviewNote: "Legit invoice verified by Master Admin.",
      },
      {
        modelId: luna.id,
        description: "Telegram Promo Ads Campaign (Direct Buy)",
        amountUsd: 1000.0,
        receiptUrl: "https://autoacts.link/receipts/ads_tg_01.pdf",
        status: ExpenseStatus.APPROVED,
        submittedById: investor1.id,
        reviewedAt: new Date(),
        reviewNote: "Confirmed active in Telegram channel ads.",
      },
      {
        modelId: luna.id,
        description: "Instagram Shoutout Reel",
        amountUsd: 650.0,
        receiptUrl: "https://autoacts.link/receipts/insta_shoutout.pdf",
        status: ExpenseStatus.PENDING_REVIEW,
        submittedById: investor1.id,
      },
      {
        modelId: elena.id,
        description: "Video production & lighting gear",
        amountUsd: 800.0,
        receiptUrl: "https://autoacts.link/receipts/elena_gear.pdf",
        status: ExpenseStatus.APPROVED,
        submittedById: investor1.id,
        reviewedAt: new Date(),
        reviewNote: "Approved camera gear.",
      },
    ],
  });

  // 6. Create Assets
  const asset1 = await prisma.asset.create({
    data: {
      modelId: luna.id,
      fileUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop",
      type: AssetType.PHOTO,
      explicitLevel: ExplicitLevel.TEASER,
      tags: ["morning", "sunlight", "smile", "casual"],
      isUsed: true,
    },
  });

  const asset2 = await prisma.asset.create({
    data: {
      modelId: luna.id,
      fileUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop",
      type: AssetType.PHOTO,
      explicitLevel: ExplicitLevel.PPV,
      tags: ["fashion", "exclusive", "spicy"],
      isUsed: false,
    },
  });

  // 7. Star Transactions (Matured vs Pending)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twentyTwoDaysAgo = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  // Matured for Luna: $1,950 + $1,040 = $2,990 (Covers the $2,500 approved invest and generates $490 profit)
  await prisma.starTransaction.createMany({
    data: [
      {
        modelId: luna.id,
        telegramTxId: "tx_stars_1001",
        starsAmount: 150000,
        estimatedUsd: 1950.0,
        transactionDate: thirtyDaysAgo,
        maturesAt: new Date(thirtyDaysAgo.getTime() + 21 * 24 * 60 * 60 * 1000),
        status: TxStatus.MATURED,
      },
      {
        modelId: luna.id,
        telegramTxId: "tx_stars_1002",
        starsAmount: 80000,
        estimatedUsd: 1040.0,
        transactionDate: twentyTwoDaysAgo,
        maturesAt: new Date(twentyTwoDaysAgo.getTime() + 21 * 24 * 60 * 60 * 1000),
        status: TxStatus.MATURED,
      },
      {
        modelId: luna.id,
        telegramTxId: "tx_stars_1003",
        starsAmount: 60000,
        estimatedUsd: 780.0,
        transactionDate: fiveDaysAgo,
        maturesAt: new Date(fiveDaysAgo.getTime() + 21 * 24 * 60 * 60 * 1000),
        status: TxStatus.PENDING,
      },
      {
        modelId: elena.id,
        telegramTxId: "tx_stars_2001",
        starsAmount: 40000,
        estimatedUsd: 520.0,
        transactionDate: thirtyDaysAgo,
        maturesAt: new Date(thirtyDaysAgo.getTime() + 21 * 24 * 60 * 60 * 1000),
        status: TxStatus.MATURED,
      },
    ],
  });

  // 8. Sample Posts
  await prisma.post.create({
    data: {
      modelId: luna.id,
      assetId: asset1.id,
      caption: "Guten Morgen ihr Lieben! ✨ Habt einen tollen Tag!",
      starsPrice: 0,
      scheduledFor: new Date(now.getTime() - 60 * 60 * 1000),
      status: PostStatus.PUBLISHED,
      telegramMsgId: "89123",
    },
  });

  // 9. Activity Logs for Markus Weber
  await prisma.userActivityLog.createMany({
    data: [
      {
        userId: investor1.id,
        action: "LOGIN",
        ipAddress: "185.220.101.5",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        userId: investor1.id,
        action: "SUBMIT_EXPENSE",
        ipAddress: "185.220.101.5",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      },
    ],
  });

  console.log("Database seeded successfully with Master & Investor workflow!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
