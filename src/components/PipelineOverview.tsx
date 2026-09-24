"use client";

import React from "react";
import { Lock, RefreshCw, CheckCircle2, ArrowRight, DollarSign, Wallet, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import type { ModelFinancials } from "@/lib/financial-engine";
import { useLanguage } from "@/context/LanguageContext";

interface PipelineOverviewProps {
  financials: ModelFinancials;
  modelName?: string;
  onOpenPayout?: () => void;
}

export function PipelineOverview({ financials, modelName, onOpenPayout }: PipelineOverviewProps) {
  const { t, language } = useLanguage();
  const {
    totalInvestTargetUsd,
    recoupedUsd,
    remainingInvestBalanceUsd,
    isRecouped,
    recoupmentProgressPercent,
    partnerTotalShareUsd,
    totalPaidOutUsd,
    partnerAvailablePayoutUsd,
    pipeline,
    modelName: financialsModelName,
    investorSharePercent = 50,
  } = financials;

  const investorShare = investorSharePercent;
  const agencyShare = 100 - investorShare;

  return (
    <div className="space-y-6">
      {/* Top Banner: Recoupment Status & Progress */}
      <Card className="border-indigo-500/20 bg-gradient-to-r from-card via-card to-indigo-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{t.pipeline.title}</h2>
                {financials.enableExpenseRecoupment === false ? (
                  <Badge variant="info" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t.pipeline.directSplitActive.replace("{split}", `${investorShare}/${agencyShare}`)}
                  </Badge>
                ) : isRecouped ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t.pipeline.recouped100Active.replace("{split}", `${investorShare}/${agencyShare}`)}
                  </Badge>
                ) : (
                  <Badge variant="warning" className="gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {t.pipeline.recoupingProgress.replace("{pct}", `${investorShare}`)}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {financials.enableExpenseRecoupment === false
                  ? t.pipeline.directSplitDesc.replace("{investor}", `${investorShare}`).replace("{management}", `${agencyShare}`)
                  : isRecouped
                  ? t.pipeline.recoupedDesc
                      .replace("{amount}", formatUsd(totalInvestTargetUsd))
                      .replace("{investor}", `${investorShare}`)
                      .replace("{management}", `${agencyShare}`)
                  : t.pipeline.recoupingDesc
                      .replace("{recouped}", formatUsd(recoupedUsd))
                      .replace("{total}", formatUsd(totalInvestTargetUsd))
                      .replace("{remaining}", formatUsd(remainingInvestBalanceUsd))
                      .replace("{investor}", `${investorShare}`)
                      .replace("{management}", `${agencyShare}`)}
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-indigo-400">
                {recoupmentProgressPercent}%
              </div>
              <span className="text-xs text-muted-foreground">{t.pipeline.ratioLabel}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 space-y-1.5">
            <Progress
              value={recoupmentProgressPercent}
              className="h-3 bg-muted/60"
              indicatorClassName={isRecouped ? "bg-emerald-500" : "bg-indigo-500"}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t.pipeline.recoupedLabel} {formatUsd(recoupedUsd)}</span>
              <span>{t.pipeline.openTargetLabel} {formatUsd(totalInvestTargetUsd)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* The 3-Category Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Stage 1: Locked / Pending */}
        <Card className="border-amber-500/30 relative overflow-hidden bg-amber-950/10">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                {t.pipeline.stageLockedTitle}
              </span>
              <Badge variant="warning">{t.pipeline.stageLockedBadge}</Badge>
            </div>
            <CardTitle className="text-2xl font-bold mt-2">
              {formatUsd(pipeline.lockedPendingUsd)}
            </CardTitle>
            <CardDescription className="text-xs">
              {t.pipeline.stageLockedDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-xs text-muted-foreground space-y-2">
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-foreground font-medium">
              <span>{t.common.status}</span>
              <span className="text-amber-400">{t.modelDetail.pendingLockStatus}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stage 2: Recouping */}
        <Card className="border-blue-500/30 relative overflow-hidden bg-blue-950/10">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                {t.pipeline.stageRecoupingTitle}
              </span>
              <Badge variant="info">{t.pipeline.stageRecoupingBadge}</Badge>
            </div>
            <CardTitle className="text-2xl font-bold mt-2">
              {formatUsd(pipeline.recoupingUsd)}
            </CardTitle>
            <CardDescription className="text-xs">
              {t.pipeline.stageRecoupingDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-xs text-muted-foreground space-y-2">
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-foreground font-medium">
              <span>{t.pipeline.openTargetLabel}</span>
              <span className="text-blue-400">{formatUsd(remainingInvestBalanceUsd)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stage 3: Available for Payout */}
        <Card className="border-emerald-500/30 relative overflow-hidden bg-emerald-950/10">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t.pipeline.stageLiquidTitle}
              </span>
              <Badge variant="success">{t.pipeline.stageLiquidBadge}</Badge>
            </div>
            <CardTitle className="text-2xl font-bold mt-2 text-emerald-400">
              {formatUsd(pipeline.availableForPayoutUsd)}
            </CardTitle>
            <CardDescription className="text-xs">
              {t.pipeline.stageLiquidDesc.replace("{investor}", `${investorShare}`).replace("{management}", `${agencyShare}`)}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-xs text-muted-foreground space-y-2">
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-foreground font-medium">
              <span>{t.overview.alreadyDisbursed}</span>
              <span className="text-muted-foreground">{formatUsd(totalPaidOutUsd)}</span>
            </div>
            {financials.totalStarsWithdrawn > 0 && (
              <div className="flex items-center justify-between text-rose-400 font-medium">
                <span>{language === "de" ? "Bereits abgehoben:" : "Withdrawn:"}</span>
                <span className="font-mono font-bold">-{financials.totalStarsWithdrawn.toLocaleString()} ⭐</span>
              </div>
            )}
            <div className="flex items-center justify-between text-amber-400 font-medium">
              <span>{language === "de" ? "Verbleibende Sterne:" : "Remaining Stars:"}</span>
              <span className="font-mono font-bold">{(financials.availableStars ?? 0).toLocaleString()} ⭐</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Split Ledger Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              {t.pipeline.investorShareLabel} ({investorShare}%)
            </CardTitle>
            <CardDescription>
              {modelName || "Creator"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">{t.pipeline.investorShareLabel}</span>
              <span className="font-semibold">{formatUsd(partnerTotalShareUsd)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">{t.overview.alreadyDisbursed}</span>
              <span className="text-destructive font-semibold">- {formatUsd(totalPaidOutUsd)}</span>
            </div>
            <div className="flex justify-between py-1.5 font-bold text-emerald-400">
              <span>{t.pipeline.availablePayoutLabel}</span>
              <span>{formatUsd(partnerAvailablePayoutUsd)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              {t.pipeline.masterShareLabel} ({agencyShare}%)
            </CardTitle>
            <CardDescription>
              {modelName || "Creator"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">{t.finances.totalRecouped}</span>
              <span className="font-semibold">{formatUsd(recoupedUsd)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">{t.overview.masterShareTitle}</span>
              <span className="font-semibold">{formatUsd(financials.managementTotalShareUsd)}</span>
            </div>
            <div className="flex justify-between py-1.5 font-bold text-indigo-400">
              <span>{t.overview.masterShareTitle} ({language === "de" ? "Realisiert" : "Realized"})</span>
              <span>{formatUsd(financials.managementTotalShareUsd)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
