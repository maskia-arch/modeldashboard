"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Star,
  TrendingUp,
  Calendar,
  Lock,
  CheckCircle2,
  RefreshCw,
  X,
  ShieldCheck,
  AlertCircle,
  Trophy,
  DollarSign,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd, formatStars, cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

interface DailyHistoryItem {
  date: string;
  starsAmount: number;
  estimatedUsd: number;
  txCount: number;
  maturedStars: number;
  pendingStars: number;
}

interface StatsSummary {
  totalStars: number;
  totalUsd: number;
  totalTransactions: number;
  maturedStars: number;
  pendingStars: number;
  last7DaysStars: number;
  last30DaysStars: number;
  averageDailyStars: number;
  activeDaysCount: number;
  bestDay: {
    date: string;
    starsAmount: number;
    estimatedUsd: number;
  } | null;
}

interface ModelStarsStatsData {
  model: {
    id: string;
    name: string;
    slug: string;
    channelTitle: string | null;
    telegramChannelId: string;
    avatarUrl: string | null;
  };
  summary: StatsSummary;
  dailyHistory: DailyHistoryItem[];
  recentTransactions?: any[];
}

interface ModelStarsStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelSlug?: string | null;
  modelId?: string | null;
  modelName?: string | null;
  isMasterAdmin?: boolean;
}

