import React from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";

export const revalidate = 0;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor");
  }

  const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "demo_token");
  const hasMTProto = Boolean(process.env.TELEGRAM_SESSION_STRING && process.env.TELEGRAM_SESSION_STRING.length > 20);
  const hasXAI = Boolean(process.env.XAI_API_KEY && process.env.XAI_API_KEY !== "demo_xai_key");
  const starRate = process.env.STAR_USD_RATE || "0.013";

  return (
    <SettingsClient
      hasBotToken={hasBotToken}
      hasMTProto={hasMTProto}
      hasXAI={hasXAI}
      starRate={starRate}
    />
  );
}
