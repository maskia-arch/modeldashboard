"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Star,
  ArrowRight,
  Sparkles,
  DollarSign,
  Percent,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { calculatePayoutSplit } from "@/lib/financial-engine";

interface PayoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  defaultRecipient?: string | null;
  maxAvailableUsd?: number;
  availableStars?: number;
  investorSharePercent?: number;
  enableExpenseRecoupment?: boolean;
  remainingInvestBalanceUsd?: number;
  onPayoutLogged?: () => void;
}

export function PayoutModal({
  open,
  onOpenChange,
  modelId,
  modelName,
  defaultRecipient,
  maxAvailableUsd = 0,
  availableStars = 0,
  investorSharePercent = 50,
  enableExpenseRecoupment = true,
  remainingInvestBalanceUsd = 0,
  onPayoutLogged,
}: PayoutModalProps) {
  const { t, language } = useLanguage();

  const [recipient, setRecipient] = useState<string>(defaultRecipient || "");
  const [currency, setCurrency] = useState<"GRAM" | "TON">("GRAM");
  const [starsWithdrawn, setStarsWithdrawn] = useState<number>(availableStars > 0 ? availableStars : 1800);
  const [amountCrypto, setAmountCrypto] = useState<number>(16.44);
  const [customInvestorShare, setCustomInvestorShare] = useState<number | null>(null);
  const [investorCrypto, setInvestorCrypto] = useState<number>(12.32);
  const [txHash, setTxHash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Effective share percent
  const effectiveSharePercent = customInvestorShare ?? investorSharePercent ?? 50;

  // Compute live split
  const splitResult = useMemo(() => {
    return calculatePayoutSplit(amountCrypto, starsWithdrawn, currency, {
      investorSharePercent: effectiveSharePercent,
      enableExpenseRecoupment,
      remainingInvestBalanceUsd,
    });
  }, [amountCrypto, starsWithdrawn, currency, effectiveSharePercent, enableExpenseRecoupment, remainingInvestBalanceUsd]);

  // Sync investorCrypto when auto-calculated and user hasn't explicitly overwritten
  useEffect(() => {
    if (splitResult) {
      setInvestorCrypto(splitResult.investorCrypto);
    }
  }, [splitResult]);

  useEffect(() => {
    if (open) {
      if (defaultRecipient) setRecipient(defaultRecipient);
      if (availableStars > 0) setStarsWithdrawn(availableStars);
      setError(null);
      setSuccess(false);
      setTxHash("");
      setNotes("");
    }
  }, [open, defaultRecipient, availableStars]);

  // Management portion
  const managementCrypto = useMemo(() => {
    return Number(Math.max(0, amountCrypto - investorCrypto).toFixed(3));
  }, [amountCrypto, investorCrypto]);

  // Quick preset for the user's first transaction
  const handleApplyPreset1800 = () => {
    setStarsWithdrawn(1800);
    setCurrency("GRAM");
    setAmountCrypto(16.44);
    setInvestorCrypto(12.32);
    setCustomInvestorShare(75);
    setNotes("Erste Auszahlung via Fragment (1.800 Sterne)");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch("/api/finances/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          recipient: recipient.trim(),
          starsWithdrawn: Number(starsWithdrawn) || 0,
          currency,
          amountCrypto: Number(amountCrypto) || 0,
          investorCrypto: Number(investorCrypto) || 0,
          managementCrypto: Number(managementCrypto) || 0,
          amountTon: Number(investorCrypto) || 0,
          amountUsd: splitResult.amountUsd,
          investorUsd: splitResult.investorUsd,
          managementUsd: splitResult.managementUsd,
          txHash: txHash ? txHash.trim() : undefined,
          notes: notes ? notes.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Auszahlung konnte nicht erfasst werden.");
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        if (onPayoutLogged) onPayoutLogged();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Fehler beim Protokollieren der Auszahlung");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-sky-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <span>{language === "de" ? "Abhebung & Investor-Auszahlung erfassen" : "Record Withdrawal & Investor Payout"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {modelName} • {language === "de" ? "Telegram Stars abziehen & Krypto-Split protokollieren" : "Deduct Telegram Stars & log crypto split"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-base font-semibold">
              {language === "de" ? "Auszahlung & Abzug erfolgreich im System verbucht!" : "Payout & withdrawal logged successfully!"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {language === "de" ? "Das Hauptbuch und die Channel-Bilanzen wurden aktualisiert." : "Ledger and channel balances have been updated."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            {/* Quick preset banner for the first payout */}
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  <strong>{language === "de" ? "Schnell-Vorlage:" : "Quick Preset:"}</strong>{" "}
                  1.800 ⭐ • 16,44 GRAM • 12,32 GRAM Investor
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplyPreset1800}
                className="h-7 text-[11px] font-bold border-amber-500/40 text-amber-300 hover:bg-amber-500/20 shrink-0"
              >
                {language === "de" ? "Übernehmen" : "Apply"}
              </Button>
            </div>

            {/* Step 1: Stars Withdrawn & Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1 flex items-center justify-between">
                  <span>{language === "de" ? "Abgehobene Sterne" : "Stars Withdrawn"}</span>
                  <Star className="h-3.5 w-3.5 text-amber-400" />
                </label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={starsWithdrawn}
                  onChange={(e) => setStarsWithdrawn(parseInt(e.target.value, 10) || 0)}
                  placeholder="1800"
                  className="font-mono text-xs font-bold"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {language === "de" ? "Wird vom Channel-Guthaben abgezogen" : "Deducted from channel stars"}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {language === "de" ? "Krypto-Währung" : "Cryptocurrency"}
                </label>
                <div className="grid grid-cols-2 gap-1.5 h-9 p-0.5 bg-muted/60 rounded-md border">
                  <button
                    type="button"
                    onClick={() => setCurrency("GRAM")}
                    className={`rounded text-xs font-bold transition-all ${
                      currency === "GRAM"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    GRAM
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency("TON")}
                    className={`rounded text-xs font-bold transition-all ${
                      currency === "TON"
                        ? "bg-[#0098EA] text-white shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    TON 💎
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {currency === "GRAM" ? "Gram Token (Fragment / TON)" : "The Open Network (Toncoin)"}
                </span>
              </div>
            </div>

            {/* Step 2: Total Crypto received from Fragment */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {language === "de"
                  ? `Gesamter Krypto-Betrag erhalten (${currency})`
                  : `Total Crypto Received (${currency})`}
              </label>
              <Input
                required
                type="number"
                step="0.001"
                min="0.001"
                value={amountCrypto}
                onChange={(e) => setAmountCrypto(parseFloat(e.target.value) || 0)}
                placeholder="16.44"
                className="font-mono text-sm font-black text-foreground"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>{language === "de" ? "Gegenwert:" : "Equivalent:"} ~{formatUsd(splitResult.amountUsd)}</span>
                <span className="text-amber-400">{starsWithdrawn.toLocaleString()} Sterne</span>
              </div>
            </div>

            {/* Step 3: Interactive Split Calculator Card */}
            <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <Percent className="h-3.5 w-3.5 text-primary" />
                  {language === "de" ? "Gewinnaufteilung (Auto-Split)" : "Profit Distribution (Auto-Split)"}
                </span>
                <div className="flex items-center gap-1 text-[11px]">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {effectiveSharePercent}% Investor / {100 - effectiveSharePercent}% Agentur
                  </Badge>
                </div>
              </div>

              {/* Visual Split Distribution */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Investor Share */}
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                    {language === "de" ? "Investor Anteil" : "Investor Share"}
                  </span>
                  <div className="text-lg font-black text-emerald-300 font-mono">
                    {investorCrypto.toFixed(2)} {currency}
                  </div>
                  <div className="text-[11px] text-emerald-400/80">
                    ~{formatUsd(splitResult.investorUsd)}
                  </div>
                </div>

                {/* Management Share */}
                <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-blue-400 block">
                    {language === "de" ? "Agentur / Master" : "Agency / Master"}
                  </span>
                  <div className="text-lg font-black text-blue-300 font-mono">
                    {managementCrypto.toFixed(2)} {currency}
                  </div>
                  <div className="text-[11px] text-blue-400/80">
                    ~{formatUsd(splitResult.managementUsd)}
                  </div>
                </div>
              </div>

              {/* Adjust split manually if needed */}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">{language === "de" ? "Investor Auszahlungsbetrag anpassen:" : "Adjust investor amount:"}</span>
                  <span className="font-mono text-muted-foreground">{investorCrypto} {currency}</span>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  max={amountCrypto}
                  value={investorCrypto}
                  onChange={(e) => setInvestorCrypto(parseFloat(e.target.value) || 0)}
                  className="font-mono text-xs h-8"
                />
              </div>
            </div>

            {/* Step 4: Investor Payout Address */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {language === "de"
                  ? `Investor Empfänger-Adresse (${currency} / TON Wallet)`
                  : `Investor Recipient Address (${currency} / TON Wallet)`}
              </label>
              <Input
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="EQ... oder UQ..."
                className="font-mono text-xs"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {language === "de"
                  ? "Adresse, an die der Krypto-Anteil gesendet wurde."
                  : "Address to which the crypto share was transferred."}
              </span>
            </div>

            {/* Step 5: Transaction Hash & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {language === "de" ? "Transaktions-Hash / ID (Optional)" : "Transaction Hash / ID (Optional)"}
                </label>
                <Input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder={language === "de" ? "Blockchain TX Hash oder Transfer-ID" : "TX Hash or Transfer ID"}
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {language === "de" ? "Interne Notiz (Optional)" : "Internal Note (Optional)"}
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === "de" ? "z.B. Erste Fragment Auszahlung" : "e.g. First Fragment withdrawal"}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                variant="default"
                disabled={isVerifying}
                className="w-full gap-2 font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{language === "de" ? "Buche Auszahlung ins Hauptbuch..." : "Logging payout into ledger..."}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>
                      {language === "de"
                        ? `Auszahlung buchen (${investorCrypto.toFixed(2)} ${currency} an Investor)`
                        : `Confirm Payout (${investorCrypto.toFixed(2)} ${currency} to Investor)`}
                    </span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
