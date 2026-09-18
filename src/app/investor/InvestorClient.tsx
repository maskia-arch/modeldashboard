"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  CalendarClock,
  Search,
  Eye,
  Star,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { ModelStarsStatsModal } from "@/components/ModelStarsStatsModal";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TonWalletGenerator } from "@/components/TonWalletGenerator";
import { formatUsd, truncateAddress, getMediaDisplayUrl, cn } from "@/lib/utils";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { formatGermanDateTime } from "@/lib/timezone";
import { useLanguage } from "@/context/LanguageContext";
import type { InvestorPortfolio } from "@/lib/financial-engine";

interface InvestorClientProps {
  investor: any;
  portfolio: InvestorPortfolio;
  assignedModels: Array<{ id: string; name: string; channelTitle?: string | null; enableExpenseRecoupment?: boolean }>;
  submittedExpenses: any[];
  fulfilledPayouts?: any[];
  scheduledPosts?: any[];
  initialTab?: string;
}

export function InvestorClient({
  investor,
  portfolio,
  assignedModels,
  submittedExpenses: initialExpenses,
  fulfilledPayouts: initialPayouts = [],
  scheduledPosts: initialPosts = [],
  initialTab = "channels",
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
  const [selectedChannelForStats, setSelectedChannelForStats] = useState<any | null>(null);

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

  // Schedule Tab State (Read-Only)
  const [schedulePosts, setSchedulePosts] = useState(initialPosts || []);
  const [activeTab, setActiveTab] = useState(initialTab || "channels");
  const [scheduleModelFilter, setScheduleModelFilter] = useState<string>("ALL");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<string>("ALL");
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState<string>("");
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  useEffect(() => {
    setSchedulePosts(initialPosts || []);
  }, [initialPosts]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam) {
        setActiveTab(tabParam);
      }
    }
  }, []);

  const dateLocale = language === "de" ? de : enUS;

  const handleCopyCaption = (caption: string, id: string) => {
    navigator.clipboard.writeText(caption);
    setCopiedPostId(id);
    setTimeout(() => setCopiedPostId(null), 2000);
  };

  const scheduleStats = useMemo(() => {
    let pending = 0;
    let scheduled = 0;
    let published = 0;
    let publishedToday = 0;
    const now = new Date();

    schedulePosts.forEach((p) => {
      const targetDate = new Date(p.scheduledFor);
      if (p.status === "PUBLISHED") {
        published++;
        if (p.publishedAt && isToday(new Date(p.publishedAt))) {
          publishedToday++;
        }
      } else if (targetDate <= now) {
        pending++;
      } else {
        scheduled++;
      }
    });

    return { pending, scheduled, published, publishedToday, total: schedulePosts.length };
  }, [schedulePosts]);

  const filteredSchedulePosts = useMemo(() => {
    const now = new Date();
    return schedulePosts.filter((post) => {
      if (scheduleModelFilter !== "ALL" && post.modelId !== scheduleModelFilter) {
        return false;
      }
      const targetDate = new Date(post.scheduledFor);
      let effectiveStatus = post.status;
      if (effectiveStatus === "SCHEDULED" && targetDate <= now) {
        effectiveStatus = "PENDING";
      }
      if (scheduleStatusFilter !== "ALL" && effectiveStatus !== scheduleStatusFilter) {
        return false;
      }
      if (scheduleSearchQuery.trim()) {
        const q = scheduleSearchQuery.toLowerCase();
        const matchCaption = post.caption?.toLowerCase().includes(q);
        const matchModel = post.model?.name?.toLowerCase().includes(q);
        const matchChannel = post.model?.channelTitle?.toLowerCase().includes(q);
        const matchTheme = post.asset?.theme?.toLowerCase().includes(q);
        if (!matchCaption && !matchModel && !matchChannel && !matchTheme) return false;
      }
      return true;
    });
  }, [schedulePosts, scheduleModelFilter, scheduleStatusFilter, scheduleSearchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Investor Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">{t.investorPortal.title}</h1>
            <Badge variant="success">{language === "de" ? "100% Amortisation Aktiv" : "100% Recoupment Active"}</Badge>
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
            {currentTonAddress ? t.investorPortal.manageWallet : (language === "de" ? "TON Wallet einrichten" : "Set Up TON Wallet")}
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
                +{formatUsd(portfolio.totalPendingReviewInvestUsd)} {t.investorPortal.inReview}
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
            {t.investorPortal.remainingBalanceLabel}{" "}
            {formatUsd(portfolio.totalRemainingInvestBalanceUsd)}
          </CardContent>
        </Card>

        {/* 21-Day Locked Revenue */}
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-between">
              {t.investorPortal.lockedHoldingTitle}
              <Lock className="h-4 w-4 text-amber-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-amber-300">
              {formatUsd(portfolio.totalPendingUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t.investorPortal.lockedHoldingDesc}
          </CardContent>
        </Card>

        {/* Available Liquid Payout */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              {t.investorPortal.liquidPayoutClaimTitle}
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-300">
              {formatUsd(portfolio.totalAvailablePayoutUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {portfolio.totalAvailablePayoutUsd > 0
              ? t.investorPortal.liquidPayoutClaimDescReady
              : t.investorPortal.liquidPayoutClaimDescSettled}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Channels vs Schedule vs Expenses vs Payouts */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 max-w-2xl">
          <TabsTrigger value="channels" className="gap-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            {t.investorPortal.channelsTab} ({portfolio.channels.length})
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2 text-xs">
            <CalendarClock className="h-3.5 w-3.5 text-purple-400" />
            {t.investorPortal.scheduleTab || (language === "de" ? "Zeitplan" : "Schedule")} ({schedulePosts.length})
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
              {t.investorPortal.channelBalanceSheetTitle}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t.investorPortal.channelBalanceSheetDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {portfolio.channels.map((channel) => (
              <Card
                key={channel.modelId}
                onClick={() => setSelectedChannelForStats(channel)}
                className="border-border hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full overflow-hidden bg-muted border border-amber-500/30 shrink-0 flex items-center justify-center">
                          {channel.avatarUrl ? (
                            <img src={channel.avatarUrl} alt={channel.modelName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center font-bold text-amber-400 bg-amber-500/10 text-xs">
                              {channel.modelName?.charAt(0) || "M"}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-bold truncate group-hover:text-amber-300 transition-colors">
                            {channel.modelName}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono truncate">
                            {channel.channelTitle || channel.modelId}
                          </CardDescription>
                        </div>
                      </div>
                      {channel.enableExpenseRecoupment === false ? (
                        <Badge variant="info" className="shrink-0">{t.overview.directSplitBadge} • {channel.investorSharePercent ?? 50}/{100 - (channel.investorSharePercent ?? 50)} {t.common.active}</Badge>
                      ) : channel.isRecouped ? (
                        <Badge variant="success" className="shrink-0">100% {t.overview.amortized100Badge} • {channel.investorSharePercent ?? 50}/{100 - (channel.investorSharePercent ?? 50)} {t.common.active}</Badge>
                      ) : (
                        <Badge variant="warning" className="shrink-0">{t.overview.amortizing} ({channel.investorSharePercent ?? 50}%)</Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-1 text-xs">
                    {/* Recoupment meter or Direct Split notice */}
                    {channel.enableExpenseRecoupment === false ? (
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-blue-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.investorPortal.directSplitNoticeTitle}</span>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          {language === "de"
                            ? `Einnahmen werden direkt im Verhältnis ${channel.investorSharePercent ?? 50}% (Investor) zu ${100 - (channel.investorSharePercent ?? 50)}% (Agentur) aufgeteilt.`
                            : `Revenues are split directly at ${channel.investorSharePercent ?? 50}% (Investor) / ${100 - (channel.investorSharePercent ?? 50)}% (Agency).`}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t.investorPortal.channelAmortization} ({channel.recoupmentProgressPercent}%)
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
                        <span className="text-muted-foreground">{t.investorPortal.grossStarsRevenue}</span>
                        <span className="font-semibold">{formatUsd(channel.totalGrossRevenueUsd)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{t.investorPortal.escrowLocked}</span>
                        <span className="text-amber-400 font-semibold">{formatUsd(channel.pipeline.lockedPendingUsd)}</span>
                      </div>
                      {channel.enableExpenseRecoupment !== false && (
                        <div className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">{t.investorPortal.openInvestTarget}</span>
                          <span className="text-blue-400 font-semibold">{formatUsd(channel.remainingInvestBalanceUsd)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{t.investorPortal.alreadyDisbursed}</span>
                        <span className="text-muted-foreground font-semibold">{formatUsd(channel.totalPaidOutUsd)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-sm font-bold text-emerald-400 pt-1">
                        <span>{t.investorPortal.liquidPayoutDue}</span>
                        <span>
                          {formatUsd(channel.investorAvailablePayoutUsd)}
                          {channel.investorAvailablePayoutUsd === 0 && (
                            <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                              {t.investorPortal.fullySettledNotice}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Clickable CTA Button for Stars Statistics */}
                    <div className="pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs font-bold gap-1.5 border-amber-500/40 text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedChannelForStats(channel);
                        }}
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                        <span>{t.starsStats?.openStatsButton || "Sterne-Statistik ansehen"}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 ml-auto opacity-70 group-hover:opacity-100" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Content Schedule (Read-Only) */}
        <TabsContent value="schedule" className="space-y-4 pt-2">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-purple-400" />
                  {t.investorPortal.scheduleTitle || "Content-Zeitplan der zugeteilten Models"}
                </h3>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1 py-0.5">
                  <Lock className="h-3 w-3" />
                  {t.investorPortal.readOnlyBadge || "Reiner Lesezugriff"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.investorPortal.scheduleDesc || "Einsicht in alle geplanten, fälligen und veröffentlichten Beiträge Ihrer Models (reiner Lesezugriff)."}
              </p>
            </div>
          </div>

          {/* KPI Stats Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className={cn("border-border", scheduleStats.pending > 0 ? "border-amber-500/50 bg-amber-950/10" : "")}>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <AlertCircle className={cn("h-3.5 w-3.5", scheduleStats.pending > 0 ? "text-amber-400 animate-pulse" : "text-muted-foreground")} />
                    {t.schedule.duePendingCard || "Fällig / In Übertragung"}
                  </div>
                  <div className="text-2xl font-black mt-1 text-foreground">
                    {scheduleStats.pending}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Wartet auf Veröffentlichung" : "Awaiting publication"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    {t.schedule.scheduledFutureCard || "Geplant (Zukunft)"}
                  </div>
                  <div className="text-2xl font-black mt-1 text-foreground">
                    {scheduleStats.scheduled}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.schedule.inQueue || "In der Pipeline"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {t.schedule.todayPostings || "Heute gepostet"}
                  </div>
                  <div className="text-2xl font-black mt-1 text-foreground">
                    {scheduleStats.publishedToday}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Bereits live im Channel" : "Live in channel today"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-purple-400" />
                    {language === "de" ? "Veröffentlicht (Gesamt)" : "Total Published"}
                  </div>
                  <div className="text-2xl font-black mt-1 text-foreground">
                    {scheduleStats.published}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Erfolgreich abgewickelt" : "Successfully completed"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter & Search Bar */}
          <Card>
            <CardContent className="p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Model Filter */}
                <select
                  value={scheduleModelFilter}
                  onChange={(e) => setScheduleModelFilter(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm"
                >
                  <option value="ALL">{t.investorPortal.allAssignedModels || "Alle zugeteilten Models"}</option>
                  {assignedModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.channelTitle || (language === "de" ? "Zugeordnet" : "Assigned")})
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <div className="flex rounded-md border border-border bg-card p-0.5 text-xs">
                  {[
                    { id: "ALL", label: t.schedule.filterAll || "Alle" },
                    { id: "PENDING", label: t.schedule.filterPending || "Fällig" },
                    { id: "SCHEDULED", label: t.schedule.filterScheduled || "Geplant" },
                    { id: "PUBLISHED", label: t.schedule.filterPublished || "Veröffentlicht" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setScheduleStatusFilter(tab.id)}
                      className={cn(
                        "px-2.5 py-1 rounded font-medium transition-colors",
                        scheduleStatusFilter === tab.id
                          ? "bg-primary/20 text-primary font-bold shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t.schedule.searchPlaceholder || "Suche nach Caption, Model..."}
                  value={scheduleSearchQuery}
                  onChange={(e) => setScheduleSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Posts Feed */}
          <div className="space-y-3">
            {filteredSchedulePosts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground space-y-2">
                  <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="font-semibold text-sm">
                    {language === "de" ? "Keine Beiträge für diese Kriterien gefunden" : "No posts found matching these criteria"}
                  </p>
                  <p className="text-xs">
                    {language === "de"
                      ? "Sobald für Ihre Models Beiträge im Zeitplan eingetragen werden, erscheinen sie hier in Echtzeit."
                      : "Once posts are scheduled for your models, they will appear here in real-time."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredSchedulePosts.map((post) => {
                const now = new Date();
                const targetDate = new Date(post.scheduledFor);
                let effectiveStatus = post.status;
                if (effectiveStatus === "SCHEDULED" && targetDate <= now) {
                  effectiveStatus = "PENDING";
                }
                const isPending = effectiveStatus === "PENDING";
                const isPublished = effectiveStatus === "PUBLISHED";

                return (
                  <Card
                    key={post.id}
                    className={cn(
                      "border transition-all hover:border-primary/40",
                      isPending ? "border-amber-500/50 bg-amber-950/10 shadow-sm" : ""
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Card Header: Model Info + Status Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/50">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xs text-primary">
                            {post.model?.name?.charAt(0) || "M"}
                          </div>
                          <div>
                            <span className="font-bold text-sm text-foreground block">
                              {post.model?.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {post.model?.channelTitle || post.model?.telegramChannelId}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isPending ? (
                            <Badge variant="warning" className="gap-1 animate-pulse font-bold text-xs py-1 px-2.5">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {t.schedule.dueBadge || "Fällig"} ({language === "de" ? "Seit" : "Since"} {formatDistanceToNow(targetDate, { locale: dateLocale })})
                            </Badge>
                          ) : isPublished ? (
                            <Badge variant="success" className="gap-1 text-xs py-1 px-2.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t.schedule.publishedBadge || "Veröffentlicht"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-xs py-1 px-2.5">
                              <Clock className="h-3.5 w-3.5 text-blue-400" />
                              {language === "de"
                                ? `Geplant für ${format(targetDate, "dd.MM.yyyy HH:mm", { locale: dateLocale })} Uhr`
                                : `Scheduled for ${format(targetDate, "yyyy-MM-dd HH:mm", { locale: dateLocale })}`}
                            </Badge>
                          )}

                          {post.starsPrice > 0 ? (
                            <Badge variant="default" className="bg-amber-600 text-[10px]">
                              ⭐ {post.starsPrice} {t.schedule.starsPaywall || "Stars Paywall"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {t.schedule.freeTeaser || "Kostenloser Teaser"}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Post Details & Caption */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        {/* Caption Preview (2 columns) */}
                        <div className="md:col-span-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-muted-foreground">Caption / Telegram-Text:</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopyCaption(post.caption, post.id)}
                            >
                              {copiedPostId === post.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">{t.schedule.copied || "Kopiert"}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>{t.schedule.copyCaption || "Caption kopieren"}</span>
                                </>
                              )}
                            </Button>
                          </div>

                          <div className="p-3 rounded-lg bg-card/60 border font-mono text-xs whitespace-pre-wrap leading-relaxed">
                            {post.caption}
                          </div>
                        </div>

                        {/* Media Asset Preview (1 column) */}
                        <div className="p-3 rounded-lg bg-muted/20 border space-y-2 text-xs flex flex-col justify-between">
                          <div className="space-y-1">
                            <span className="font-semibold text-muted-foreground block">{t.schedule.assignedMedia || "Zugeordnetes Foto/Video:"}</span>
                            {post.asset ? (
                              <>
                                <div className="flex items-start gap-2 pt-0.5">
                                  {post.asset.fileUrl && (
                                    <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0 border flex items-center justify-center">
                                      {post.asset.type === "VIDEO" || post.asset.fileUrl.match(/\.(mp4|mov|mkv|avi)$/i) ? (
                                        <video
                                          src={getMediaDisplayUrl(post.asset.fileUrl, post.asset.id)}
                                          className="h-full w-full object-cover"
                                          muted
                                        />
                                      ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={getMediaDisplayUrl(post.asset.fileUrl, post.asset.id)}
                                          alt="Preview"
                                          className="h-full w-full object-cover"
                                          onError={(e) => {
                                            (e.currentTarget as HTMLElement).style.display = "none";
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-foreground truncate">{post.asset.title || (language === "de" ? "Foto/Video" : "Photo/Video")}</div>
                                    <div className="text-[11px] text-muted-foreground truncate">{language === "de" ? "Thema" : "Theme"}: {post.asset.theme || (language === "de" ? "Allgemein" : "General")}</div>
                                    <div className="text-[11px] text-muted-foreground">Level: {post.asset.explicitLevel}</div>
                                  </div>
                                </div>
                                {post.asset.fileUrl && (
                                  <a
                                    href={getMediaDisplayUrl(post.asset.fileUrl, post.asset.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 mt-1 truncate"
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    {t.schedule.openFileLink || "Datei in neuem Tab ansehen"}
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">{t.schedule.noAssetLinked || "Kein Asset verknüpft"}</span>
                            )}
                          </div>

                          <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                            {t.schedule.scheduledAt || "Geplant für:"} {formatGermanDateTime(targetDate)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Submitted Invoices & Receipts */}
        <TabsContent value="expenses" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{t.investorPortal.submittedInvoicesTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {t.investorPortal.submittedInvoicesDesc}
              </p>
            </div>
            <Button onClick={() => setIsSubmitModalOpen(true)} size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              {t.investorPortal.submitInvoiceButton}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">{t.investorPortal.colStatus}</th>
                      <th className="p-3">{t.investorPortal.colDate}</th>
                      <th className="p-3">{t.investorPortal.colTargetChannel}</th>
                      <th className="p-3">{t.modelDetail.colDescription}</th>
                      <th className="p-3">{t.modelDetail.colAmount}</th>
                      <th className="p-3">{t.investorPortal.colReceipt}</th>
                      <th className="p-3">{t.investorPortal.colReviewNote}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          {t.investorPortal.noExpenses}
                        </td>
                      </tr>
                    ) : (
                      expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            {exp.status === "APPROVED" && <Badge variant="success">{t.investorPortal.expenseStatus.APPROVED}</Badge>}
                            {exp.status === "PENDING_REVIEW" && <Badge variant="warning">{t.investorPortal.expenseStatus.PENDING_REVIEW}</Badge>}
                            {exp.status === "REJECTED" && <Badge variant="destructive">{t.investorPortal.expenseStatus.REJECTED}</Badge>}
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
                                {t.investorPortal.viewPdf} <ExternalLink className="h-3 w-3" />
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
              <h3 className="text-lg font-bold">{t.investorPortal.tablePayoutsTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {language === "de"
                  ? "Vom Master Admin händisch auf deine TON Wallet überwiesen und auf der Blockchain verifiziert"
                  : "Transferred manually by Master Admin to your TON wallet and verified on the blockchain"}
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {fulfilledPayouts.length} {language === "de" ? "Auszahlungen verbucht" : "Payouts recorded"}
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">{t.investorPortal.colStatus}</th>
                      <th className="p-3">{t.investorPortal.colDate}</th>
                      <th className="p-3">{language === "de" ? "Betroffener Channel" : "Channel"}</th>
                      <th className="p-3">{t.modelDetail.colAmount}</th>
                      <th className="p-3">{t.investorPortal.colTonAmount}</th>
                      <th className="p-3">{t.investorPortal.colRecipient}</th>
                      <th className="p-3">{t.investorPortal.colTxHash}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fulfilledPayouts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          {t.investorPortal.noPayouts}
                        </td>
                      </tr>
                    ) : (
                      fulfilledPayouts.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <Badge variant="success" className="gap-1 font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              {language === "de" ? "Erfüllt" : "Fulfilled"}
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
                <DialogTitle>{language === "de" ? "TON Auszahlungsadresse einrichten" : "Set Up TON Payout Address"}</DialogTitle>
                <DialogDescription>
                  {currentTonAddress
                    ? (language === "de" ? "Deine aktive TON Auszahlungsadresse im System" : "Your active TON payout address in the system")
                    : (language === "de" ? "Wichtig: Hinterlegen Sie Ihre TON-Auszahlungsadresse. Sie können direkt ein neues Wallet erzeugen oder Ihre bestehende Adresse (z. B. Tonkeeper / Telegram Wallet) manuell angeben." : "Important: Set up your TON payout address. You can generate a new wallet or enter your existing address (e.g. Tonkeeper / Telegram Wallet) manually.")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <TonWalletGenerator
            currentAddress={currentTonAddress}
            onAddressSaved={handleWalletSaved}
          />

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2 items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsWalletModalOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground order-2 sm:order-1"
            >
              {language === "de" ? "Später einrichten (zum Zeitplan)" : "Set up later (view schedule)"}
            </Button>
            <Button
              type="button"
              onClick={() => setIsWalletModalOpen(false)}
              disabled={!currentTonAddress}
              className="w-full sm:w-auto text-xs font-semibold order-1 sm:order-2"
            >
              {currentTonAddress ? (language === "de" ? "Fertigstellen & zum Dashboard" : "Complete & Go to Dashboard") : (language === "de" ? "Bitte zuerst Adresse speichern" : "Please save address first")}
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
              <DialogTitle>{t.investorPortal.submitExpenseModalTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.investorPortal.submitExpenseModalDesc}
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
                {t.investorPortal.channelSelectLabel}
              </label>
              <select
                required
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm"
              >
                {assignedModels.map((m) => (
                  <option key={m.id} value={m.id} className="bg-card">
                    {m.name} ({m.channelTitle || (language === "de" ? "Zugeordnet" : "Assigned")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.investorPortal.descriptionLabel}
              </label>
              <Input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.investorPortal.descriptionPlaceholder}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.investorPortal.amountLabel}
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
                {t.investorPortal.receiptLabel}
              </label>
              <Input
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder={t.investorPortal.receiptPlaceholder}
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
                <span className="font-semibold text-foreground block">{language === "de" ? "Amortisations-Richtlinie:" : "Recoupment Policy:"}</span>
                <p>
                  {language === "de"
                    ? "Sobald vom Master Admin genehmigt, tilgen 100 % aller fälligen Telegram Stars Einnahmen dieses Channels vorrangig deine Investition, bevor die vereinbarten Gewinnbeteiligungen greifen."
                    : "Once approved by the Master Admin, 100% of all maturing Telegram Stars revenues of this channel prioritize recouping your investment before standard profit splits apply."}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? t.investorPortal.submitting : t.investorPortal.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Historical Stars Statistics Modal */}
      <ModelStarsStatsModal
        isOpen={Boolean(selectedChannelForStats)}
        onClose={() => setSelectedChannelForStats(null)}
        modelSlug={selectedChannelForStats?.slug}
        modelId={selectedChannelForStats?.modelId}
        modelName={selectedChannelForStats?.modelName}
        isMasterAdmin={investor?.role === "MASTER_ADMIN"}
      />
    </div>
  );
}
