"use client";

import React, { useState, useEffect } from "react";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { KeyRound, Copy, Check, ShieldAlert, Sparkles, Wallet, RefreshCw, Edit3, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { isValidTonAddress } from "@/lib/ton";
import { cn } from "@/lib/utils";

interface TonWalletGeneratorProps {
  currentAddress?: string | null;
  onAddressSaved?: (newAddress: string) => void;
}

export function TonWalletGenerator({ currentAddress, onAddressSaved }: TonWalletGeneratorProps) {
  const { t, language } = useLanguage();
  const [activeMode, setActiveMode] = useState<"manual" | "generate">("manual");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [generatedAddress, setGeneratedAddress] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isCopiedMnemonic, setIsCopiedMnemonic] = useState<boolean>(false);
  const [isCopiedAddress, setIsCopiedAddress] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [activeAddress, setActiveAddress] = useState<string>(currentAddress || "");

  // Manual entry state
  const [manualInput, setManualInput] = useState<string>("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [manualSaveSuccess, setManualSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (currentAddress) {
      setActiveAddress(currentAddress);
    }
  }, [currentAddress]);

  const handleGenerateWallet = async () => {
    setIsGenerating(true);
    setSaveSuccess(false);
    try {
      // 1. Generate 24-word mnemonic in browser
      const words = await mnemonicNew(24);
      setMnemonic(words);

      // 2. Derive keypair and V4R2 wallet address
      const keyPair = await mnemonicToPrivateKey(words);
      const workchain = 0;
      const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
      const address = wallet.address.toString({ testOnly: false, bounceable: false });

      setGeneratedAddress(address);
    } catch (err) {
      console.error("Failed to generate client-side TON wallet:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, type: "mnemonic" | "address") => {
    navigator.clipboard.writeText(text);
    if (type === "mnemonic") {
      setIsCopiedMnemonic(true);
      setTimeout(() => setIsCopiedMnemonic(false), 2000);
    } else {
      setIsCopiedAddress(true);
      setTimeout(() => setIsCopiedAddress(false), 2000);
    }
  };

  const handleSaveToProfile = async () => {
    if (!generatedAddress) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/ton-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tonAddress: generatedAddress,
          mnemonic: mnemonic.length === 24 ? mnemonic : undefined,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setActiveAddress(generatedAddress);
        try {
          if (mnemonic.length === 24) {
            localStorage.setItem("dashboard_ton_wallet_last", JSON.stringify({ address: generatedAddress, mnemonic }));
          }
        } catch {}
        if (onAddressSaved) onAddressSaved(generatedAddress);
      }
    } catch (err) {
      console.error("Failed to save TON address:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManualAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setManualSaveSuccess(false);

    const clean = manualInput.trim();
    if (!clean || !isValidTonAddress(clean)) {
      setManualError(t.walletGenerator.invalidAddressError || "Ungültiges TON-Adressformat (UQ... oder EQ...)");
      return;
    }

    setIsSavingManual(true);
    try {
      const res = await fetch("/api/user/ton-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tonAddress: clean,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Speichern der Adresse");
      }

      setManualSaveSuccess(true);
      setActiveAddress(clean);
      setManualInput("");
      if (onAddressSaved) onAddressSaved(clean);
    } catch (err: any) {
      setManualError(err.message || "Fehler beim Speichern der Adresse");
    } finally {
      setIsSavingManual(false);
    }
  };

  const effectiveAddress = activeAddress || currentAddress;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#0098EA]/15 flex items-center justify-center text-[#0098EA]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{t.walletGenerator.title}</CardTitle>
              <CardDescription className="text-xs">
                {t.walletGenerator.desc}
              </CardDescription>
            </div>
          </div>
          {effectiveAddress && (
            <Badge variant="success" className="text-xs">
              {t.wallet.walletConfigured}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Currently configured active address banner */}
        {effectiveAddress && (
          <div className="p-3.5 rounded-lg bg-muted/40 border text-sm flex items-center justify-between">
            <div className="min-w-0 flex-1 mr-2">
              <span className="text-xs text-muted-foreground block">{t.walletGenerator.activeAddressLabel}</span>
              <span className="font-mono text-xs font-semibold text-[#0098EA] break-all">{effectiveAddress}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(effectiveAddress, "address")}
              className="shrink-0"
            >
              {isCopiedAddress ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* Large, Unmissable Choice Cards: Option 1 (Manual) vs Option 2 (Generate) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Card 1: Eigene Adresse hinterlegen (Empfohlen) */}
          <div
            onClick={() => setActiveMode("manual")}
            className={cn(
              "cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-3 text-left",
              activeMode === "manual"
                ? "border-emerald-500 bg-emerald-500/10 shadow-md ring-2 ring-emerald-500/30"
                : "border-border/80 bg-muted/30 hover:border-emerald-500/50 hover:bg-muted/50"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <Badge variant="outline" className={cn("text-[10px] font-bold py-0.5", activeMode === "manual" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "")}>
                {language === "de" ? "Empfohlen" : "Recommended"}
              </Badge>
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                {t.walletGenerator.tabManual || "Eigene Adresse hinterlegen"}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.walletGenerator.tabManualSub || "Tonkeeper, Telegram @wallet oder Exchange"}
              </p>
            </div>
          </div>

          {/* Card 2: Neues Wallet generieren */}
          <div
            onClick={() => setActiveMode("generate")}
            className={cn(
              "cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-3 text-left",
              activeMode === "generate"
                ? "border-[#0098EA] bg-[#0098EA]/10 shadow-md ring-2 ring-[#0098EA]/30"
                : "border-border/80 bg-muted/30 hover:border-[#0098EA]/50 hover:bg-muted/50"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-[#0098EA]/20 text-[#0098EA] flex items-center justify-center shadow-sm">
                <KeyRound className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[10px]">
                {language === "de" ? "24 Wörter" : "24 Words"}
              </Badge>
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                {t.walletGenerator.tabGenerate || "Neues Wallet erzeugen"}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.walletGenerator.tabGenerateSub || "24-Wort Seed Phrase im Browser generieren"}
              </p>
            </div>
          </div>
        </div>

        {/* MODE 1: Client-Side Generator */}
        {activeMode === "generate" && (
          <div className="space-y-4 pt-1">
            {/* Generate Button Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-950/20 via-background to-cyan-950/20 border border-blue-500/20 gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-[#0098EA]" />
                  {t.walletGenerator.generateButton}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {language === "de"
                    ? "Generiert 24 sichere Wörter direkt in Ihrem Browser via @ton/crypto."
                    : "Generates 24 secure words directly in your browser via @ton/crypto."}
                </p>
              </div>
              <Button
                variant="ton"
                onClick={handleGenerateWallet}
                disabled={isGenerating}
                className="gap-1.5 shrink-0"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.walletGenerator.generatingButton}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t.walletGenerator.generateButton}
                  </>
                )}
              </Button>
            </div>

            {/* Mnemonic Grid Display */}
            {mnemonic.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-300">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>{t.walletGenerator.warningTitle}:</strong> {t.walletGenerator.warningDesc}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.wallet.backupModalTitle}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(mnemonic.join(" "), "mnemonic")}
                    className="h-7 text-xs gap-1.5"
                  >
                    {isCopiedMnemonic ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        {t.common.copied}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        {t.walletGenerator.copyMnemonic}
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {mnemonic.map((word, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1.5 rounded-md bg-muted/60 border text-xs font-mono flex items-center justify-between"
                    >
                      <span className="text-muted-foreground text-[10px]">{idx + 1}.</span>
                      <span className="font-semibold">{word}</span>
                    </div>
                  ))}
                </div>

                {/* Generated Address */}
                <div className="p-3.5 rounded-lg bg-card border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t.wallet.recipientLabel}:
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(generatedAddress, "address")}
                      className="h-6 text-xs"
                    >
                      {isCopiedAddress ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="font-mono text-xs font-bold text-[#0098EA] break-all">
                    {generatedAddress}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-muted-foreground">
                    {t.wallet.externalDesc}
                  </span>
                  <Button
                    onClick={handleSaveToProfile}
                    disabled={isSaving || saveSuccess}
                    variant="default"
                    size="sm"
                    className="gap-1.5 bg-[#0098EA] hover:bg-[#0087d1] text-white"
                  >
                    {saveSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        {t.walletGenerator.savedSuccess}
                      </>
                    ) : (
                      <>{t.walletGenerator.saveToProfile}</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: Manual TON Address Entry (Default) */}
        {activeMode === "manual" && (
          <form onSubmit={handleSaveManualAddress} className="space-y-4 pt-1">
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/30 via-background to-teal-950/30 border-2 border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t.walletGenerator.manualTitle || "Eigene TON-Adresse angeben (Empfohlen)"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.walletGenerator.manualDesc ||
                  "Geben Sie Ihre persönliche TON-Empfangsadresse (z. B. aus Tonkeeper, Telegram Wallet oder Krypto-Börse) ein. Alle Auszahlungen und Amortisationen fließen automatisch an diese Adresse."}
              </p>
            </div>

            {manualError && (
              <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{manualError}</span>
              </div>
            )}

            {manualSaveSuccess && (
              <div className="p-3.5 rounded-lg bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 text-xs flex items-center gap-2.5 font-semibold">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <span>{t.walletGenerator.savedSuccess || "Erfolgreich im Profil gespeichert!"}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground block">
                {t.walletGenerator.manualLabel || "Ihre TON-Auszahlungsadresse (UQ... oder EQ...):"}
              </label>
              <Input
                required
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value);
                  setManualError(null);
                }}
                placeholder={t.walletGenerator.manualPlaceholder || "UQ... oder EQ... hier einfügen"}
                className="font-mono text-sm h-11 border-2 focus-visible:ring-emerald-500"
              />
              {manualInput.trim() && (
                <div className="text-xs pt-0.5">
                  {isValidTonAddress(manualInput.trim()) ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      {language === "de" ? "Gültiges TON-Adressformat (Verifiziert)" : "Valid TON address format (Verified)"}
                    </span>
                  ) : (
                    <span className="text-destructive font-semibold flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      {t.walletGenerator.invalidAddressError || "Ungültiges TON-Adressformat"}
                    </span>
                  )}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSavingManual || !manualInput.trim() || !isValidTonAddress(manualInput.trim())}
              className="w-full h-11 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-md"
            >
              {isSavingManual ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t.walletGenerator.savingToProfile}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t.walletGenerator.saveManualButton || "Adresse speichern & verknüpfen"}
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
