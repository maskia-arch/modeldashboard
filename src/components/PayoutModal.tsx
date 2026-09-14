"use client";

import React, { useState } from "react";
import { Wallet, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

interface PayoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  defaultRecipient?: string | null;
  maxAvailableUsd: number;
  onPayoutLogged?: () => void;
}

export function PayoutModal({
  open,
  onOpenChange,
  modelId,
  modelName,
  defaultRecipient,
  maxAvailableUsd,
  onPayoutLogged,
}: PayoutModalProps) {
  const { t } = useLanguage();
  const [recipient, setRecipient] = useState<string>(defaultRecipient || "");
  const [amountUsd, setAmountUsd] = useState<number>(maxAvailableUsd > 0 ? maxAvailableUsd : 100);
  const [amountTon, setAmountTon] = useState<number>(15.5);
  const [txHash, setTxHash] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  React.useEffect(() => {
    if (open) {
      if (defaultRecipient) setRecipient(defaultRecipient);
      if (maxAvailableUsd > 0) setAmountUsd(maxAvailableUsd);
      setError(null);
      setSuccess(false);
      setTxHash("");
    }
  }, [open, defaultRecipient, maxAvailableUsd]);

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
          recipient,
          amountUsd,
          amountTon,
          txHash,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to log and verify TON payout");
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        if (onPayoutLogged) onPayoutLogged();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Payout verification error");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#0098EA]/15 flex items-center justify-center text-[#0098EA]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.payoutModal.title}</DialogTitle>
              <DialogDescription>
                {t.payoutModal.desc} {modelName}
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
            <h4 className="text-base font-semibold">{t.payoutModal.successNotice}</h4>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
            <div className="p-3 rounded-lg bg-muted/40 text-xs flex justify-between">
              <span className="text-muted-foreground">{t.pipeline.availablePayoutLabel}</span>
              <span className="font-bold text-emerald-400">{formatUsd(maxAvailableUsd)}</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.payoutModal.recipientLabel}
              </label>
              <Input
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="EQ... or UQ..."
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.payoutModal.amountUsdLabel}
                </label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  max={maxAvailableUsd > 0 ? maxAvailableUsd : undefined}
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.payoutModal.amountTonLabel}
                </label>
                <Input
                  required
                  type="number"
                  step="0.001"
                  value={amountTon}
                  onChange={(e) => setAmountTon(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.payoutModal.txHashLabel}
              </label>
              <Input
                required
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={t.payoutModal.txHashPlaceholder}
                className="font-mono text-xs"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {t.payoutModal.explorerNotice}
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                variant="ton"
                disabled={isVerifying}
                className="w-full gap-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.payoutModal.submittingButton}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t.payoutModal.submitButton}
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
