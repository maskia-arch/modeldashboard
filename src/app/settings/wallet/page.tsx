import React from "react";
import { prisma } from "@/lib/prisma";
import { TonWalletGenerator } from "@/components/TonWalletGenerator";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Info } from "lucide-react";

export const revalidate = 0;

export default async function WalletSettingsPage() {
  const user = await prisma.user.findFirst();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">TON Wallet Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Client-side non-custodial wallet creation and payout destination management
        </p>
      </div>

      <TonWalletGenerator currentAddress={user?.tonAddress} />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            About TON Integration & Payout Flow
          </CardTitle>
          <CardDescription className="text-xs">
            How The Open Network powers agency profit settlements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <p>
            • <strong>Client-Side Non-Custodial:</strong> The 24-word seed phrase is generated directly in your browser using <code>@ton/crypto</code>. The agency server never sees, transmits, or stores your private keys.
          </p>
          <p>
            • <strong>Zero Fee Internal Transfers:</strong> When 50/50 profit splits are liquidated, payouts are sent directly to your configured public TON address.
          </p>
          <p>
            • <strong>On-Chain Verifiability:</strong> Every recorded payout is validated via public TON RPC endpoints (TonCenter / TonAPI) and permanently linked on TonScan.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
