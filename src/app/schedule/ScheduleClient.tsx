"use client";

import React, { useState, useMemo } from "react";
import {
  CalendarClock,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Plus,
  Sparkles,
  Filter,
  Search,
  Trash2,
  ExternalLink,
  Calendar,
  Layers,
  Radio,
  RefreshCw,
  Eye,
  Undo2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

interface ScheduleClientProps {
  initialModels: any[];
  initialPosts: any[];
  totalUnusedAssets: number;
}

export function ScheduleClient({
  initialModels,
  initialPosts,
  totalUnusedAssets: initialAssetCount,
}: ScheduleClientProps) {
  const { t, language } = useLanguage();
  const dateLocale = language === "de" ? de : enUS;

  const [models] = useState(initialModels);
  const [posts, setPosts] = useState(initialPosts);
  const [unusedCount, setUnusedCount] = useState(initialAssetCount);

  // Filters
  const [selectedModelId, setSelectedModelId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [isAutoPlanOpen, setIsAutoPlanOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Content Form State
  const [contentModelId, setContentModelId] = useState<string>(initialModels[0]?.id || "");
  const [contentTitle, setContentTitle] = useState("");
  const [contentTheme, setContentTheme] = useState("Strand & Sommer");
  const [contentNotes, setContentNotes] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [contentType, setContentType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [contentLevel, setContentLevel] = useState<"TEASER" | "SOFT" | "PPV">("TEASER");
  const [contentCount, setContentCount] = useState<number>(1);

  // Auto-Plan Form State
  const [planModelId, setPlanModelId] = useState<string>("ALL");
  const [planStartDate, setPlanStartDate] = useState<string>("");

  // Clipboard copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to determine effective status
  const getPostStatus = (post: any) => {
    if (post.status === "PUBLISHED") return "PUBLISHED";
    const isPast = new Date(post.scheduledFor).getTime() <= Date.now();
    if (isPast || post.status === "PENDING") return "PENDING";
    return "SCHEDULED";
  };

  // KPIs (scoped to selected model if one is picked)
  const stats = useMemo(() => {
    let pending = 0;
    let scheduled = 0;
    let publishedToday = 0;

    const relevantPosts = selectedModelId === "ALL"
      ? posts
      : posts.filter((p) => p.modelId === selectedModelId);

    relevantPosts.forEach((p) => {
      const st = getPostStatus(p);
      if (st === "PENDING") pending++;
      else if (st === "SCHEDULED") scheduled++;
      else if (st === "PUBLISHED" && isToday(new Date(p.scheduledFor))) {
        publishedToday++;
      }
    });

    return { pending, scheduled, publishedToday };
  }, [posts, selectedModelId]);

  // Filtered Posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Model filter
      if (selectedModelId !== "ALL" && post.modelId !== selectedModelId) return false;

      // Status filter
      const effectiveStatus = getPostStatus(post);
      if (selectedStatus !== "ALL" && effectiveStatus !== selectedStatus) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCaption = post.caption?.toLowerCase().includes(query);
        const matchModel = post.model?.name?.toLowerCase().includes(query);
        const matchAsset = post.asset?.title?.toLowerCase().includes(query);
        if (!matchCaption && !matchModel && !matchAsset) return false;
      }

      return true;
    });
  }, [posts, selectedModelId, selectedStatus, searchQuery]);

  // Mark Post as Published ("Abhaken")
  const handleCheckOff = async (postId: string) => {
    try {
      const res = await fetch(`/api/schedule/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMPLETE" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Revert Post back to Scheduled/Pending
  const handleRevert = async (postId: string) => {
    try {
      const res = await fetch(`/api/schedule/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Post
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm("Möchten Sie dieses geplante Posting wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/schedule/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Content Batch
  const handleAddContentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentModelId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: contentModelId,
          title: contentTitle || undefined,
          theme: contentTheme || undefined,
          notes: contentNotes || undefined,
          fileUrl: contentUrl || undefined,
          type: contentType,
          explicitLevel: contentLevel,
          count: contentCount,
        }),
      });

      if (res.ok) {
        setIsAddContentOpen(false);
        setContentTitle("");
        setContentNotes("");
        setContentUrl("");
        setContentCount(1);
        setUnusedCount((prev) => prev + contentCount);
        alert(`${contentCount} Content-Elemente erfolgreich im Vorrat angelegt!`);
      } else {
        const data = await res.json();
        alert(data.error || "Fehler beim Erstellen");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Auto-Plan
  const handleAutoPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/schedule/auto-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: planModelId,
          startDate: planStartDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Erzeugen");

      alert(data.message || "Zeitplan erfolgreich erzeugt!");
      setIsAutoPlanOpen(false);

      // Refresh posts
      const refreshRes = await fetch("/api/schedule/posts");
      if (refreshRes.ok) {
        const refreshedPosts = await refreshRes.json();
        setPosts(refreshedPosts);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <CalendarClock className="h-7 w-7 text-primary" />
            {t.schedule.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.schedule.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setIsAddContentOpen(true)}
            variant="outline"
            className="gap-1.5 text-xs h-9"
          >
            <Plus className="h-4 w-4" />
            {t.schedule.addContent}
          </Button>

          <Button
            onClick={() => setIsAutoPlanOpen(true)}
            className="gap-1.5 text-xs h-9 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md hover:from-purple-500 hover:to-indigo-500"
          >
            <Sparkles className="h-4 w-4" />
            {t.schedule.generateAutoPlan}
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pending Card */}
        <Card className={cn(
          "border-border transition-all",
          stats.pending > 0 ? "border-amber-500/50 bg-amber-950/10" : ""
        )}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <AlertCircle className={cn("h-3.5 w-3.5", stats.pending > 0 ? "text-amber-400 animate-pulse" : "text-muted-foreground")} />
                {t.schedule.duePendingCard}
              </div>
              <div className="text-2xl font-black mt-1 text-foreground">
                {stats.pending}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t.schedule.actionRequired}
              </div>
            </div>
            {stats.pending > 0 && (
              <Badge variant="warning" className="animate-pulse">
                {stats.pending} {language === "de" ? "fällig" : "due"}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Card */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                {t.schedule.scheduledFutureCard}
              </div>
              <div className="text-2xl font-black mt-1 text-foreground">
                {stats.scheduled}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t.schedule.inQueue}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today Posted Card */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {selectedModelId === "ALL" ? t.schedule.todayPostedTotal : t.schedule.todayPostings}
              </div>
              <div className="text-2xl font-black mt-1 text-foreground">
                {stats.publishedToday}
                {selectedModelId !== "ALL" && (
                  <span className="text-xs font-normal text-muted-foreground ml-1.5">/ max. 2</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {selectedModelId === "ALL"
                  ? t.schedule.dailyCapNotice
                  : t.schedule.dailyCapForChannel}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unused Content Pool Card */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-400" />
                {t.schedule.contentPoolCard}
              </div>
              <div className="text-2xl font-black mt-1 text-foreground">
                {unusedCount}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t.schedule.unusedMediaUnits}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Model Filter */}
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm"
            >
              <option value="ALL">{t.schedule.allModels}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.channelTitle || m.telegramChannelId})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <div className="flex rounded-md border border-border bg-card p-0.5 text-xs">
              {[
                { id: "ALL", label: t.schedule.filterAll },
                { id: "PENDING", label: t.schedule.filterPending },
                { id: "SCHEDULED", label: t.schedule.filterScheduled },
                { id: "PUBLISHED", label: t.schedule.filterPublished },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={cn(
                    "px-2.5 py-1 rounded font-medium transition-colors",
                    selectedStatus === tab.id
                      ? "bg-primary/20 text-primary font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t.schedule.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notice Banner */}
      <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs flex items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4 text-primary shrink-0" />
        <span>{t.schedule.pendingNotice}</span>
      </div>

      {/* Postings Feed / Cards */}
      <div className="space-y-3">
        {filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <CalendarClock className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-semibold text-sm">{t.schedule.noPostsFound}</p>
              <p className="text-xs mt-1">{t.schedule.noPostsDesc}</p>
            </CardContent>
          </Card>
        ) : (
          filteredPosts.map((post) => {
            const effectiveStatus = getPostStatus(post);
            const isPending = effectiveStatus === "PENDING";
            const isPublished = effectiveStatus === "PUBLISHED";
            const targetDate = new Date(post.scheduledFor);

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
                          {t.schedule.dueBadge} ({language === "de" ? "Seit" : "Since"} {formatDistanceToNow(targetDate, { locale: dateLocale })})
                        </Badge>
                      ) : isPublished ? (
                        <Badge variant="success" className="gap-1 text-xs py-1 px-2.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t.schedule.publishedBadge}
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
                          ⭐ {post.starsPrice} {t.schedule.starsPaywall}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {t.schedule.freeTeaser}
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
                          onClick={() => handleCopy(post.caption, post.id)}
                        >
                          {copiedId === post.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">{t.schedule.copied}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>{t.schedule.copyCaption}</span>
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="p-3 rounded-lg bg-card/60 border font-mono text-xs whitespace-pre-wrap leading-relaxed">
                        {post.caption}
                      </div>
                    </div>

                    {/* Media Reference / Meta Info (1 column) */}
                    <div className="p-3 rounded-lg bg-muted/20 border space-y-2 text-xs flex flex-col justify-between">
                      <div className="space-y-1">
                        <span className="font-semibold text-muted-foreground block">{t.schedule.assignedMedia}</span>
                        {post.asset ? (
                          <>
                            <div className="font-bold text-foreground">{post.asset.title || (language === "de" ? "Foto/Video" : "Photo/Video")}</div>
                            <div className="text-[11px] text-muted-foreground">{language === "de" ? "Thema" : "Theme"}: {post.asset.theme || (language === "de" ? "Allgemein" : "General")}</div>
                            <div className="text-[11px] text-muted-foreground">Level: {post.asset.explicitLevel}</div>
                            {post.asset.fileUrl && (
                              <a
                                href={post.asset.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 mt-1 truncate"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {t.schedule.openFileLink}
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">{t.schedule.noAssetLinked}</span>
                        )}
                      </div>

                      <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                        {t.schedule.scheduledAt} {format(targetDate, language === "de" ? "EEEE, dd. MMMM yyyy • HH:mm 'Uhr'" : "EEEE, MMMM dd, yyyy • HH:mm", { locale: dateLocale })}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePost(post.id)}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.schedule.deleteButton}
                    </Button>

                    <div className="flex items-center gap-2">
                      {isPublished ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevert(post.id)}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          {t.schedule.undoButton}
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleCheckOff(post.id)}
                          className={cn(
                            "h-8 text-xs font-bold gap-1.5 text-white shadow-sm",
                            isPending
                              ? "bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-500/50"
                              : "bg-emerald-700 hover:bg-emerald-600"
                          )}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t.schedule.checkOffButton}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal 1: Content erfassen (mit Stückzahl) */}
      <Dialog open={isAddContentOpen} onOpenChange={setIsAddContentOpen}>
        <DialogContent className="max-w-lg" onClose={() => setIsAddContentOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <DialogTitle>{t.schedule.addContentModalTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.schedule.addContentModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddContentSubmit} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.selectModelLabel}</label>
              <select
                value={contentModelId}
                onChange={(e) => setContentModelId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.channelTitle || m.telegramChannelId})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.mediaTypeLabel}</label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs"
                >
                  <option value="PHOTO">{language === "de" ? "📷 Foto" : "📷 Photo"}</option>
                  <option value="VIDEO">{language === "de" ? "🎬 Video" : "🎬 Video"}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.explicitLabel}</label>
                <select
                  value={contentLevel}
                  onChange={(e) => setContentLevel(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs"
                >
                  <option value="TEASER">TEASER ({language === "de" ? "Kostenlos" : "Free"})</option>
                  <option value="SOFT">SOFT (Promo / 15 ⭐)</option>
                  <option value="PPV">PPV ({t.schedule.starsPaywall} / 50 ⭐)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.titleLabel}</label>
                <Input
                  value={contentTitle}
                  onChange={(e) => setContentTitle(e.target.value)}
                  placeholder={t.schedule.titlePlaceholder}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.countLabel}</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={contentCount}
                  onChange={(e) => setContentCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="text-xs h-9 text-center font-bold"
                />
              </div>
            </div>

            {contentCount > 1 && (
              <p className="text-[11px] text-purple-400 font-medium">
                {language === "de"
                  ? `⚡ Erstellt automatisch ${contentCount} durchnummerierte Content-Slots (${contentTitle || "Medium"} #1 bis #${contentCount}).`
                  : `⚡ Automatically creates ${contentCount} numbered content slots (${contentTitle || "Media"} #1 to #${contentCount}).`}
              </p>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.themeLabel}</label>
              <Input
                value={contentTheme}
                onChange={(e) => setContentTheme(e.target.value)}
                placeholder={t.schedule.themePlaceholder}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.notesLabel}</label>
              <Input
                value={contentNotes}
                onChange={(e) => setContentNotes(e.target.value)}
                placeholder={t.schedule.notesPlaceholder}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.urlLabel}</label>
              <Input
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                placeholder={t.schedule.urlPlaceholder}
                className="text-xs h-9"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? t.schedule.submittingContent : `${contentCount} ${t.schedule.submitAddContent}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Intelligenten Zeitplan erzeugen */}
      <Dialog open={isAutoPlanOpen} onOpenChange={setIsAutoPlanOpen}>
        <DialogContent className="max-w-lg" onClose={() => setIsAutoPlanOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <DialogTitle>{t.schedule.autoPlanModalTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.schedule.autoPlanModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAutoPlanSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.selectModelLabel}</label>
              <select
                value={planModelId}
                onChange={(e) => setPlanModelId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs"
              >
                <option value="ALL">{t.schedule.allModelsOption}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m._count?.assets || 0} {t.schedule.availableMediaSuffix})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t.schedule.startDateLabel}</label>
              <Input
                type="date"
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                className="text-xs h-9"
              />
              <span className="text-[11px] text-muted-foreground mt-0.5 block">{t.schedule.startDateHint}</span>
            </div>

            {/* Smart Pacing Rules Box */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs space-y-1.5">
              <span className="font-semibold text-purple-300 block flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {t.schedule.smartRulesTitle}
              </span>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                <li>{t.schedule.rule1}</li>
                <li>{t.schedule.rule2}</li>
                <li>{t.schedule.rule3}</li>
                <li>{t.schedule.rule4}</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600">
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.schedule.generatingSubmitButton}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t.schedule.generateSubmitButton}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
