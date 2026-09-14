"use client";

import React, { useState, useEffect, useCallback } from "react";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, toNano } from "@ton/ton";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Sparkles,
  QrCode,
  Info,
  Send,
  Download,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from "@/context/LanguageContext";
import { isValidTonAddress } from "@/lib/ton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface CurrentUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  tonAddress?: string | null;
}

interface TonWalletManagerProps {
  currentUser: CurrentUser;
}

export function TonWalletManager({ currentUser }: TonWalletManagerProps) {
  const { t } = useLanguage();

  // Storage key scoped by user ID
  const storageKey = `dashboard_ton_wallet_${currentUser.id}`;

  // Core wallet state
  const [address, setAddress] = useState<string>(currentUser.tonAddress || "");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [hasLocalKeys, setHasLocalKeys] = useState<boolean>(false);

  // Live on-chain data
  const [balanceTon, setBalanceTon] = useState<string>("0.00");
  const [balanceUsd, setBalanceUsd] = useState<number>(0);
  const [tonRateUsd, setTonRateUsd] = useState<number>(5.60);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Modals
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState<boolean>(false);
  const [isBackupOpen, setIsBackupOpen] = useState<boolean>(false);
  const [isSetupOpen, setIsSetupOpen] = useState<boolean>(false);

  // Setup / Generator Tab
  const [setupTab, setSetupTab] = useState<"generate" | "import" | "external">("generate");
  const [generatedWords, setGeneratedWords] = useState<string[]>([]);
  const [generatedAddr, setGeneratedAddr] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Import inputs
  const [importInput, setImportInput] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  // External address input
  const [externalInput, setExternalInput] = useState<string>("");
  const [externalError, setExternalError] = useState<string | null>(null);

  // Send inputs
  const [sendRecipient, setSendRecipient] = useState<string>("");
  const [sendAmount, setSendAmount] = useState<string>("");
  const [sendMemo, setSendMemo] = useState<string>("");
  const [manualMnemonic, setManualMnemonic] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState<boolean>(false);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. Load local wallet keys on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.mnemonic && Array.isArray(parsed.mnemonic) && parsed.mnemonic.length === 24) {
          setMnemonic(parsed.mnemonic);
          setHasLocalKeys(true);
          if (!address && parsed.address) {
            setAddress(parsed.address);
          }
        }
      }
    } catch {
      // Storage unavailable or unparseable
    }
  }, [storageKey, address]);

  // 2. Fetch live on-chain balance and txs
  const fetchWalletInfo = useCallback(async (addrToFetch?: string) => {
    const target = addrToFetch || address;
    if (!target || !isValidTonAddress(target)) return;

    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/ton/wallet-info?address=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        setBalanceTon(data.balanceTon || "0.00");
        setBalanceUsd(data.balanceUsd || 0);
        setTonRateUsd(data.tonRateUsd || 5.60);
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error("Failed to load live wallet data:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      fetchWalletInfo(address);
    }
  }, [address, fetchWalletInfo]);

  // 3. Generate new 24-word wallet
  const handleGenerateWallet = async () => {
    setIsGenerating(true);
    try {
      const words = await mnemonicNew(24);
      setGeneratedWords(words);

      const keyPair = await mnemonicToPrivateKey(words);
      const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
      const derived = wallet.address.toString({ testOnly: false, bounceable: false });
      setGeneratedAddr(derived);
    } catch (err) {
      console.error("Error generating wallet:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Save generated or imported wallet
  const handleActivateWallet = async (addrToSave: string, wordsToSave?: string[]) => {
    if (!addrToSave || !isValidTonAddress(addrToSave)) return;

    try {
      // Save to database
      const res = await fetch("/api/user/ton-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tonAddress: addrToSave }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Fehler beim Speichern");
      }

      // Save to localStorage if mnemonic provided
      if (wordsToSave && wordsToSave.length === 24) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ address: addrToSave, mnemonic: wordsToSave })
        );
        setMnemonic(wordsToSave);
        setHasLocalKeys(true);
      }

      setAddress(addrToSave);
      setIsSetupOpen(false);
      fetchWalletInfo(addrToSave);
    } catch (err: any) {
      alert(err.message || "Fehler beim Verknüpfen der Wallet");
    }
  };

  // 5. Handle Mnemonic Import
  const handleImportMnemonic = async () => {
    setImportError(null);
    const rawWords = importInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (rawWords.length !== 24) {
      setImportError("Bitte geben Sie exakt 24 Wörter ein (aktuell: " + rawWords.length + ").");
      return;
    }

    try {
      const keyPair = await mnemonicToPrivateKey(rawWords);
      const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
      const derived = wallet.address.toString({ testOnly: false, bounceable: false });
      await handleActivateWallet(derived, rawWords);
      setImportInput("");
    } catch (err: any) {
      setImportError(err.message || "Ungültige Secret Recovery Phrase");
    }
  };

  // 6. Handle External Address Link
  const handleLinkExternalAddress = async () => {
    setExternalError(null);
    const clean = externalInput.trim();
    if (!clean || !isValidTonAddress(clean)) {
      setExternalError("Ungültiges TON-Adressformat (erwartet: UQ... oder EQ...)");
      return;
    }

    try {
      const res = await fetch("/api/user/ton-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tonAddress: clean }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Fehler beim Speichern");
      }

      setAddress(clean);
      setHasLocalKeys(false);
      setMnemonic([]);
      localStorage.removeItem(storageKey);
      setIsSetupOpen(false);
      setExternalInput("");
      fetchWalletInfo(clean);
    } catch (err: any) {
      setExternalError(err.message);
    }
  };

  // 7. Handle Send TON
  const handleSendTon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    setSendSuccessMessage(null);

    const activeMnemonic = hasLocalKeys && mnemonic.length === 24
      ? mnemonic
      : manualMnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (activeMnemonic.length !== 24) {
      setSendError("Zur Autorisierung der Transaktion werden die 24 Wörter der Wallet benötigt.");
      return;
    }

    if (!sendRecipient || !isValidTonAddress(sendRecipient)) {
      setSendError("Bitte geben Sie eine gültige TON-Empfängeradresse ein.");
      return;
    }

    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) {
      setSendError("Bitte geben Sie einen Betrag größer als 0 ein.");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/ton/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mnemonic: activeMnemonic,
          recipient: sendRecipient.trim(),
          amount: amt,
          comment: sendMemo.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Senden");
      }

      setSendSuccessMessage(`${amt} TON erfolgreich an ${sendRecipient.slice(0, 6)}...${sendRecipient.slice(-4)} versendet!`);
      setSendAmount("");
      setSendRecipient("");
      setSendMemo("");
      setManualMnemonic("");

      // Refresh balance and txs
      setTimeout(() => fetchWalletInfo(), 3000);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  // Calculate Max transferable balance (leaving ~0.03 TON for network reserve)
  const handleSetMax = () => {
    const bal = parseFloat(balanceTon);
    const maxVal = Math.max(0, bal - 0.03);
    setSendAmount(maxVal > 0 ? maxVal.toFixed(4) : "0");
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Wallet className="h-7 w-7 text-[#0098EA]" />
            {t.wallet.title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t.wallet.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {address && (
            <Button
              onClick={() => fetchWalletInfo()}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-[#0098EA]")} />
              {t.wallet.refreshBalance}
            </Button>
          )}

          <Button
            onClick={() => {
              setGeneratedWords([]);
              setGeneratedAddr("");
              setImportError(null);
              setExternalError(null);
              setIsSetupOpen(true);
            }}
            variant="default"
            size="sm"
            className="gap-1.5 text-xs h-9 bg-gradient-to-r from-blue-600 to-[#0098EA] hover:from-blue-500 hover:to-[#0087d1] text-white shadow"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {address ? t.wallet.changeWalletButton : t.wallet.tabGenerate}
          </Button>
        </div>
      </div>

      {/* Main Wallet & Balance Display Card */}
      {address ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card 1: Balance & Quick Actions (Spans 2 cols) */}
          <Card className="lg:col-span-2 border-border/80 bg-gradient-to-br from-card via-card to-[#0098EA]/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#0098EA]/10 rounded-full blur-3xl pointer-events-none" />

            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-[#0098EA]/20 text-[#0098EA] flex items-center justify-center font-black text-xs">
                    TON
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      {t.wallet.balanceTitle}
                    </CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      The Open Network (Mainnet)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {hasLocalKeys ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 py-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.wallet.fullAccessBadge}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1 py-0.5">
                      <ShieldCheck className="h-3 w-3" />
                      {t.wallet.watchOnlyBadge}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              {/* Balance Numbers */}
              <div className="p-4 rounded-xl bg-background/50 border border-border/60 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <div>
                  <div className="text-3xl sm:text-4xl font-black tracking-tight text-foreground flex items-baseline gap-2">
                    {balanceTon}
                    <span className="text-lg sm:text-xl font-bold text-[#0098EA]">TON</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-medium mt-1">
                    ≈ ${balanceUsd.toFixed(2)} USD (Kurs: ${tonRateUsd.toFixed(2)} / TON)
                  </div>
                </div>

                {/* Explorer Link */}
                <a
                  href={`https://tonviewer.com/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#0098EA] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t.wallet.viewExplorer}
                </a>
              </div>

              {/* Address Bar */}
              <div className="p-3 rounded-lg bg-muted/40 border text-xs flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                    Verknüpfte Payout-Adresse:
                  </span>
                  <div className="font-mono text-xs font-bold truncate text-foreground mt-0.5">
                    {address}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleCopy(address, "address_bar")}
                  >
                    {copiedId === "address_bar" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Kopiert!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Kopieren</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                <Button
                  onClick={() => {
                    setSendError(null);
                    setSendSuccessMessage(null);
                    setIsSendOpen(true);
                  }}
                  className="gap-2 h-10 text-xs bg-[#0098EA] hover:bg-[#0087d1] text-white font-bold"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  {t.wallet.sendButton}
                </Button>

                <Button
                  onClick={() => setIsReceiveOpen(true)}
                  variant="outline"
                  className="gap-2 h-10 text-xs font-semibold"
                >
                  <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                  {t.wallet.receiveButton}
                </Button>

                {hasLocalKeys && (
                  <Button
                    onClick={() => {
                      setShowSeed(false);
                      setIsBackupOpen(true);
                    }}
                    variant="outline"
                    className="col-span-2 sm:col-span-1 gap-2 h-10 text-xs font-semibold border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    <KeyRound className="h-4 w-4" />
                    {t.wallet.backupButton}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Security & Settlement Info (1 col) */}
          <Card className="border-border flex flex-col justify-between">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-[#0098EA]" />
                Automatische Erlösverteilung
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Diese TON-Adresse ist fest in Ihrem Investor-Profil verankert.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="p-2.5 rounded-lg bg-muted/40 border space-y-1">
                <span className="font-semibold text-foreground block">100% Amortisation:</span>
                <p className="text-[11px]">
                  Sobald für Ihre Kanäle genehmigte Ausgaben anfallen, fließen Sterne-Erlöse bis zur vollständigen Deckung vorab auf dieses Wallet.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/40 border space-y-1">
                <span className="font-semibold text-foreground block">50/50 Gewinn-Splits:</span>
                <p className="text-[11px]">
                  Nach Amortisation werden die reifen Erlöse (nach Ablauf der 21-Tage-Haltefrist) vollautomatisch an diese Adresse überwiesen.
                </p>
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <div className="w-full p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[11px] text-blue-300 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-[#0098EA]" />
                <span>On-Chain verifizierbar auf TonScan</span>
              </div>
            </CardFooter>
          </Card>
        </div>
      ) : (
        /* Empty State: No wallet configured yet */
        <Card className="border-border border-dashed p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-[#0098EA]/10 border border-[#0098EA]/30 text-[#0098EA] mx-auto flex items-center justify-center">
            <Wallet className="h-8 w-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">{t.wallet.noWalletConfigured}</h3>
            <p className="text-xs text-muted-foreground">
              Erstellen Sie in Sekundenschnelle ein Dashboard-eigenes TON-Wallet oder verknüpfen Sie Ihre bestehende Adresse (Tonkeeper / Telegram Wallet), um Auszahlungen zu empfangen.
            </p>
          </div>
          <Button
            onClick={() => {
              setGeneratedWords([]);
              setGeneratedAddr("");
              setImportError(null);
              setExternalError(null);
              setIsSetupOpen(true);
            }}
            className="gap-2 bg-[#0098EA] hover:bg-[#0087d1] text-white"
          >
            <Sparkles className="h-4 w-4" />
            {t.wallet.tabGenerate}
          </Button>
        </Card>
      )}

      {/* Transaction History Section */}
      {address && (
        <Card className="border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0098EA]" />
                {t.wallet.recentTransactions}
              </CardTitle>
              <CardDescription className="text-xs">
                Echtzeit-Transaktionen direkt aus der TON-Blockchain
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchWalletInfo()}
              disabled={isRefreshing}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
              {t.wallet.refreshBalance}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length > 0 ? (
              <div className="divide-y divide-border">
                {transactions.map((tx) => (
                  <div
                    key={tx.hash}
                    className="p-3 sm:p-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        tx.isIncoming
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-blue-500/15 text-blue-400"
                      )}>
                        {tx.isIncoming ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <span>{tx.isIncoming ? "Eingehend" : "Ausgehend"}</span>
                          {tx.memo && (
                            <Badge variant="secondary" className="text-[10px] py-0 font-normal">
                              {tx.memo}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {tx.counterparty ? (
                            <span>{tx.counterparty.slice(0, 8)}...{tx.counterparty.slice(-6)}</span>
                          ) : (
                            <span>Blockchain Transfer</span>
                          )}
                          <span className="ml-2 font-sans">
                            {format(new Date(tx.now * 1000), "dd.MM.yyyy HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={cn(
                        "font-mono font-bold text-sm",
                        tx.isIncoming ? "text-emerald-400" : "text-foreground"
                      )}>
                        {tx.isIncoming ? "+" : "-"}{tx.amountTon} TON
                      </div>
                      <a
                        href={`https://tonviewer.com/transaction/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-[#0098EA] inline-flex items-center gap-1"
                      >
                        Details <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                <p>{t.wallet.noTransactions}</p>
                <p className="text-[11px]">Sobald Amortisationen oder Transfers erfolgen, erscheinen diese hier automatisch.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: SEND TON                                            */}
      {/* ============================================================ */}
      <Dialog open={isSendOpen} onOpenChange={setIsSendOpen}>
        <DialogContent className="max-w-md" onClose={() => setIsSendOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-[#0098EA]/20 text-[#0098EA] flex items-center justify-center">
                <Send className="h-4 w-4" />
              </div>
              <DialogTitle>{t.wallet.sendModalTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.wallet.sendModalDesc}
            </DialogDescription>
          </DialogHeader>

          {sendSuccessMessage ? (
            <div className="py-6 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">{t.wallet.sendSuccess}</h3>
              <p className="text-xs text-muted-foreground">{sendSuccessMessage}</p>
              <DialogFooter className="pt-2">
                <Button onClick={() => setIsSendOpen(false)} className="w-full">
                  Schließen
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSendTon} className="space-y-3.5 py-1">
              {sendError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {/* Recipient Field */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.wallet.recipientLabel}
                </label>
                <Input
                  required
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                  placeholder={t.wallet.recipientPlaceholder}
                  className="font-mono text-xs h-9"
                />
                {sendRecipient && (
                  <div className="mt-1 text-[11px] flex items-center gap-1">
                    {isValidTonAddress(sendRecipient) ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Gültige TON-Adresse
                      </span>
                    ) : (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Format prüfen (UQ... / EQ...)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Amount Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t.wallet.amountLabel}
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Verfügbar: <strong className="text-foreground">{balanceTon} TON</strong>
                  </span>
                </div>
                <div className="relative">
                  <Input
                    required
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder={t.wallet.amountPlaceholder}
                    className="font-mono text-xs pr-16 h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSetMax}
                    className="absolute right-1 top-1 h-7 text-[10px] text-[#0098EA] font-bold hover:bg-transparent"
                  >
                    {t.wallet.maxButton}
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {t.wallet.feeNotice}
                </span>
              </div>

              {/* Memo Field */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.wallet.memoLabel}
                </label>
                <Input
                  value={sendMemo}
                  onChange={(e) => setSendMemo(e.target.value)}
                  placeholder={t.wallet.memoPlaceholder}
                  className="text-xs h-9"
                />
              </div>

              {/* If no local keys, require seed input */}
              {!hasLocalKeys && (
                <div>
                  <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5 mb-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    24-Wort Mnemonic zur Freigabe:
                  </label>
                  <Input
                    type="password"
                    required
                    value={manualMnemonic}
                    onChange={(e) => setManualMnemonic(e.target.value)}
                    placeholder="24 Wörter getrennt durch Leerzeichen..."
                    className="font-mono text-xs h-9"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Wird nur im flüchtigen Speicher zur Signierung dieser Transaktion genutzt.
                  </span>
                </div>
              )}

              <DialogFooter className="pt-2 flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={isSending}
                  className="w-full gap-1.5 bg-[#0098EA] hover:bg-[#0087d1] text-white font-bold"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {t.wallet.sending}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {t.wallet.confirmSend}
                    </>
                  )}
                </Button>

                {/* External Deep-Link Fallback */}
                {sendRecipient && isValidTonAddress(sendRecipient) && (
                  <a
                    href={`ton://transfer/${sendRecipient}?amount=${toNano(sendAmount || "0").toString()}&text=${encodeURIComponent(sendMemo)}`}
                    className="text-center text-[11px] text-muted-foreground hover:text-[#0098EA] underline mt-1"
                  >
                    {t.wallet.externalSendFallback}
                  </a>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL 2: RECEIVE TON                                         */}
      {/* ============================================================ */}
      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent className="max-w-md text-center space-y-4" onClose={() => setIsReceiveOpen(false)}>
          <DialogHeader>
            <div className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5 text-[#0098EA]" />
              <DialogTitle>{t.wallet.receiveModalTitle}</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {t.wallet.receiveModalDesc}
            </DialogDescription>
          </DialogHeader>

          {/* QR Code */}
          <div className="p-4 bg-white rounded-2xl w-48 h-48 mx-auto flex items-center justify-center shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=ton://transfer/${address}`}
              alt="TON QR Code"
              className="w-40 h-40 object-contain"
            />
          </div>
          <span className="text-[11px] text-muted-foreground block">
            {t.wallet.scanQrPrompt}
          </span>

          {/* Address Display & Copy */}
          <div className="p-3 rounded-lg bg-muted/60 border text-left space-y-1.5">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
              Ihre öffentliche TON-Empfangsadresse:
            </span>
            <div className="font-mono text-xs font-bold text-foreground break-all">
              {address}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => handleCopy(address, "receive_copy")}
              className="w-full gap-1.5 bg-[#0098EA] hover:bg-[#0087d1] text-white"
            >
              {copiedId === "receive_copy" ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  Kopiert!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  {t.wallet.copyAddress}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL 3: BACKUP 24 WORDS                                     */}
      {/* ============================================================ */}
      <Dialog open={isBackupOpen} onOpenChange={setIsBackupOpen}>
        <DialogContent className="max-w-lg" onClose={() => setIsBackupOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-purple-400" />
              <DialogTitle>{t.wallet.backupModalTitle}</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Sichern Sie Ihre Secret Recovery Phrase sorgfältig ab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-300 leading-relaxed">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{t.wallet.backupWarning}</div>
            </div>

            {/* Reveal / Hide Button */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSeed(!showSeed)}
                className="gap-1.5 text-xs"
              >
                {showSeed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showSeed ? "Wörter verbergen" : "Wörter jetzt aufdecken"}
              </Button>

              {showSeed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(mnemonic.join(" "), "backup_words")}
                  className="gap-1.5 text-xs"
                >
                  {copiedId === "backup_words" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Wörter kopieren
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* 24 Word Grid */}
            {showSeed && mnemonic.length === 24 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {mnemonic.map((word, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-md bg-muted/60 border text-xs font-mono flex items-center justify-between"
                  >
                    <span className="text-[10px] text-muted-foreground">{idx + 1}.</span>
                    <span className="font-bold text-foreground">{word}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-muted/20 border border-dashed text-center text-xs text-muted-foreground">
                Klicken Sie auf „Wörter jetzt aufdecken“, um Ihre 24 Wörter sichtbar zu machen.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setIsBackupOpen(false)} className="w-full">
              Fertig & Gesichert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL 4: SETUP / GENERATE / IMPORT / LINK                     */}
      {/* ============================================================ */}
      <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <DialogContent className="max-w-xl" onClose={() => setIsSetupOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#0098EA]" />
              <DialogTitle>TON Wallet einrichten & verknüpfen</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Wählen Sie, wie Sie Ihr TON-Wallet im Dashboard aktivieren möchten.
            </DialogDescription>
          </DialogHeader>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/50 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setSetupTab("generate")}
              className={cn(
                "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                setupTab === "generate"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.wallet.tabGenerate}
            </button>

            <button
              type="button"
              onClick={() => setSetupTab("import")}
              className={cn(
                "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                setupTab === "import"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.wallet.tabImport}
            </button>

            <button
              type="button"
              onClick={() => setSetupTab("external")}
              className={cn(
                "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                setupTab === "external"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.wallet.tabExternal}
            </button>
          </div>

          {/* Tab 1: Generate */}
          {setupTab === "generate" && (
            <div className="space-y-4 py-2">
              <div>
                <h4 className="text-sm font-bold text-foreground">{t.wallet.generateTitle}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{t.wallet.generateDesc}</p>
              </div>

              {generatedWords.length === 0 ? (
                <div className="p-6 rounded-xl bg-gradient-to-r from-blue-950/20 via-background to-cyan-950/20 border border-blue-500/20 text-center space-y-3">
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Die Schlüsselgenerierung erfolgt mit <code>@ton/crypto</code> lokal in Ihrem Browser. Der Server erhält zu keinem Zeitpunkt Einsicht in Ihren Private Key.
                  </p>
                  <Button
                    onClick={handleGenerateWallet}
                    disabled={isGenerating}
                    className="gap-2 bg-[#0098EA] hover:bg-[#0087d1] text-white font-bold"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generiere...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t.wallet.generateButton}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                    <strong>Sicherheitshinweis:</strong> Schreiben Sie sich diese 24 Wörter auf.
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {generatedWords.map((word, idx) => (
                      <div
                        key={idx}
                        className="p-1.5 rounded bg-muted/60 border text-xs font-mono flex items-center justify-between"
                      >
                        <span className="text-[10px] text-muted-foreground">{idx + 1}.</span>
                        <span className="font-semibold">{word}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/50 border text-xs space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Generierte Adresse:</span>
                    <div className="font-mono text-xs font-bold text-[#0098EA] break-all">{generatedAddr}</div>
                  </div>

                  <Button
                    onClick={() => handleActivateWallet(generatedAddr, generatedWords)}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    <Check className="h-4 w-4" />
                    Dieses Wallet jetzt aktivieren & dauerhaft speichern
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Import */}
          {setupTab === "import" && (
            <div className="space-y-4 py-2">
              <div>
                <h4 className="text-sm font-bold text-foreground">{t.wallet.importTitle}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{t.wallet.importDesc}</p>
              </div>

              {importError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div>
                <textarea
                  rows={4}
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder={t.wallet.importPlaceholder}
                  className="w-full p-2.5 rounded-md border bg-card font-mono text-xs"
                />
              </div>

              <Button
                onClick={handleImportMnemonic}
                className="w-full gap-2 bg-[#0098EA] hover:bg-[#0087d1] text-white font-bold"
              >
                <Download className="h-4 w-4" />
                {t.wallet.importButton}
              </Button>
            </div>
          )}

          {/* Tab 3: External */}
          {setupTab === "external" && (
            <div className="space-y-4 py-2">
              <div>
                <h4 className="text-sm font-bold text-foreground">{t.wallet.externalTitle}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{t.wallet.externalDesc}</p>
              </div>

              {externalError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{externalError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Ihre TON-Adresse (UQ... / EQ...)
                </label>
                <Input
                  value={externalInput}
                  onChange={(e) => setExternalInput(e.target.value)}
                  placeholder="UQ... oder EQ..."
                  className="font-mono text-xs h-9"
                />
              </div>

              <Button
                onClick={handleLinkExternalAddress}
                className="w-full gap-2 bg-[#0098EA] hover:bg-[#0087d1] text-white font-bold"
              >
                <Check className="h-4 w-4" />
                {t.wallet.saveAddressButton}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