export function ModelStarsStatsModal({
  isOpen,
  onClose,
  modelSlug,
  modelId,
  modelName,
  isMasterAdmin = false,
}: ModelStarsStatsModalProps) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<ModelStarsStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"7D" | "30D" | "90D" | "ALL">("30D");
  const [hoveredDay, setHoveredDay] = useState<DailyHistoryItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const targetIdentifier = modelSlug || modelId;

  const fetchStats = async () => {
    if (!targetIdentifier) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/models/${targetIdentifier}/stars-stats`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Fehler beim Laden der Sterne-Statistik");
      }
      setData(json);
    } catch (err: any) {
      console.error("[StarsStatsModal] Fetch error:", err);
      setError(err.message || "Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetIdentifier) {
      fetchStats();
      setSyncMessage(null);
    }
  }, [isOpen, targetIdentifier]);

  const handleManualSync = async () => {
    if (!targetIdentifier || !isMasterAdmin) return;
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/models/${targetIdentifier}/stars-sync`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Synchronisation fehlgeschlagen");
      }
      setSyncMessage(json.message || t.starsStats?.syncSuccess || "Synchronisiert!");
      await fetchStats();
    } catch (err: any) {
      setSyncMessage(`❌ ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter daily history based on timeframe
  const filteredDailyHistory = useMemo(() => {
    if (!data?.dailyHistory) return [];
    if (timeframe === "ALL") return data.dailyHistory;

    const daysCount = timeframe === "7D" ? 7 : timeframe === "30D" ? 30 : 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysCount);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    return data.dailyHistory.filter((item) => item.date >= cutoffStr);
  }, [data?.dailyHistory, timeframe]);

  // Chart metrics
  const maxDailyStars = useMemo(() => {
    if (filteredDailyHistory.length === 0) return 100;
    const max = Math.max(...filteredDailyHistory.map((d) => d.starsAmount));
    return max > 0 ? Math.ceil(max * 1.15) : 100;
  }, [filteredDailyHistory]);

  const filteredTotalStars = useMemo(() => {
    return filteredDailyHistory.reduce((acc, d) => acc + d.starsAmount, 0);
  }, [filteredDailyHistory]);

  const filteredTotalUsd = useMemo(() => {
    return filteredDailyHistory.reduce((acc, d) => acc + d.estimatedUsd, 0);
  }, [filteredDailyHistory]);

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split("-");
      return `${d}.${m}.${y}`;
    } catch {
      return dateStr;
    }
  };

  const formatShortDay = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split("-");
      return `${d}.${m}.`;
    } catch {
      return dateStr;
    }
  };

  const formatFullDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00Z");
      return d.toLocaleDateString(language === "de" ? "de-DE" : "en-US", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} className="max-w-4xl">
      <DialogContent
        className="w-full max-h-[92vh] overflow-y-auto p-0 border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl rounded-2xl"
        onClose={onClose}
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border-2 border-amber-500/30 shrink-0 flex items-center justify-center shadow-inner">
                {data?.model.avatarUrl ? (
                  <img
                    src={data.model.avatarUrl}
                    alt={data.model.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center font-bold text-amber-400 bg-amber-500/10">
                    <Star className="h-6 w-6 fill-amber-400" />
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-xl font-black tracking-tight text-foreground truncate">
                    {data?.model.name || modelName || "Model"}
                  </DialogTitle>
                  
                  {/* Slim Synced Status Badge */}
                  {isSyncing ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 border-amber-500/30 text-amber-300 text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
                      <span>{t.starsStats?.syncing || "Synchronisiere..."}</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span>Synced</span>
                    </Badge>
                  )}
                </div>

                <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] truncate max-w-[200px] sm:max-w-[320px]">
                    {data?.model.channelTitle || data?.model.telegramChannelId || ""}
                  </span>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium whitespace-nowrap text-[11px]">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    {t.starsStats?.verifiedBadge || "Verifizierte Telegram Stars Daten"}
                  </span>
                </DialogDescription>
              </div>
            </div>

            {/* Master Admin Sync Button */}
            {isMasterAdmin && (
              <div className="flex flex-col sm:items-end gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManualSync}
                  disabled={isSyncing || loading}
                  className="h-8 gap-1.5 text-xs font-semibold whitespace-nowrap border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 shadow-sm"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin text-amber-400")} />
                  <span>
                    {isSyncing
                      ? t.starsStats?.syncing || "Synchronisiere..."
                      : "Synchronisieren"}
                  </span>
                </Button>
                {syncMessage && (
                  <span className="text-[10px] text-amber-300 animate-in fade-in max-w-[220px] text-right truncate">
                    {syncMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm font-semibold text-muted-foreground">
                {language === "de" ? "Lade historische Sterne-Daten..." : "Loading stars statistics..."}
              </p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm flex items-center gap-3">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-bold">{language === "de" ? "Fehler beim Laden" : "Error loading data"}</p>
                <p className="text-xs opacity-90 mt-0.5">{error}</p>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Top KPI Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Total All-Time Stars */}
                <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                      <span>{t.starsStats?.totalEarnedStars || "Gesamte Sterne"}</span>
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="text-2xl font-black text-amber-300">
                      {formatStars(data.summary.totalStars)}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      ≈ {formatUsd(data.summary.totalUsd)}
                    </p>
                  </CardContent>
                </Card>

                {/* Last 30 Days */}
                <Card className="border-border bg-card/60">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>{t.starsStats?.last30Days || "Letzte 30 Tage"}</span>
                      <Calendar className="h-4 w-4 text-primary" />
                    </span>
                    <div className="text-2xl font-black text-foreground">
                      {formatStars(data.summary.last30DaysStars)}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {data.summary.last7DaysStars > 0 && (
                        <span className="text-emerald-400 mr-1">
                          +{formatStars(data.summary.last7DaysStars)} (7T)
                        </span>
                      )}
                      Ø {data.summary.averageDailyStars} {t.starsStats?.starsUnit || "Stars"}/Tag
                    </p>
                  </CardContent>
                </Card>

                {/* Best Day Peak */}
                <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center justify-between">
                      <span>{t.starsStats?.bestDay || "Bester Tag"}</span>
                      <Trophy className="h-4 w-4 text-purple-400" />
                    </span>
                    <div className="text-2xl font-black text-purple-300">
                      {data.summary.bestDay ? formatStars(data.summary.bestDay.starsAmount) : "0"}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium truncate">
                      {data.summary.bestDay
                        ? `${formatDate(data.summary.bestDay.date)} • ${formatUsd(data.summary.bestDay.estimatedUsd)}`
                        : t.starsStats?.noData || "Keine Daten"}
                    </p>
                  </CardContent>
                </Card>

                {/* Maturity / Lock Status Split */}
                <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card">
                  <CardContent className="p-4 space-y-1">
                    <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                      <span>{t.starsStats?.maturedStars || "Gereift"}</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </span>
                    <div className="text-2xl font-black text-emerald-300">
                      {formatStars(data.summary.maturedStars)}
                    </div>
                    <p className="text-[11px] text-amber-400 font-medium">
                      🔒 {formatStars(data.summary.pendingStars)} {t.starsStats?.pendingStars || "in 21d Haltefrist"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Graphical Historical Chart Card */}
              <Card className="border border-border/80 bg-card/80 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-amber-400" />
                      <span>{t.starsStats?.chartTitle || "Tagesverlauf: Erwirtschaftete Sterne"}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === "de"
                        ? `Historischer Verlauf für ${filteredDailyHistory.length} Tage (${formatStars(filteredTotalStars)} Stars • ${formatUsd(filteredTotalUsd)})`
                        : `Historical timeline for ${filteredDailyHistory.length} days (${formatStars(filteredTotalStars)} Stars • ${formatUsd(filteredTotalUsd)})`}
                    </p>
                  </div>

                  {/* Timeframe Buttons */}
                  <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 shrink-0">
                    {(["7D", "30D", "90D", "ALL"] as const).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setTimeframe(tf)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                          timeframe === tf
                            ? "bg-amber-500 text-black shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {tf === "7D"
                          ? t.starsStats?.filter7d || "7T"
                          : tf === "30D"
                          ? t.starsStats?.filter30d || "30T"
                          : tf === "90D"
                          ? t.starsStats?.filter90d || "90T"
                          : t.starsStats?.filterAll || "Gesamt"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 sm:p-6 space-y-3">
                  {/* Interactive Chart Area */}
                  {filteredDailyHistory.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground text-xs">
                      <Star className="h-8 w-8 text-amber-500/30 mx-auto mb-2" />
                      <p>{t.starsStats?.chartEmpty || "Noch keine Sterne im gewählten Zeitraum."}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Hover Info Tooltip Box */}
                      <div className="h-10 px-3.5 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-between text-xs transition-all">
                        {hoveredDay ? (
                          <div className="flex items-center gap-4 flex-wrap w-full justify-between">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-amber-400" />
                              {formatFullDate(hoveredDay.date)}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-amber-400">
                                ⭐ {formatStars(hoveredDay.starsAmount)} {t.starsStats?.starsUnit || "Stars"}
                              </span>
                              <span className="font-semibold text-emerald-400">
                                ≈ {formatUsd(hoveredDay.estimatedUsd)}
                              </span>
                              <span className="text-muted-foreground">
                                {hoveredDay.txCount} {t.starsStats?.hoverTxLabel || "Käufe"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-[11px]">
                            {language === "de"
                              ? "Fahre mit der Maus über die Balken, um Tagesdetails zu sehen."
                              : "Hover over bars to inspect daily details."}
                          </span>
                        )}
                      </div>

                      {/* SVG Bar Chart with Responsive ViewBox */}
                      <div className="w-full overflow-x-auto pt-2 pb-1">
                        <div
                          className="relative"
                          style={{
                            minWidth: filteredDailyHistory.length > 20 ? `${filteredDailyHistory.length * 28}px` : "100%",
                            height: "220px",
                          }}
                        >
                          <svg
                            className="w-full h-full overflow-visible"
                            viewBox={`0 0 ${Math.max(600, filteredDailyHistory.length * 28)} 200`}
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient id="starBarGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F59E0B" stopOpacity="1" />
                                <stop offset="100%" stopColor="#D97706" stopOpacity="0.75" />
                              </linearGradient>
                              <linearGradient id="starBarHoverGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FDE047" stopOpacity="1" />
                                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.9" />
                              </linearGradient>
                            </defs>

                            {/* Background Horizontal Guide Lines */}
                            {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                              const y = 170 - ratio * 150;
                              return (
                                <g key={idx}>
                                  <line
                                    x1="0"
                                    y1={y}
                                    x2="100%"
                                    y2={y}
                                    stroke="currentColor"
                                    className="text-border/40"
                                    strokeDasharray="4 4"
                                    strokeWidth="1"
                                  />
                                </g>
                              );
                            })}

                            {/* Baseline */}
                            <line
                              x1="0"
                              y1="170"
                              x2="100%"
                              y2="170"
                              stroke="currentColor"
                              className="text-border"
                              strokeWidth="1.5"
                            />

                            {/* Daily Bars */}
                            {filteredDailyHistory.map((item, idx) => {
                              const totalBars = filteredDailyHistory.length;
                              const chartWidth = Math.max(600, totalBars * 28);
                              const step = chartWidth / totalBars;
                              const barWidth = Math.max(8, Math.min(22, step * 0.7));
                              const x = idx * step + (step - barWidth) / 2;

                              const height = Math.max(
                                3,
                                (item.starsAmount / maxDailyStars) * 150
                              );
                              const y = 170 - height;
                              const isHovered = hoveredDay?.date === item.date;

                              return (
                                <g
                                  key={item.date}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredDay(item)}
                                  onMouseLeave={() => setHoveredDay(null)}
                                  onClick={() => setHoveredDay(item)}
                                >
                                  {/* Transparent wider click/hover target */}
                                  <rect
                                    x={x - 4}
                                    y={10}
                                    width={barWidth + 8}
                                    height={165}
                                    fill="transparent"
                                  />

                                  {/* Visual Bar */}
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={height}
                                    rx={3}
                                    fill={isHovered ? "url(#starBarHoverGrad)" : "url(#starBarGrad)"}
                                    className={cn(
                                      "transition-all duration-150",
                                      isHovered
                                        ? "filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                                        : "opacity-95"
                                    )}
                                  />

                                  {/* X-axis date label (thinned out if many bars) */}
                                  {(totalBars <= 15 || idx % Math.ceil(totalBars / 12) === 0 || idx === totalBars - 1) && (
                                    <text
                                      x={x + barWidth / 2}
                                      y="190"
                                      textAnchor="middle"
                                      className={cn(
                                        "text-[10px] font-mono",
                                        isHovered ? "fill-amber-400 font-bold" : "fill-muted-foreground"
                                      )}
                                    >
                                      {formatShortDay(item.date)}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Historical Daily Table */}
              <Card className="border border-border/80 bg-card overflow-hidden shadow-sm">
                <div className="p-4 border-b flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span>{t.starsStats?.tableTitle || "Historische Tagesaufzeichnung"}</span>
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    {filteredDailyHistory.length} {language === "de" ? "Tage mit Umsatz" : "Active days"}
                  </Badge>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                      <tr className="border-b text-muted-foreground text-left">
                        <th className="p-3">{t.starsStats?.colDay || "Datum / Tag"}</th>
                        <th className="p-3">{t.starsStats?.colStars || "Sterne"}</th>
                        <th className="p-3">{t.starsStats?.colUsd || "USD Gegenwert"}</th>
                        <th className="p-3">{t.starsStats?.colPurchases || "Transaktionen"}</th>
                        <th className="p-3 text-right">{t.starsStats?.colStatus || "Status"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredDailyHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            {t.starsStats?.chartEmpty || "Keine Einträge vorhanden."}
                          </td>
                        </tr>
                      ) : (
                        [...filteredDailyHistory].reverse().map((day) => (
                          <tr
                            key={day.date}
                            className="hover:bg-muted/40 transition-colors"
                            onMouseEnter={() => setHoveredDay(day)}
                          >
                            <td className="p-3 font-semibold text-foreground whitespace-nowrap">
                              {formatFullDate(day.date)}
                            </td>
                            <td className="p-3 whitespace-nowrap font-bold text-amber-400">
                              ⭐ {formatStars(day.starsAmount)}
                            </td>
                            <td className="p-3 whitespace-nowrap font-semibold text-foreground">
                              {formatUsd(day.estimatedUsd)}
                            </td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">
                              {day.txCount} {t.starsStats?.hoverTxLabel || "Käufe"}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              {day.pendingStars > 0 ? (
                                <Badge variant="warning" className="gap-1 text-[10px] py-0">
                                  <Lock className="h-2.5 w-2.5" />
                                  {formatStars(day.pendingStars)} {t.starsStats?.pendingStars || "Haltefrist"}
                                </Badge>
                              ) : (
                                <Badge variant="success" className="gap-1 text-[10px] py-0">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  {t.starsStats?.maturedStars || "Gereift"}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
