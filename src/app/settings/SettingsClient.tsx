"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Bot, Shield, Sparkles, Wallet } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface SettingsClientProps {
  hasBotToken: boolean;
  hasMTProto: boolean;
  hasXAI: boolean;
  starRate: string;
}

export function SettingsClient({
  hasBotToken,
  hasMTProto,
  hasXAI,
  starRate,
}: SettingsClientProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t.settings.subtitle}
        </p>
      </div>

      {/* Connectivity Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            {t.settings.diagnosticsTitle}
          </CardTitle>
          <CardDescription className="text-xs">
            {t.settings.diagnosticsDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Telegram Bot API */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold">{t.settings.botApi}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.settings.botApiDesc}
                </p>
              </div>
              {hasBotToken ? (
                <Badge variant="success">{t.settings.configured}</Badge>
              ) : (
                <Badge variant="warning">{t.settings.demoMode}</Badge>
              )}
            </div>

            {/* Telegram MTProto (GramJS) */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-semibold">{t.settings.mtproto}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.settings.mtprotoDesc}
                </p>
              </div>
              {hasMTProto ? (
                <Badge variant="success">{t.settings.connected}</Badge>
              ) : (
                <Badge variant="warning">{t.settings.sessionPending}</Badge>
              )}
            </div>

            {/* xAI Grok API */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">{t.settings.grokApi}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.settings.grokApiDesc}
                </p>
              </div>
              {hasXAI ? (
                <Badge variant="success">{t.settings.active}</Badge>
              ) : (
                <Badge variant="warning">{t.settings.simulationMode}</Badge>
              )}
            </div>

            {/* TON Blockchain RPC */}
            <div className="p-3.5 rounded-lg border bg-muted/30 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#0098EA]" />
                  <span className="text-sm font-semibold">{t.settings.tonClient}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.settings.tonClientDesc}
                </p>
              </div>
              <Badge variant="success">{t.settings.liveMainnet}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversion Rate Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.settings.parametersTitle}</CardTitle>
          <CardDescription className="text-xs">
            {t.settings.parametersDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">{t.settings.starRateLabel}</span>
            <span className="font-mono font-bold">${starRate} USD</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">10,000 Telegram Stars</span>
            <span className="font-mono font-bold">${(10000 * parseFloat(starRate)).toFixed(2)} USD</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">{t.settings.holdingPeriodLabel}</span>
            <span className="font-bold text-amber-400">{t.settings.holdingPeriodValue}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
