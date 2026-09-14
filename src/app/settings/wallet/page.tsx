import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { TonWalletManager } from "@/components/TonWalletManager";

export const revalidate = 0;

export default async function WalletSettingsPage() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tonAddress: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      <TonWalletManager currentUser={user} />
    </div>
  );
}
