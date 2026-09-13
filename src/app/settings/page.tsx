import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Shield, Server, Bot, Key, Sparkles, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

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
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">System & Environment Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration parameters and subsystem integration diagnostics
        </p>
      </div>

      {/* Connectivity Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Subsystem Status & API Connectivity
          </CardTitle>
          <CardDescription className="text-xs">
            Live integration health for Telegram MTProto, Bot API, and xAI Grok
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Telegram Bot API */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold">Telegram Bot API</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Powers automated post delivery & sendPaidMedia paywalls
                </p>
              </div>
              {hasBotToken ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="warning">Demo Mode</Badge>
              )}
            </div>

            {/* Telegram MTProto (GramJS) */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-semibold">GramJS MTProto Worker</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Synchronizes native payments.getStarsTransactions every 15m
                </p>
              </div>
              {hasMTProto ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="warning">Session Pending</Badge>
              )}
            </div>

            {/* xAI Grok API */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">xAI Grok API</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Strict JSON Mode for content scheduling & caption generation
                </p>
              </div>
              {hasXAI ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="warning">Simulation Mode</Badge>
              )}
            </div>

            {/* TON Blockchain RPC */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#0098EA]" />
                  <span className="text-sm font-semibold">TON Blockchain RPC</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  On-chain transaction verifier via TonCenter / TonAPI
                </p>
              </div>
              <Badge variant="success">Online</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversion Rate Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monetization Conversion Rates</CardTitle>
          <CardDescription className="text-xs">
            Standard Telegram Stars to USD valuation benchmark
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">1 Telegram Star (⭐️) Valuation</span>
            <span className="font-mono font-bold">${starRate} USD</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">10,000 Telegram Stars</span>
            <span className="font-mono font-bold">${(10000 * parseFloat(starRate)).toFixed(2)} USD</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Holding Period</span>
            <span className="font-bold text-amber-400">Strictly 21 Days Escrow</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
