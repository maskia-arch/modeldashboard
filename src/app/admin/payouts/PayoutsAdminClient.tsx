"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  Star,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowDownToLine,
  Sliders,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, truncateAddress, cn } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { PayoutModal } from "@/components/PayoutModal";
import type { ModelFinancials } from "@/lib/financial-engine";

interface ModelWithFin {
  id: string;
  name: string;
  slug: string;
  channelTitle?: string | null;
  avatarUrl?: string | null;
  investorSharePercent: number;
  enableExpenseRecoupment: boolean;
  investor?: {
    id: string;
    name?: string | null;
    email?: string | null;
    tonAddress?: string | null;
  } | null;
  payoutsCount: number;
  fin: ModelFinancials;
}

interface PayoutsAdminClientProps {
  initialModels: ModelWithFin[];
  initialPayouts: any[];
}

export function PayoutsAdminClient({
  initialModels,
  initialPayouts,
}: PayoutsAdminClientProps) {
  const { t, language } = useLanguage();

  const [models, setModels] = useState<ModelWithFin[]>(initialModels);
  const [payouts, setPayouts] = useState<any[]>(initialPayouts);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelWithFin | null>(
    initialModels[0] || null
  );

  const refreshData = async () => {
    try {
      const res = await fetch("/api/admin/payouts");
      if (res.ok) {
        const data = await res.json();
        if (data.payouts) {
          setPayouts(data.payouts);
        }
      }
    } catch (err) {
      console.error("Failed to refresh payouts ledger:", err);
    }
  };

  const handleOpenPayoutForModel = (model: ModelWithFin) => {
    setSelectedModel(model);
    setIsModalOpen(true);
  };

  // Aggregated Stats
  const stats = useMemo(() => {
    let totalStarsWithdrawn = 0;
    let totalCryptoWithdrawnGram = 0;
    let totalCryptoWithdrawnTon = 0;
    let totalInvestorCryptoGram = 0;
    let totalInvestorCryptoTon = 0;
    let totalManagementCryptoGram = 0;
    let totalManagementCryptoTon = 0;
    let totalPaidOutUsd = 0;

    for (const p of payouts) {
      totalStarsWithdrawn += Number(p.starsWithdrawn || 0);
      const isTon = p.currency === "TON";
      const cryptoAmt = Number(p.amountCrypto || p.amountTon || 0);
      const investorAmt = Number(p.investorCrypto || p.amountTon || 0);
      const mgmtAmt = Number(p.managementCrypto || 0);
      const usdAmt = Number(p.investorUsd || p.amountUsd || 0);

      if (isTon) {
        totalCryptoWithdrawnTon += cryptoAmt;
        totalInvestorCryptoTon += investorAmt;
        totalManagementCryptoTon += mgmtAmt;
      } else {
        totalCryptoWithdrawnGram += cryptoAmt;
        totalInvestorCryptoGram += investorAmt;
        totalManagementCryptoGram += mgmtAmt;
      }
      totalPaidOutUsd += usdAmt;
    }

    const totalOpenClaimsUsd = models.reduce(
      (acc, m) => acc + (m.fin.partnerAvailablePayoutUsd || 0),
      0
    );

    return {
      totalStarsWithdrawn,
      totalCryptoWithdrawnGram: Number(totalCryptoWithdrawnGram.toFixed(2)),
      totalCryptoWithdrawnTon: Number(totalCryptoWithdrawnTon.toFixed(2)),
      totalInvestorCryptoGram: Number(totalInvestorCryptoGram.toFixed(2)),
      totalInvestorCryptoTon: Number(totalInvestorCryptoTon.toFixed(2)),
      totalManagementCryptoGram: Number(totalManagementCryptoGram.toFixed(2)),
      totalManagementCryptoTon: Number(totalManagementCryptoTon.toFixed(2)),
      totalPaidOutUsd: Number(totalPaidOutUsd.toFixed(2)),
      totalOpenClaimsUsd: Number(totalOpenClaimsUsd.toFixed(2)),
    };
  }, [payouts, models]);

  // Filtered Payouts
  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      if (modelFilter !== "ALL" && p.modelId !== modelFilter) {
        return false;
      }
      if (currencyFilter !== "ALL" && p.currency !== currencyFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchModel = p.model?.name?.toLowerCase().includes(q);
        const matchRecipient = p.recipient?.toLowerCase().includes(q);
        const matchTx = p.txHash?.toLowerCase().includes(q);
        const matchNote = p.notes?.toLowerCase().includes(q);
        if (!matchModel && !matchRecipient && !matchTx && !matchNote) return false;
      }
      return true;
    });
  }, [payouts, modelFilter, currencyFilter, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-sky-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ArrowDownToLine className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {language === "de" ? "Abhebungen & Investoren-Auszahlungen" : "Withdrawals & Investor Payouts"}
            </h1>
            <Badge variant="outline" className="font-mono text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
              Master Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "de"
              ? "Zentrales Verwaltungsmenü für Telegram Stars Abhebungen, Währungsumrechnungen (GRAM & TON) und Gewinn-Splits an Investoren."
              : "Central management ledger for Telegram Stars withdrawals, crypto conversion (GRAM & TON) and investor profit splits."}
          </p>
        </div>

        <Button
          onClick={() => {
            if (models.length > 0) setSelectedModel(models[0]);
            setIsModalOpen(true);
          }}
          className="gap-2 bg-gradient-to-r from-amber-500 to-sky-600 hover:from-amber-400 hover:to-sky-500 text-white font-bold shadow-md text-xs shrink-0"
        >
          <Plus className="h-4 w-4" />
          {language === "de" ? "Neue Abhebung / Auszahlung erfassen" : "Record New Payout"}
        </Button>
      </div>

      {/* Quick Action Prompt for the first 1,800 Stars payout if not yet logged */}
      {stats.totalStarsWithdrawn === 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-sky-500/10 to-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>{language === "de" ? "Erste getätigte Auszahlung verbuchen" : "Book your first executed payout"}</span>
                <Badge variant="warning" className="text-[10px]">1.800 Sterne • 16,44 GRAM</Badge>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === "de"
                  ? "Sie haben heute 1.800 Sterne abgehoben und 12,32 GRAM an den Investor überwiesen? Klicken Sie hier, um den Abzug sofort sauber in der Datenbank zu vermerken."
                  : "Did you withdraw 1,800 stars today and send 12.32 GRAM to the investor? Click here to immediately log and deduct it."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (models.length > 0) setSelectedModel(models[0]);
              setIsModalOpen(true);
            }}
            className="gap-2 font-bold bg-amber-500 hover:bg-amber-400 text-black text-xs shrink-0"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{language === "de" ? "Jetzt erfassen & abziehen" : "Record Payout Now"}</span>
          </Button>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stars Withdrawn */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{language === "de" ? "Abgehobene Sterne" : "Stars Withdrawn"}</span>
              <Star className="h-4 w-4 text-amber-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-amber-400 font-mono">
              {stats.totalStarsWithdrawn.toLocaleString()} ⭐
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de"
              ? "Erfolgreich von Telegram-Channels abgehoben"
              : "Successfully withdrawn from Telegram channels"}
          </CardContent>
        </Card>

        {/* Total Crypto Disbursed */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{language === "de" ? "Krypto Gesamt Erhalten" : "Total Crypto Received"}</span>
              <Wallet className="h-4 w-4 text-[#0098EA]" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-foreground font-mono">
              {stats.totalCryptoWithdrawnGram > 0 && `${stats.totalCryptoWithdrawnGram} GRAM`}
              {stats.totalCryptoWithdrawnGram > 0 && stats.totalCryptoWithdrawnTon > 0 && " • "}
              {stats.totalCryptoWithdrawnTon > 0 && `${stats.totalCryptoWithdrawnTon} TON`}
              {stats.totalCryptoWithdrawnGram === 0 && stats.totalCryptoWithdrawnTon === 0 && "0.00 GRAM"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de"
              ? `Gegenwert: ~${formatUsd(stats.totalPaidOutUsd)}`
              : `Equivalent: ~${formatUsd(stats.totalPaidOutUsd)}`}
          </CardContent>
        </Card>

        {/* Transferred to Investors */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>{language === "de" ? "An Investoren Überwiesen" : "Sent to Investors"}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-300 font-mono">
              {stats.totalInvestorCryptoGram > 0 && `${stats.totalInvestorCryptoGram} GRAM`}
              {stats.totalInvestorCryptoGram > 0 && stats.totalInvestorCryptoTon > 0 && " • "}
              {stats.totalInvestorCryptoTon > 0 && `${stats.totalInvestorCryptoTon} TON`}
              {stats.totalInvestorCryptoGram === 0 && stats.totalInvestorCryptoTon === 0 && "0.00 GRAM"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de"
              ? "Realisierter Gewinn-Anteil der Investoren"
              : "Realized profit share of investors"}
          </CardContent>
        </Card>

        {/* Retained by Agency */}
        <Card className="border-sky-500/30 bg-sky-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider flex items-center justify-between">
              <span>{language === "de" ? "Agentur-Anteil (Master)" : "Agency Share (Master)"}</span>
              <ShieldCheck className="h-4 w-4 text-sky-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-sky-300 font-mono">
              {stats.totalManagementCryptoGram > 0 && `${stats.totalManagementCryptoGram} GRAM`}
              {stats.totalManagementCryptoGram > 0 && stats.totalManagementCryptoTon > 0 && " • "}
              {stats.totalManagementCryptoTon > 0 && `${stats.totalManagementCryptoTon} TON`}
              {stats.totalManagementCryptoGram === 0 && stats.totalManagementCryptoTon === 0 && "0.00 GRAM"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {language === "de"
              ? "Einbehaltener Gewinn nach Split"
              : "Retained profit after split"}
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Per-Channel Balances & Deduction Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>{language === "de" ? "Kanal-Guthaben & Abhebungs-Status" : "Channel Balances & Withdrawal Status"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {language === "de"
                  ? "Übersicht aller Models mit kumulierten Telegram Sternen, getätigten Abhebungen und verbleibendem Guthaben."
                  : "Overview of all creator models with cumulative stars earned, withdrawals deducted, and remaining liquid stars."}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {models.length} {language === "de" ? "Kanäle aktiv" : "channels active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">{language === "de" ? "Model / Kanal" : "Model / Channel"}</th>
                  <th className="p-3">{language === "de" ? "Investor" : "Investor"}</th>
                  <th className="p-3">{language === "de" ? "Sterne Erwirtschaftet" : "Gross Stars Earned"}</th>
                  <th className="p-3">{language === "de" ? "Sterne Abgehoben" : "Stars Withdrawn"}</th>
                  <th className="p-3">{language === "de" ? "Verfügbar im Channel" : "Available in Channel"}</th>
                  <th className="p-3">{language === "de" ? "Offener Anspruch" : "Open Claim"}</th>
                  <th className="p-3">{language === "de" ? "Split-Quote" : "Split Ratio"}</th>
                  <th className="p-3 text-right">{t.common.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {models.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {language === "de" ? "Keine Models vorhanden" : "No models found"}
                    </td>
                  </tr>
                ) : (
                  models.map((model) => {
                    const grossStars = model.fin.totalGrossStars || 0;
                    const withdrawnStars = model.fin.totalStarsWithdrawn || 0;
                    const availableStars = model.fin.availableStars || 0;
                    const openUsd = model.fin.partnerAvailablePayoutUsd || 0;

                    return (
                      <tr key={model.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          <Link
                            href={`/models/${model.slug}`}
                            className="hover:underline flex items-center gap-2 group"
                          >
                            <div className="h-7 w-7 rounded-full bg-muted border overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-primary">
                              {model.avatarUrl ? (
                                <img src={model.avatarUrl} alt={model.name} className="h-full w-full object-cover" />
                              ) : (
                                model.name.charAt(0)
                              )}
                            </div>
                            <div>
                              <span className="group-hover:text-primary transition-colors">{model.name}</span>
                              <span className="text-[10px] text-muted-foreground block font-mono">
                                {model.channelTitle || model.slug}
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {model.investor ? (
                            <div>
                              <span className="font-semibold text-foreground">{model.investor.name || model.investor.email}</span>
                              {model.investor.tonAddress && (
                                <span className="block font-mono text-[10px] text-[#0098EA]" title={model.investor.tonAddress}>
                                  {truncateAddress(model.investor.tonAddress, 6)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">{language === "de" ? "Kein Investor" : "No investor"}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-foreground">
                          {grossStars.toLocaleString()} ⭐
                        </td>
                        <td className="p-3 font-mono font-bold text-rose-400">
                          {withdrawnStars > 0 ? `-${withdrawnStars.toLocaleString()} ⭐` : "0 ⭐"}
                        </td>
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {availableStars.toLocaleString()} ⭐
                        </td>
                        <td className="p-3 font-bold text-emerald-400">
                          {formatUsd(openUsd)}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {model.investorSharePercent}% / {100 - model.investorSharePercent}%
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPayoutForModel(model)}
                            className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                          >
                            <ArrowDownToLine className="h-3 w-3" />
                            <span>{language === "de" ? "Auszahlung erfassen" : "Log Payout"}</span>
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

      {/* Section 2: Complete Audit Ledger of Payouts & Crypto Disbursed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>{language === "de" ? "Hauptbuch: Alle Abhebungen & Krypto-Transfers" : "Full Audit Ledger: Withdrawals & Transfers"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {language === "de"
                  ? "Vollständiges Protokoll aller getätigten Telegram Stars Abhebungen und Auszahlungen an Investoren."
                  : "Complete verifiable audit trail of all Telegram Stars withdrawals and cryptocurrency payouts."}
              </CardDescription>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === "de" ? "Suchen..." : "Search..."}
                  className="h-8 pl-8 text-xs font-mono"
                />
              </div>

              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-sm"
              >
                <option value="ALL">{language === "de" ? "Alle Models" : "All Models"}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-sm"
              >
                <option value="ALL">{language === "de" ? "Alle Währungen" : "All Currencies"}</option>
                <option value="GRAM">GRAM</option>
                <option value="TON">TON</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">{t.finances.date}</th>
                  <th className="p-3">{language === "de" ? "Model / Kanal" : "Model / Channel"}</th>
                  <th className="p-3">{language === "de" ? "Sterne Abzug" : "Stars Deducted"}</th>
                  <th className="p-3">{language === "de" ? "Gesamt Erhalten" : "Total Received"}</th>
                  <th className="p-3">{language === "de" ? "Investor Anteil" : "Investor Share"}</th>
                  <th className="p-3">{language === "de" ? "Agentur Anteil" : "Agency Share"}</th>
                  <th className="p-3">{language === "de" ? "Empfänger (Gram/TON)" : "Recipient"}</th>
                  <th className="p-3">{language === "de" ? "TX Hash / Nachweis" : "TX Hash"}</th>
                  <th className="p-3">{language === "de" ? "Notiz" : "Note"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {language === "de"
                        ? "Bislang sind keine Abhebungen oder Auszahlungen erfasst."
                        : "No withdrawals or payouts recorded yet."}
                    </td>
                  </tr>
                ) : (
                  filteredPayouts.map((payout) => {
                    const stars = payout.starsWithdrawn || 0;
                    const curr = payout.currency || "GRAM";
                    const totalCrypto = Number(payout.amountCrypto || payout.amountTon || 0);
                    const investorCrypto = Number(payout.investorCrypto || payout.amountTon || 0);
                    const mgmtCrypto = Number(payout.managementCrypto || 0);

                    return (
                      <tr key={payout.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {payout.paidAt ? (() => { try { return format(new Date(payout.paidAt), "dd.MM.yyyy HH:mm"); } catch { return "-"; } })() : "-"}
                        </td>
                        <td className="p-3 font-semibold text-foreground">
                          <Link
                            href={`/models/${payout.model?.slug || ""}`}
                            className="hover:underline flex items-center gap-1.5"
                          >
                            <span>{payout.model?.name || "Model"}</span>
                          </Link>
                        </td>
                        <td className="p-3 font-mono font-bold text-rose-400 whitespace-nowrap">
                          {stars > 0 ? `-${stars.toLocaleString()} ⭐` : "-"}
                        </td>
                        <td className="p-3 font-mono font-bold text-foreground whitespace-nowrap">
                          {totalCrypto.toFixed(2)} {curr}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {investorCrypto.toFixed(2)} {curr}
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-400 whitespace-nowrap">
                          {mgmtCrypto.toFixed(2)} {curr}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          <span title={payout.recipient}>{truncateAddress(payout.recipient, 8)}</span>
                        </td>
                        <td className="p-3 font-mono">
                          {payout.txHash && !payout.txHash.startsWith("TX_MANUAL_") ? (
                            <a
                              href={
                                curr === "TON"
                                  ? `https://tonviewer.com/transaction/${payout.txHash}`
                                  : `https://tonscan.org/tx/${payout.txHash}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                              title={payout.txHash}
                            >
                              <span>{truncateAddress(payout.txHash, 6)}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">
                              {payout.txHash ? truncateAddress(payout.txHash, 6) : "-"}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-muted-foreground max-w-xs truncate" title={payout.notes || ""}>
                          {payout.notes || "-"}
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

      {/* Payout Modal */}
      {selectedModel && (
        <PayoutModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          modelId={selectedModel.id}
          modelName={selectedModel.name}
          defaultRecipient={selectedModel.investor?.tonAddress}
          maxAvailableUsd={selectedModel.fin.partnerAvailablePayoutUsd}
          availableStars={selectedModel.fin.availableStars}
          investorSharePercent={selectedModel.investorSharePercent}
          enableExpenseRecoupment={selectedModel.enableExpenseRecoupment}
          remainingInvestBalanceUsd={selectedModel.fin.remainingInvestBalanceUsd}
          onPayoutLogged={() => {
            refreshData();
          }}
        />
      )}
    </div>
  );
}
