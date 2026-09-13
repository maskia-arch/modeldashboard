"use client";

import React from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/utils";
import {
  Users,
  Lock,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Star,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/context/LanguageContext";

interface OverviewClientProps {
  modelsWithFin: any[];
  totalGrossRevenue: number;
  totalLocked: number;
  totalRecouped: number;
  totalAvailablePayout: number;
}

export function OverviewClient({
  modelsWithFin,
  totalGrossRevenue,
  totalLocked,
  totalRecouped,
  totalAvailablePayout,
}: OverviewClientProps) {
  const { t, language } = useLanguage();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.overview.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.overview.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/models">
            <Button variant="default" className="gap-2">
              <Users className="h-4 w-4" />
              {t.overview.manageModels}
            </Button>
          </Link>
        </div>
      </div>

      {/* Global KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Revenue */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              {t.overview.totalStarsRevenue}
              <Star className="h-4 w-4 text-amber-400 fill-amber-400/20" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1">
              {formatUsd(totalGrossRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.overview.totalStarsRevenueDesc}
          </CardContent>
        </Card>

        {/* Stage 1: Locked 21-Day Holding */}
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-between">
              {t.overview.lockedRevenue}
              <Lock className="h-4 w-4 text-amber-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-amber-300">
              {formatUsd(totalLocked)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.overview.lockedRevenueDesc}
          </CardContent>
        </Card>

        {/* Stage 2: Recouped Investments */}
        <Card className="border-blue-500/30 bg-blue-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center justify-between">
              {t.overview.recoupedPrincipal}
              <RefreshCw className="h-4 w-4 text-blue-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-blue-300">
              {formatUsd(totalRecouped)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.overview.recoupedPrincipalDesc}
          </CardContent>
        </Card>

        {/* Stage 3: Available Liquid Profit */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              {t.overview.availablePayout}
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-300">
              {formatUsd(totalAvailablePayout)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.overview.availablePayoutDesc}
          </CardContent>
        </Card>
      </div>

      {/* Model Roster & Pipeline Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{t.overview.activeChannels}</h2>
          <span className="text-xs text-muted-foreground">
            {modelsWithFin.length} {t.overview.registeredCount}
          </span>
        </div>

        {modelsWithFin.length === 0 ? (
          <Card className="border-dashed border-2 p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              {t.overview.noChannelsYet}
            </p>
            <Link href="/models">
              <Button size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                {t.overview.manageModels}
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {modelsWithFin.map((model) => {
            const { fin } = model;
            return (
              <Card
                key={model.id}
                className="border-border hover:border-primary/50 transition-all duration-200 overflow-hidden"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border shrink-0">
                        {model.avatarUrl ? (
                          <img
                            src={model.avatarUrl}
                            alt={model.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-muted-foreground">
                            {model.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          {model.name}
                          {fin.isRecouped ? (
                            <Badge variant="success" className="text-[10px] py-0">
                              {t.overview.statusActive}
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] py-0">
                              {t.overview.statusRecouping}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs font-mono">
                          {model.channelTitle || model.telegramChannelId}
                        </CardDescription>
                      </div>
                    </div>

                    <Link href={`/models/${model.slug}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        {t.overview.openCenter}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Recoupment meter */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t.overview.recoupment} ({fin.recoupmentProgressPercent}%)
                      </span>
                      <span className="font-semibold">
                        {formatUsd(fin.recoupedUsd)} / {formatUsd(fin.totalInvestTargetUsd)}
                      </span>
                    </div>
                    <Progress
                      value={fin.recoupmentProgressPercent}
                      className="h-2"
                      indicatorClassName={fin.isRecouped ? "bg-emerald-500" : "bg-indigo-500"}
                    />
                  </div>

                  {/* 3 Pipeline stages mini-grid */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                    <div className="p-2 rounded bg-muted/40">
                      <span className="text-[10px] text-muted-foreground block uppercase">
                        {t.overview.locked21d}
                      </span>
                      <span className="text-xs font-bold text-amber-400">
                        {formatUsd(fin.pipeline.lockedPendingUsd)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-muted/40">
                      <span className="text-[10px] text-muted-foreground block uppercase">
                        {t.overview.recouping}
                      </span>
                      <span className="text-xs font-bold text-blue-400">
                        {formatUsd(fin.pipeline.recoupingUsd)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-muted/40">
                      <span className="text-[10px] text-muted-foreground block uppercase">
                        {t.overview.available50}
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {formatUsd(fin.pipeline.availableForPayoutUsd)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
