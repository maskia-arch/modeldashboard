"use client";

import React from "react";
import Link from "next/link";
import { formatUsd, truncateAddress } from "@/lib/utils";
import { Wallet, ArrowRight, ExternalLink, ShieldCheck, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";

interface FinancesClientProps {
  totalGrossRevenue: number;
  totalRecouped: number;
  totalAvailablePayout: number;
  totalPaidOut: number;
  totalPaidTon: number;
  payouts: any[];
}

export function FinancesClient({
  totalGrossRevenue,
  totalRecouped,
  totalAvailablePayout,
  totalPaidOut,
  totalPaidTon,
  payouts,
}: FinancesClientProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.finances.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.finances.subtitle}
          </p>
        </div>

        <Link href="/settings/wallet">
          <Button variant="ton" className="gap-2 text-xs">
            <Wallet className="h-4 w-4" />
            {t.finances.manageWallet}
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.finances.totalRevenue}
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-foreground">
              {formatUsd(totalGrossRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.finances.allModelsRevenueDesc}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.finances.totalRecouped}
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-blue-400">
              {formatUsd(totalRecouped)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.finances.recoveryAchievedDesc}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.finances.availablePayouts}
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-400">
              {formatUsd(totalAvailablePayout)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.finances.readyForTransferDesc}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.finances.totalDisbursed}
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-foreground">
              {formatUsd(totalPaidOut)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground font-mono">
            {totalPaidTon.toFixed(2)} TON • {t.finances.historicallySettledDesc}
          </CardContent>
        </Card>
      </div>

      {/* Global Payout Ledger & Blockchain Audit Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                {t.finances.payoutLedger}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {t.finances.allPayoutsVerified}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {payouts.length} {t.common.actions}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">{t.finances.date}</th>
                  <th className="p-3">{t.finances.channel}</th>
                  <th className="p-3">{t.finances.recipient}</th>
                  <th className="p-3">{t.finances.amountUsd}</th>
                  <th className="p-3">{t.finances.amountTon}</th>
                  <th className="p-3">{t.finances.hash}</th>
                  <th className="p-3 text-right">{t.common.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {t.finances.noTransactions}
                    </td>
                  </tr>
                ) : (
                  payouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(payout.paidAt), "dd.MM.yyyy HH:mm")}
                      </td>
                      <td className="p-3 font-semibold text-foreground">
                        <Link
                          href={`/models/${payout.model.slug}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          {payout.model.name}
                        </Link>
                      </td>
                      <td className="p-3 font-mono">
                        {truncateAddress(payout.recipient)}
                      </td>
                      <td className="p-3 font-bold text-foreground">
                        {formatUsd(payout.amountUsd)}
                      </td>
                      <td className="p-3 font-mono font-bold text-sky-400">
                        {payout.amountTon.toFixed(2)} TON
                      </td>
                      <td className="p-3 font-mono text-muted-foreground">
                        {payout.txHash ? (
                          <span title={payout.txHash}>{truncateAddress(payout.txHash)}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {payout.txHash ? (
                          <a
                            href={`https://tonviewer.com/transaction/${payout.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {t.finances.viewExplorer} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
