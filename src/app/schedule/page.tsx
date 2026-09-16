import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus } from "@prisma/client";
import { ScheduleClient } from "./ScheduleClient";

export const revalidate = 0;

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Master Admin has global schedule; Investors are routed to their personal models schedule tab
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor?tab=schedule");
  }

  const now = new Date();

  // Automatically update any overdue SCHEDULED posts to PENDING
  await prisma.post.updateMany({
    where: {
      status: PostStatus.SCHEDULED,
      scheduledFor: { lte: now },
    },
    data: {
      status: PostStatus.PENDING,
    },
  });

  const [models, posts, unusedAssetsCount] = await Promise.all([
    prisma.model.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        telegramChannelId: true,
        channelTitle: true,
        avatarUrl: true,
        _count: {
          select: {
            assets: { where: { isUsed: false } },
            posts: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.post.findMany({
      include: {
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            telegramChannelId: true,
            channelTitle: true,
            avatarUrl: true,
          },
        },
        asset: true,
      },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.asset.count({
      where: { isUsed: false },
    }),
  ]);

  return (
    <ScheduleClient
      initialModels={models}
      initialPosts={posts}
      totalUnusedAssets={unusedAssetsCount}
    />
  );
}
