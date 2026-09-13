import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateFinancials } from "@/lib/financial-engine";
import { formatUsd, truncateAddress } from "@/lib/utils";
import { Wallet, ArrowRight, ExternalLink, ShieldCheck, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function FinancesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "MASTER_ADMIN") {
    redirect("/investor");
  }
  const [models, payouts] = await Promise.all([
    prisma.model.findMany({
      include: {
        expenses: true,
        starTransactions: true,
        payouts: true,
      },
    }),
    prisma.payout.findMany({
      include: { model: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const modelsWithFin = models.map((m) => ({
    ...m,
    fin: calculateFinancials(m.id, m.openInvestBalance, m.expenses, m.starTransactions, m.payouts, {
      modelName: m.name,
      channelTitle: m.channelTitle,
      investorSharePercent: m.investorSharePercent,
      enableExpenseRecoupment: m.enableExpenseRecoupment,
    }),
  }));

  const totalGrossRevenue = modelsWithFin.reduce((acc, m) => acc + m.fin.totalGrossRevenueUsd, 0);
  const totalRecouped = modelsWithFin.reduce((acc, m) => acc + m.fin.recoupedUsd, 0);
  const totalAvailablePayout = modelsWithFin.reduce((acc, m) => acc + m.fin.partnerAvailablePayoutUsd, 0);
  const totalPaidOut = payouts.reduce((acc, p) => acc + p.amountUsd, 0);
  const totalPaidTon = payouts.reduce((acc, p) => acc + p.amountTon, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Financial Ledger & Payouts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auditable TON Blockchain disbursement history and profit distributions
          </p>
        </div>

        <Link href="/settings/wallet">
          <Button variant="ton" className="gap-2 text-xs">
            <Wallet className="h-4 w-4" />
            Manage TON Receiving Wallet
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Matured & Gross
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-foreground">
              {formatUsd(totalGrossRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            All models aggregate revenue
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Investments Recouped
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-blue-400">
              {formatUsd(totalRecouped)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            100% agency recovery achieved
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Disbursed (USD)
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-400">
              {formatUsd(totalPaidOut)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Settled via TON Blockchain
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Disbursed (TON)
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-[#0098EA]">
              {totalPaidTon.toFixed(2)} 💎
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Native TON tokens sent
          </CardContent>
        </Card>
      </div>

      {/* Cross-Model Recoupment Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Creator Model Split Status</CardTitle>
          <CardDescription className="text-xs">
            Current stage in the 100% recoupment and profit split pipeline
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">Model</th>
                  <th className="p-3">Target Invest</th>
                  <th className="p-3">Recouped</th>
                  <th className="p-3">Remaining Balance</th>
                  <th className="p-3">Investor Share</th>
                  <th className="p-3">Available Payout</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {modelsWithFin.map((m) => {
                  const { fin } = m;
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-bold">{m.name}</td>
                      <td className="p-3">{formatUsd(fin.totalInvestTargetUsd)}</td>
                      <td className="p-3 text-blue-400 font-semibold">{formatUsd(fin.recoupedUsd)}</td>
                      <td className="p-3 font-semibold">{formatUsd(fin.remainingInvestBalanceUsd)}</td>
                      <td className="p-3 font-semibold">{formatUsd(fin.partnerTotalShareUsd)} ({m.investorSharePercent || 50}%)</td>
                      <td className="p-3 font-bold text-emerald-400">
                        {formatUsd(fin.partnerAvailablePayoutUsd)}
                      </td>
                      <td className="p-3">
                        {fin.isRecouped ? (
                          <Badge variant="success">100% Recouped</Badge>
                        ) : (
                          <Badge variant="warning">Recouping</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Link href={`/models/${m.slug}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                            Details <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* On-chain Payout Ledger */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                TON Blockchain Payout Ledger
              </CardTitle>
              <CardDescription className="text-xs">
                Verified on-chain transactions booked into the agency ledger
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {payouts.length} Transactions Settled
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">Amount ($ USD)</th>
                  <th className="p-3">Amount (TON)</th>
                  <th className="p-3">Recipient Address</th>
                  <th className="p-3">On-Chain Tx Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No TON payouts recorded yet. Log your first payout inside any recouped model page.
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 whitespace-nowrap">
                        {format(new Date(p.paidAt), "dd.MM.yyyy HH:mm")}
                      </td>
                      <td className="p-3 font-semibold">{p.model.name}</td>
                      <td className="p-3 font-bold text-emerald-400">{formatUsd(p.amountUsd)}</td>
                      <td className="p-3 font-mono font-bold text-[#0098EA]">
                        {p.amountTon.toFixed(3)} 💎
                      </td>
                      <td className="p-3 font-mono">
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
    </div>
  );
}
