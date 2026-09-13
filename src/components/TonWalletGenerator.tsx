"use client";

import React, { useState } from "react";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { KeyRound, Copy, Check, ShieldAlert, Sparkles, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TonWalletGeneratorProps {
  currentAddress?: string | null;
  onAddressSaved?: (newAddress: string) => void;
}

export function TonWalletGenerator({ currentAddress, onAddressSaved }: TonWalletGeneratorProps) {
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [generatedAddress, setGeneratedAddress] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isCopiedMnemonic, setIsCopiedMnemonic] = useState<boolean>(false);
  const [isCopiedAddress, setIsCopiedAddress] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

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
        body: JSON.stringify({ tonAddress: generatedAddress }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        if (onAddressSaved) onAddressSaved(generatedAddress);
      }
    } catch (err) {
      console.error("Failed to save TON address:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#0098EA]/15 flex items-center justify-center text-[#0098EA]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Client-Side TON Wallet Engine</CardTitle>
              <CardDescription className="text-xs">
                Zero-knowledge, non-custodial wallet generation via @ton/crypto
              </CardDescription>
            </div>
          </div>
          {currentAddress && (
            <Badge variant="success" className="text-xs">
              Wallet Configured
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {currentAddress && !generatedAddress && (
          <div className="p-3.5 rounded-lg bg-muted/40 border text-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">Active Receiving Address</span>
              <span className="font-mono text-xs font-semibold break-all">{currentAddress}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(currentAddress, "address")}
            >
              {isCopiedAddress ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-950/20 via-background to-cyan-950/20 border border-blue-500/20">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-[#0098EA]" />
              Generate New 24-Word Mnemonic
            </h4>
            <p className="text-xs text-muted-foreground">
              Keys are generated strictly in your browser memory and never transmitted to any server.
            </p>
          </div>
          <Button
            variant="ton"
            onClick={handleGenerateWallet}
            disabled={isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Wallet
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
                <strong>Important Security Warning:</strong> Write down these 24 words on physical paper. If you lose your recovery phrase, all funds will be permanently unrecoverable.
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                24-Word Recovery Secret (Mnemonic)
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
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Words
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
                  Derived V4R2 TON Public Address:
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

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Apply this address to your partner account for direct 50/50 profit distributions:
              </span>
              <Button
                onClick={handleSaveToProfile}
                disabled={isSaving || saveSuccess}
                variant="default"
                size="sm"
                className="gap-1.5"
              >
                {saveSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Address Saved!
                  </>
                ) : (
                  <>Set as Payout Address</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
