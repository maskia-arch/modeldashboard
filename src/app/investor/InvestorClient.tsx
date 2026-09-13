"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Lock,
  RefreshCw,
  CheckCircle2,
  Plus,
  Receipt,
  Clock,
  ExternalLink,
  ShieldCheck,
  Wallet,
  AlertCircle,
  KeyRound,
  Check,
  Copy,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TonWalletGenerator } from "@/components/TonWalletGenerator";
import { formatUsd, truncateAddress } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import type { InvestorPortfolio } from "@/lib/financial-engine";

interface InvestorClientProps {
  investor: any;
  portfolio: InvestorPortfolio;
  assignedModels: Array<{ id: string; name: string; channelTitle?: string | null; enableExpenseRecoupment?: boolean }>;
  submittedExpenses: any[];
  fulfilledPayouts?: any[];
}

export function InvestorClient({
  investor,
  portfolio,
  assignedModels,
  submittedExpenses: initialExpenses,
  fulfilledPayouts: initialPayouts = [],
}: InvestorClientProps) {
  const { t, language } = useLanguage();
  const [expenses, setExpenses] = useState(initialExpenses || []);
  const [fulfilledPayouts, setFulfilledPayouts] = useState(initialPayouts || []);
  const [currentTonAddress, setCurrentTonAddress] = useState<string | null>(investor?.tonAddress || null);
  
  // Mandatory first-login prompt if no TON address exists yet
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(!investor?.tonAddress);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form
  const [selectedModelId, setSelectedModelId] = useState(assignedModels?.[0]?.id || "");
  const [description, setDescription] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelId || !description || !amountUsd) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/investor/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModelId,
          description,
          amountUsd: parseFloat(amountUsd),
          receiptUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit expense");

      setExpenses((prev) => [data.expense, ...prev]);
      setIsSubmitModalOpen(false);
      setDescription("");
      setAmountUsd("");
      setReceiptUrl("");
    } catch (err: any) {
      setSubmitError(err.message || "Submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWalletSaved = (newAddress: string) => {
    setCurrentTonAddress(newAddress);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Investor Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">{t.investorPortal.title}</h1>
            <Badge variant="success">100% Recoupment Active</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {language === "de" ? "Willkommen zurück" : "Welcome back"},{" "}
            <strong>{investor.name || investor.email}</strong> • {t.investorPortal.subtitle}
          </p>

          {/* TON Address Status */}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{language === "de" ? "Auszahlungsadresse:" : "Payout Address:"}</span>
            {currentTonAddress ? (
              <span className="font-mono font-bold text-[#0098EA] bg-[#0098EA]/10 px-2 py-0.5 rounded border border-[#0098EA]/20">
                {truncateAddress(currentTonAddress, 10)}
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWalletModalOpen(true)}
                className="h-6 text-[11px] text-amber-400 border-amber-500/40 gap-1"
              >
                <AlertCircle className="h-3 w-3" />
                {t.investorPortal.manageWallet}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsWalletModalOpen(true)}
            className="gap-1.5 text-xs font-semibold text-[#0098EA] border-[#0098EA]/30"
          >
            <Wallet className="h-4 w-4" />
            {currentTonAddress ? t.investorPortal.manageWallet : (language === "de" ? "Wallet generieren" : "Generate Wallet")}
          </Button>

          <Button onClick={() => setIsSubmitModalOpen(true)} className="gap-2 font-semibold text-xs">
            <Plus className="h-4 w-4" />
            {t.investorPortal.submitExpense}
          </Button>
        </div>
      </div>

      {/* Portfolio KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Capital Invested */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              {t.investorPortal.statInvested}
              <DollarSign className="h-4 w-4 text-primary" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-foreground">
              {formatUsd(portfolio.totalApprovedInvestUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {portfolio.totalPendingReviewInvestUsd > 0 && (
              <span className="text-amber-400 block font-semibold">
                +{formatUsd(portfolio.totalPendingReviewInvestUsd)} {language === "de" ? "in Prüfung" : "pending review"}
              </span>
            )}
            {t.investorPortal.statInvestedDesc}
          </CardContent>
        </Card>

        {/* 100% Recouped to Date */}
        <Card className="border-blue-500/30 bg-blue-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center justify-between">
              {t.investorPortal.statRecouped}
              <RefreshCw className="h-4 w-4 text-blue-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-blue-300">
              {formatUsd(portfolio.totalRecoupedUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de" ? "Offene Amortisation: " : "Remaining balance: "}
            {formatUsd(portfolio.totalRemainingInvestBalanceUsd)}
          </CardContent>
        </Card>

        {/* 21-Day Locked Revenue */}
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-between">
              {language === "de" ? "21-Tage Haltefrist" : "21-Day Locked Revenue"}
              <Lock className="h-4 w-4 text-amber-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-amber-300">
              {formatUsd(portfolio.totalPendingUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de" ? "Wartet in Treuhand auf Reifung" : "Locked on Telegram, matures into payouts"}
          </CardContent>
        </Card>

        {/* Available Liquid Payout */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              {language === "de" ? "Auszahlungsanspruch" : "Liquid Payout Entitlement"}
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-300">
              {formatUsd(portfolio.totalAvailablePayoutUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {portfolio.totalAvailablePayoutUsd > 0
              ? (language === "de" ? "Wird vom Master per TON an dich überwiesen" : "Ready for TON blockchain transfer")
              : (language === "de" ? "Aktuell alle fälligen Beträge vollständig ausbezahlt" : "All eligible earnings currently disbursed")}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Channel Breakdown vs Invoices vs Fulfilled Payouts */}
      <Tabs defaultValue="channels" className="w-full">
        <TabsList className="grid grid-cols-3 max-w-xl">
          <TabsTrigger value="channels" className="gap-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            {t.investorPortal.channelsTab} ({portfolio.channels.length})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-2 text-xs">
            <Receipt className="h-3.5 w-3.5" />
            {t.investorPortal.expensesTab} ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="payouts" className="gap-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            {t.investorPortal.payoutsTab} ({fulfilledPayouts.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Per-Channel Independent Balance Sheets */}
        <TabsContent value="channels" className="space-y-4 pt-2">
          <div className="space-y-1">
            <h3 className="text-lg font-bold">
              {language === "de" ? "Kanal-Amortisationsübersicht" : "Channel-by-Channel Balance Sheets"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === "de"
                ? "Investitionen sind strikt kanalbezogen: Erträge eines Kanals tilgen ausschließlich die genehmigten Ausgaben dieses Kanals."
                : "Investments are channel-specific: revenues recoup exclusively approved expenses of that channel."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {portfolio.channels.map((channel) => (
              <Card key={channel.modelId} className="border-border hover:border-primary/40 transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold">{channel.modelName}</CardTitle>
                      <CardDescription className="text-xs font-mono">
                        {channel.channelTitle || channel.modelId}
                      </CardDescription>
                    </div>
                    {channel.enableExpenseRecoupment === false ? (
                      <Badge variant="info">Direkt-Split • {channel.investorSharePercent || 50}/{100 - (channel.investorSharePercent || 50)} {language === "de" ? "Aktiv" : "Active"}</Badge>
                    ) : channel.isRecouped ? (
                      <Badge variant="success">100% Recouped • {channel.investorSharePercent || 50}/{100 - (channel.investorSharePercent || 50)} Active</Badge>
                    ) : (
                      <Badge variant="warning">Recouping 100% Share ({channel.investorSharePercent || 50}%)</Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1 text-xs">
                  {/* Recoupment meter or Direct Split notice */}
                  {channel.enableExpenseRecoupment === false ? (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-blue-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === "de" ? "Direkte Gewinnbeteiligung (Keine Amortisation)" : "Direct Profit Split (No Recoupment)"}</span>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        {language === "de"
                          ? `Einnahmen werden direkt im Verhältnis ${channel.investorSharePercent || 50}% (Investor) zu ${100 - (channel.investorSharePercent || 50)}% (Agentur) aufgeteilt.`
                          : `Revenues are split directly at ${channel.investorSharePercent || 50}% (Investor) / ${100 - (channel.investorSharePercent || 50)}% (Agency).`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Channel Amortization ({channel.recoupmentProgressPercent}%)
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatUsd(channel.recoupedUsd)} / {formatUsd(channel.totalApprovedInvestUsd)}
                        </span>
                      </div>
                      <Progress
                        value={channel.recoupmentProgressPercent}
                        className="h-2"
                        indicatorClassName={channel.isRecouped ? "bg-emerald-500" : "bg-blue-500"}
                      />
                    </div>
                  )}

                  {/* Channel Ledger Breakdown */}
                  <div className="space-y-2 pt-2 border-t text-xs">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Channel Gross Stars Revenue:</span>
                      <span className="font-semibold">{formatUsd(channel.totalGrossRevenueUsd)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Channel 21d Locked (Escrow):</span>
                      <span className="text-amber-400 font-semibold">{formatUsd(channel.pipeline.lockedPendingUsd)}</span>
                    </div>
                    {channel.enableExpenseRecoupment !== false && (
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Remaining Open Invest Target:</span>
                        <span className="text-blue-400 font-semibold">{formatUsd(channel.remainingInvestBalanceUsd)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Bereits ausgezahlt (Erfüllt):</span>
                      <span className="text-muted-foreground font-semibold">{formatUsd(channel.totalPaidOutUsd)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-sm font-bold text-emerald-400 pt-1">
                      <span>Liquid Auszahlbar:</span>
                      <span>
                        {formatUsd(channel.investorAvailablePayoutUsd)}
                        {channel.investorAvailablePayoutUsd === 0 && (
                          <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                            (Vollständig getilgt/ausbezahlt)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Submitted Invoices & Receipts */}
        <TabsContent value="expenses" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Submitted Investment Invoices</h3>
              <p className="text-xs text-muted-foreground">
                Invoices reviewed by Master Admin to legitimize channel recoupment eligibility
              </p>
            </div>
            <Button onClick={() => setIsSubmitModalOpen(true)} size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Submit Invoice
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Target Channel</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Amount ($ USD)</th>
                      <th className="p-3">Receipt Document</th>
                      <th className="p-3">Review Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No invoices submitted yet. Click "Submit Invoice" to add advertising or production costs.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            {exp.status === "APPROVED" && <Badge variant="success">Approved</Badge>}
                            {exp.status === "PENDING_REVIEW" && <Badge variant="warning">Under Review</Badge>}
                            {exp.status === "REJECTED" && <Badge variant="destructive">Rejected</Badge>}
                          </td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {exp.createdAt ? (() => { try { return format(new Date(exp.createdAt), "dd.MM.yyyy"); } catch { return "-"; } })() : "-"}
                          </td>
                          <td className="p-3 font-semibold">{exp.model?.name}</td>
                          <td className="p-3 max-w-xs truncate" title={exp.description}>
                            {exp.description}
                          </td>
                          <td className="p-3 font-bold">{formatUsd(exp.amountUsd)}</td>
                          <td className="p-3">
                            {exp.receiptUrl ? (
                              <a
                                href={exp.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-mono"
                              >
                                View PDF <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground text-[11px] italic">
                            {exp.reviewNote || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Fulfilled Payouts Ledger */}
        <TabsContent value="payouts" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Erfüllte TON-Auszahlungen</h3>
              <p className="text-xs text-muted-foreground">
                Vom Master Admin händisch auf deine TON Wallet überwiesen und auf der Blockchain verifiziert
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {fulfilledPayouts.length} Auszahlungen verbucht
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">Status</th>
                      <th className="p-3">Datum</th>
                      <th className="p-3">Betroffener Channel</th>
                      <th className="p-3">Betrag ($ USD)</th>
                      <th className="p-3">Betrag (💎 TON)</th>
                      <th className="p-3">Empfänger-Adresse</th>
                      <th className="p-3">On-Chain Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fulfilledPayouts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          Noch keine Auszahlungen verbucht. Sobald der Master Admin Beträge überweist, erscheinen sie hier verifiziert.
                        </td>
                      </tr>
                    ) : (
                      fulfilledPayouts.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <Badge variant="success" className="gap-1 font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Erfüllt
                            </Badge>
                          </td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {p.paidAt ? (() => { try { return format(new Date(p.paidAt), "dd.MM.yyyy HH:mm"); } catch { return "-"; } })() : "-"}
                          </td>
                          <td className="p-3 font-semibold">{p.modelName}</td>
                          <td className="p-3 font-bold text-emerald-400">{formatUsd(p.amountUsd)}</td>
                          <td className="p-3 font-mono font-bold text-[#0098EA]">
                            {p.amountTon.toFixed(3)} 💎
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            <span title={p.recipient}>{truncateAddress(p.recipient, 8)}</span>
                          </td>
                          <td className="p-3 font-mono">
                            <a
                              href={`https://tonscan.org/tx/${p.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {truncateAddress(p.txHash, 6)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Mandatory / First-Login TON Wallet Onboarding Modal */}
      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent className="max-w-2xl" onClose={() => setIsWalletModalOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#0098EA]/15 flex items-center justify-center text-[#0098EA]">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Integrierte TON Wallet einrichten</DialogTitle>
                <DialogDescription>
                  {currentTonAddress
                    ? "Deine aktive TON Auszahlungsadresse im System"
                    : "Wichtig: Generiere deine non-custodiale Wallet. Deine Adresse wird automatisch an das Master Dashboard übermittelt."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <TonWalletGenerator
            currentAddress={currentTonAddress}
            onAddressSaved={handleWalletSaved}
          />

          <DialogFooter className="pt-2">
            <Button
              onClick={() => setIsWalletModalOpen(false)}
              disabled={!currentTonAddress}
              className="w-full"
            >
              {currentTonAddress ? "Fertigstellen & zum Dashboard" : "Bitte zuerst Adresse generieren & speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Expense Modal */}
      <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
        <DialogContent onClose={() => setIsSubmitModalOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <DialogTitle>Submit Channel Investment</DialogTitle>
            </div>
            <DialogDescription>
              Submit advertisement, shoot, or production expenses for Master Admin review.
            </DialogDescription>
          </DialogHeader>

          {submitError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitExpense} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Target Creator Channel (Strictly Channel-Bound)
              </label>
              <select
                required
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm"
              >
                {assignedModels.map((m) => (
                  <option key={m.id} value={m.id} className="bg-card">
                    {m.name} ({m.channelTitle || "Assigned"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Expense / Investment Description
              </label>
              <Input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Telegram Channel Shoutout (50k views)"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Amount ($ USD)
              </label>
              <Input
                required
                type="number"
                step="0.01"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="1000.00"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Receipt Document / Invoice Link (URL)
              </label>
              <Input
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://... (Receipt PDF or Screenshot)"
              />
            </div>

            {assignedModels.find((m) => m.id === selectedModelId)?.enableExpenseRecoupment === false ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 space-y-1">
                <span className="font-semibold block flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {t.models.expensesDisabledNotice}
                </span>
                <p className="text-muted-foreground">
                  {language === "de"
                    ? "Für dieses Model ist eine reine Gewinnbeteiligung ohne Vorab-Amortisation vereinbart. Eingereichte Belege dienen ausschließlich der internen Dokumentation und mindern bzw. tilgen keine Auszahlungen vorab."
                    : "A direct profit split without prior expense recoupment applies to this model. Submitted receipts serve purely for documentation and do not recoup before payout splits."}
                </p>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 rounded-lg text-[11px] text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground block">Recoupment Policy:</span>
                <p>
                  Sobald vom Master Admin genehmigt, tilgen 100 % aller fälligen Telegram Stars Einnahmen dieses Channels vorrangig deine Investition, bevor die vereinbarten Gewinnbeteiligungen greifen.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Submitting for Review..." : "Submit to Master for Approval"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
