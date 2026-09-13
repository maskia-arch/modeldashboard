import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UsersClient } from "./UsersClient";

export const revalidate = 0;

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "MASTER_ADMIN") {
    redirect("/login");
  }

  const [users, models] = await Promise.all([
    prisma.user.findMany({
      include: {
        assignedModels: {
          select: { id: true, name: true, slug: true, telegramChannelId: true, channelTitle: true },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: { submittedExpenses: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.model.findMany({
      select: { id: true, name: true, slug: true, telegramChannelId: true, channelTitle: true },
    }),
  ]);

  return <UsersClient initialUsers={users} allModels={models} />;
}
