"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatUsd, truncateAddress } from "@/lib/utils";
import {
  Users,
  Lock,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Star,
  Sliders,
  Wallet,
  Copy,
  Check,
  Percent,
  FileCheck2,
  Info,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/context/LanguageContext";

interface InvestorInfo {
  id: string;
  name: string | null;
  email: string | null;
  tonAddress?: string | null;
}

interface OverviewClientProps {
  modelsWithFin: any[];
  investors?: InvestorInfo[];
  totalGrossRevenue: number;
  totalLocked: number;
  totalRecouped: number;
  totalAvailablePayout: number;
  totalManagementShare?: number;
  totalDisbursed?: number;
}

export function OverviewClient({
  modelsWithFin: initialModelsWithFin,
  investors = [],
  totalGrossRevenue,
  totalLocked,
  totalRecouped,
  totalAvailablePayout,
  totalManagementShare = 0,
  totalDisbursed = 0,
}: OverviewClientProps) {
  const { t, language } = useLanguage();
  const [modelsWithFin, setModelsWithFin] = useState(initialModelsWithFin);

  // Quick-Settings / Split Modal
  const [editingModel, setEditingModel] = useState<any | null>(null);
  const [editInvestorId, setEditInvestorId] = useState<string>("");
  const [editInvestorSharePercent, setEditInvestorSharePercent] = useState<number>(50);
  const [editEnableExpenseRecoupment, setEditEnableExpenseRecoupment] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openQuickSettings = (model: any) => {
    setEditingModel(model);
    setEditInvestorId(model.investorId || "");
    setEditInvestorSharePercent(model.investorSharePercent ?? 50);
    setEditEnableExpenseRecoupment(model.enableExpenseRecoupment !== false);
    setSaveError(null);
  };

  const handleSaveQuickSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/models/${editingModel.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: editInvestorId || null,
          investorSharePercent:
            typeof editInvestorSharePercent === "number"
              ? editInvestorSharePercent
              : !isNaN(parseFloat(editInvestorSharePercent as any))
              ? Math.max(0, Math.min(100, parseFloat(editInvestorSharePercent as any)))
              : 50,
          enableExpenseRecoupment: editEnableExpenseRecoupment,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Fehler beim Speichern der Einstellungen");
      }

      // Refresh window so all financial calculations and ledgers recalculate cleanly
      window.location.reload();
    } catch (err: any) {
      setSaveError(err.message || "Fehler beim Speichern");
      setIsSaving(false);
    }
  };

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

      {/* Global KPI Cards (Master Lens) */}
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

        {/* Stage 2: Master Management Revenue (Mine) */}
        <Card className="border-indigo-500/30 bg-indigo-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center justify-between">
              {t.overview.masterShareTitle}
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-indigo-300">
              {formatUsd(totalManagementShare)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totalManagementShare > 0
              ? (language === "de" ? "Aktuell zur Entnahme verfügbar" : "Available to disburse")
              : (language === "de" ? "Aktuell kein Auszahlungsanspruch (Wartet auf 21-Tage Reifung)" : "No claim due (Waiting for 21-day maturity)")}
          </CardContent>
        </Card>

        {/* Stage 3: Available Investor Payouts */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              {t.overview.investorPayoutsTitle}
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-300">
              {formatUsd(totalAvailablePayout)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totalAvailablePayout > 0
              ? t.overview.investorPayoutsDesc
              : (language === "de" ? "Aktuell kein offener Auszahlungsanspruch" : "No open payout due")}
          </CardContent>
        </Card>
      </div>

      {/* Master Management & Investor Payout Plan */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t.overview.masterLedgerTitle}
              </CardTitle>
              <CardDescription className="text-xs">
                {t.overview.masterLedgerDesc}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                {t.overview.alreadyDisbursed} {formatUsd(totalDisbursed)}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">{t.overview.colModel}</th>
                  <th className="p-3">{t.overview.colInvestor}</th>
                  <th className="p-3">{t.overview.colSplit}</th>
                  <th className="p-3">{t.overview.colRule}</th>
                  <th className="p-3">{t.overview.colMasterShare}</th>
                  <th className="p-3">{t.overview.colInvestorClaim}</th>
                  <th className="p-3">{t.overview.colOpenPayout}</th>
                  <th className="p-3 text-right">{t.overview.colAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelsWithFin.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {t.overview.noChannelsYet}
                    </td>
                  </tr>
                ) : (
                  modelsWithFin.map((model) => {
                    const { fin } = model;
                    const hasInvestor = Boolean(model.investor);
                    const isDue = fin.pipeline.availableForPayoutUsd > 0;

                    return (
                      <tr key={model.id} className="hover:bg-muted/30 transition-colors">
                        {/* Model */}
                        <td className="p-3">
                          <Link
                            href={`/models/${model.slug}`}
                            className="font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            {model.name}
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                          <span className="text-[10px] text-muted-foreground block truncate max-w-[150px]">
                            {model.channelTitle || model.telegramChannelId}
                          </span>
                        </td>

                        {/* Investor */}
                        <td className="p-3">
                          {hasInvestor ? (
                            <div className="space-y-0.5">
                              <span className="font-semibold text-foreground block">
                                {model.investor.name || t.overview.investorLabel}
                              </span>
                              <span className="text-[10px] text-muted-foreground block">
                                {model.investor.email || t.overview.noEmail}
                              </span>
                              {model.investor.tonAddress && (
                                <button
                                  onClick={() => handleCopy(model.investor.tonAddress, `addr_${model.id}`)}
                                  className="text-[9px] font-mono text-[#0098EA] hover:underline flex items-center gap-1 mt-0.5"
                                  title={t.overview.clickToCopy}
                                >
                                  {copiedId === `addr_${model.id}` ? (
                                    <>
                                      <Check className="h-2.5 w-2.5 text-emerald-400" /> {t.common.copied}
                                    </>
                                  ) : (
                                    <>
                                      <Wallet className="h-2.5 w-2.5" />
                                      {truncateAddress(model.investor.tonAddress)}
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {t.overview.noInvestorAssigned}
                            </Badge>
                          )}
                        </td>

                        {/* Split */}
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {fin.investorSharePercent > 0
                                ? `${fin.investorSharePercent}% ${t.overview.investorCol} / ${fin.managementSharePercent}% ${t.overview.masterCol}`
                                : `100% ${t.overview.masterCol}`}
                            </Badge>
                          </div>
                        </td>

                        {/* Recoupment mode */}
                        <td className="p-3">
                          {model.enableExpenseRecoupment ? (
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
                                {t.overview.recoupmentActiveBadge}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground block">
                                {fin.isRecouped
                                  ? t.overview.recouped100
                                  : `${t.overview.remainingOpen}: ${formatUsd(fin.remainingInvestBalanceUsd)}`}
                              </span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                              {t.overview.directSplitBadge}
                            </Badge>
                          )}
                        </td>

                        {/* Master Revenue */}
                        <td className="p-3 font-bold text-indigo-300 whitespace-nowrap">
                          {formatUsd(fin.managementTotalShareUsd)}
                        </td>

                        {/* Investor Gross Claim */}
                        <td className="p-3 font-semibold text-foreground whitespace-nowrap">
                          {formatUsd(fin.investorGrossEarningsUsd)}
                        </td>

                        {/* Open Payout */}
                        <td className="p-3 whitespace-nowrap">
                          {hasInvestor ? (
                            <div className="space-y-0.5">
                              <span className={`font-bold block ${isDue ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {formatUsd(fin.pipeline.availableForPayoutUsd)}
                              </span>
                              <Badge
                                variant={isDue ? "success" : "outline"}
                                className="text-[9px] py-0 h-4"
                              >
                                {isDue ? t.overview.payoutDue : t.overview.payoutSettled}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openQuickSettings(model)}
                            className="gap-1 text-xs h-7 px-2"
                          >
                            <Sliders className="h-3 w-3" />
                            {t.overview.adjustSplit}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
              const hasInvestor = Boolean(model.investor);

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
                          <CardTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
                            {model.name}
                            
                            {/* Dynamic Split Badge */}
                            <Badge variant="secondary" className="text-[10px] py-0 font-mono">
                              {fin.investorSharePercent > 0
                                ? `${fin.investorSharePercent}/${fin.managementSharePercent} Split`
                                : `100% ${t.overview.masterCol}`}
                            </Badge>

                            {/* Recoupment Status Badge */}
                            {model.enableExpenseRecoupment ? (
                              fin.isRecouped ? (
                                <Badge variant="success" className="text-[10px] py-0">
                                  {t.overview.amortized100Badge}
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="text-[10px] py-0">
                                  {t.overview.amortizing}
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 text-emerald-400 border-emerald-500/30">
                                {t.overview.directSplitBadge}
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono mt-0.5">
                            {model.channelTitle || model.telegramChannelId}
                            {hasInvestor ? (
                              <span className="text-muted-foreground block text-[11px] font-sans mt-0.5">
                                {t.overview.investorLabel}: <strong>{model.investor.name || model.investor.email}</strong>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70 block text-[11px] font-sans mt-0.5 italic">
                                {t.overview.investorLabel}: {t.overview.noInvestorAssigned}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openQuickSettings(model)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title={t.overview.adjustSplit}
                        >
                          <Sliders className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/models/${model.slug}`}>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs">
                            {t.overview.openCenter}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-1">
                    {/* Recoupment meter (only relevant if recoupment enabled) */}
                    {model.enableExpenseRecoupment ? (
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
                    ) : (
                      <div className="p-2 rounded bg-muted/30 text-xs flex items-center justify-between text-muted-foreground">
                        <span>{t.overview.profitSplitLabel}</span>
                        <strong className="text-emerald-400">{t.overview.directSplitCardNotice}</strong>
                      </div>
                    )}

                    {/* Explizite Aufschlüsselung: 21D Gesperrt, Amortisiert, Master-Anteil, Investor-Anteil */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t text-center">
                      <div className="p-2 rounded bg-muted/40">
                        <span className="text-[9px] text-muted-foreground block uppercase">
                          {t.overview.locked21d}
                        </span>
                        <span className="text-xs font-bold text-amber-400">
                          {formatUsd(fin.pipeline.lockedPendingUsd)}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-muted/40">
                        <span className="text-[9px] text-muted-foreground block uppercase">
                          {t.overview.recouping}
                        </span>
                        <span className="text-xs font-bold text-blue-400">
                          {formatUsd(fin.pipeline.recoupingUsd)}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-indigo-950/20 border border-indigo-500/20">
                        <span className="text-[9px] text-indigo-400 block uppercase">
                          {t.overview.masterCol} ({fin.managementSharePercent}%)
                        </span>
                        <span className="text-xs font-bold text-indigo-300">
                          {formatUsd(fin.managementTotalShareUsd)}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20">
                        <span className="text-[9px] text-emerald-400 block uppercase">
                          {t.overview.investorCol} ({fin.investorSharePercent}%)
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

      {/* Quick Settings & Profit Split Modal */}
      <Dialog open={Boolean(editingModel)} onOpenChange={(open) => !open && setEditingModel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              <DialogTitle>{t.overview.modalTitle}</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {t.overview.modalDesc}{" "}
              <strong>{editingModel?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {editingModel && (
            <form onSubmit={handleSaveQuickSettings} className="space-y-4 py-1">
              {saveError && (
                <div className="p-3 text-xs bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                  {saveError}
                </div>
              )}

              {/* Investor Assignment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  {t.overview.modalInvestorLabel}
                </label>
                <select
                  value={editInvestorId}
                  onChange={(e) => setEditInvestorId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t.overview.modalInvestorNone}</option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name ? `${inv.name} (${inv.email})` : inv.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Investor Share Percentage */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5 text-primary" />
                    {t.overview.modalShareLabel}
                  </label>
                  <span className="font-mono text-xs font-bold text-primary">
                    {editInvestorSharePercent}% {t.overview.investorCol} / {100 - editInvestorSharePercent}% {t.overview.masterCol}
                  </span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={editInvestorSharePercent}
                  onChange={(e) => setEditInvestorSharePercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                  className="h-9 text-xs font-mono"
                  placeholder="50"
                />
                <div className="p-2.5 rounded bg-muted/40 border text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                  <span>
                    {t.overview.modalShareHint}
                  </span>
                </div>
              </div>

              {/* Amortisation Recoupment Toggle */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileCheck2 className="h-4 w-4 text-primary" />
                    {t.overview.modalRecoupmentTitle}
                  </span>
                  <input
                    type="checkbox"
                    checked={editEnableExpenseRecoupment}
                    onChange={(e) => setEditEnableExpenseRecoupment(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {editEnableExpenseRecoupment ? (
                    <span className="text-blue-400">
                      {t.overview.modalRecoupmentActive}
                    </span>
                  ) : (
                    <span className="text-emerald-400">
                      {t.overview.modalRecoupmentInactive}
                    </span>
                  )}
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingModel(null)}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {isSaving ? t.overview.savingSettings : t.overview.saveSettings}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
