"use client";

import React, { useState } from "react";
import { Sparkles, Calendar, Clock, Star, CheckCircle2, AlertCircle, RefreshCw, Send, Coffee } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ScheduleItem, SchedulingStrategy, ScheduleStats } from "@/lib/grok";
import { useLanguage } from "@/context/LanguageContext";
import { getMediaDisplayUrl } from "@/lib/utils";

interface Asset {
  id: string;
  title?: string | null;
  theme?: string | null;
  notes?: string | null;
  fileUrl?: string | null;
  type: "PHOTO" | "VIDEO" | "TEXT";
  explicitLevel: "TEASER" | "SOFT" | "PPV";
  tags: string[];
  isUsed: boolean;
}

interface GrokSchedulerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  channelTitle?: string | null;
  availableAssets: Asset[];
  onScheduleCreated?: () => void;
}

export function GrokSchedulerModal({
  open,
  onOpenChange,
  modelId,
  modelName,
  channelTitle,
  availableAssets,
  onScheduleCreated,
}: GrokSchedulerModalProps) {
  const { t, language } = useLanguage();
  const [days, setDays] = useState<number>(30);
  const [strategy, setStrategy] = useState<SchedulingStrategy>("REALISTIC");
  const [allowPauseDays, setAllowPauseDays] = useState<boolean>(true);
  const [postsPerDay, setPostsPerDay] = useState<number>(1);
  const [tone, setTone] = useState<string>("Alluring, playful, engaging German VIP creator");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<ScheduleItem[]>([]);
  const [stats, setStats] = useState<ScheduleStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          modelName,
          channelTitle,
          targetDays: days,
          strategy,
          allowPauseDays,
          postsPerDay,
          modelTone: tone,
          availableAssets: availableAssets.map((a) => ({
            id: a.id,
            title: a.title,
            theme: a.theme,
            notes: a.notes,
            type: a.type,
            explicitLevel: a.explicitLevel,
            tags: a.tags,
          })),
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        if (res.status === 520 || res.status === 504 || res.status === 524) {
          throw new Error(
            language === "de"
              ? `Gateway/Proxy Timeout (${res.status}). Die Anfrage hat das Zeitlimit überschritten. Bitte erneut versuchen.`
              : `Gateway/Proxy Timeout (${res.status}). The request timed out. Please try again.`
          );
        }
        throw new Error(
          language === "de"
            ? `Server-Antwort war kein gültiges JSON (${res.status}). Bitte erneut versuchen.`
            : `Invalid server response (${res.status}). Please try again.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate schedule");
      }

      setGeneratedSchedule(data.schedule || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate schedule");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePosts = async () => {
    if (generatedSchedule.length === 0) return;
    setIsPublishing(true);
    try {
      const res = await fetch("/api/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          posts: generatedSchedule,
        }),
      });

      if (!res.ok) throw new Error("Failed to save scheduled posts");

      onOpenChange(false);
      setGeneratedSchedule([]);
      setStats(null);
      if (onScheduleCreated) onScheduleCreated();
    } catch (err: any) {
      setError(err.message || "Failed to batch save scheduled posts");
    } finally {
      setIsPublishing(false);
    }
  };

  const getAssetById = (id: string) => availableAssets.find((a) => a.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.grokScheduler.title}</DialogTitle>
              <DialogDescription>
                {t.grokScheduler.desc} ({modelName})
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

        {generatedSchedule.length === 0 ? (
          <div className="space-y-4 py-2">
            {/* Multi-month Duration & Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground block">
                  {t.grokScheduler.daysLabel}
                </label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant={days === 14 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setDays(14)}
                  >
                    14 {language === "de" ? "Tage" : "Days"}
                  </Button>
                  <Button
                    type="button"
                    variant={days === 30 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2 font-bold"
                    onClick={() => setDays(30)}
                  >
                    30 {language === "de" ? "Tage" : "Days"}
                  </Button>
                  <Button
                    type="button"
                    variant={days === 60 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2 font-bold"
                    onClick={() => setDays(60)}
                  >
                    60 {language === "de" ? "Tage" : "Days"}
                  </Button>
                  <Button
                    type="button"
                    variant={days === 90 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setDays(90)}
                  >
                    90 {language === "de" ? "Tage" : "Days"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    {t.grokScheduler.strategyLabel}
                  </label>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as SchedulingStrategy)}
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                  >
                    <option value="REALISTIC">{t.grokScheduler.strategyRealistic}</option>
                    <option value="VARIABLE_1_2">{t.grokScheduler.strategyVariable}</option>
                    <option value="FIXED_1">{t.grokScheduler.strategyFixed1}</option>
                    <option value="FIXED_2">{t.grokScheduler.strategyFixed2}</option>
                    <option value="RELAXED">{t.grokScheduler.strategyRelaxed}</option>
                  </select>
                  {strategy === "REALISTIC" && (
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {t.grokScheduler.strategyRealisticDesc}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    {t.grokScheduler.availableMediaLabel}
                  </label>
                  <div className="h-9 px-3 border rounded-md bg-muted/30 text-xs flex items-center justify-between">
                    <span className="font-semibold">{availableAssets.length} {language === "de" ? "Medien im Pool" : "Media in Pool"}</span>
                    <div className="flex gap-1">
                      <Badge variant="teaser" className="text-[10px] px-1.5 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "TEASER").length} Teaser
                      </Badge>
                      <Badge variant="soft" className="text-[10px] px-1.5 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "SOFT").length} Soft
                      </Badge>
                      <Badge variant="ppv" className="text-[10px] px-1.5 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "PPV").length} PPV
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    {language === "de" ? "Exakte Tage (1 - 120 Tage)" : "Exact Days (1 - 120 Days)"}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer w-full mt-3 sm:mt-0">
                    <input
                      type="checkbox"
                      checked={allowPauseDays}
                      onChange={(e) => setAllowPauseDays(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-medium block text-foreground">
                        {language === "de" ? "Pausentage erlauben (0 Posts)" : "Allow Pause Days (0 Posts)"}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {language === "de" ? "Natürliche Ruhetage wie bei echten Models" : "Natural rest days like real models"}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.grokScheduler.toneLabel}
              </label>
              <Input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Flirty, natural, seductive German influencer"
              />
            </div>
          </div>
        ) : (
          /* Preview Generated Schedule */
          <div className="space-y-3 py-2 max-h-[55vh] overflow-y-auto pr-1">
            {/* Stats Summary Overview */}
            {stats && (
              <div className="p-3 rounded-lg border bg-card/80 space-y-2.5 border-purple-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    {t.grokScheduler.statsOverview}
                  </span>
                  <Badge variant="outline" className="text-[10px] gap-1 text-purple-400 border-purple-500/30">
                    <Sparkles className="h-3 w-3" />
                    {stats.totalDays} {language === "de" ? "Tage geplant" : "Days scheduled"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2 rounded bg-muted/40 text-center">
                    <span className="text-base font-bold text-foreground block">{stats.totalPosts}</span>
                    <span className="text-[10px] text-muted-foreground">{t.grokScheduler.statsPosts}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/40 text-center">
                    <span className="text-base font-bold text-amber-500 block">{stats.pauseDays}</span>
                    <span className="text-[10px] text-muted-foreground">{t.grokScheduler.statsPauseDays}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/40 text-center">
                    <span className="text-base font-bold text-blue-500 block">{stats.daysWithOnePost}</span>
                    <span className="text-[10px] text-muted-foreground">{t.grokScheduler.statsOnePost}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/40 text-center">
                    <span className="text-base font-bold text-purple-500 block">{stats.daysWithTwoPosts}</span>
                    <span className="text-[10px] text-muted-foreground">{t.grokScheduler.statsTwoPosts}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1.5 border-t text-[11px] text-muted-foreground justify-between">
                  <span>Content-Mix:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="teaser" className="text-[10px]">{stats.teaserCount} Teaser (Free)</Badge>
                    <Badge variant="soft" className="text-[10px]">{stats.softCount} Soft</Badge>
                    <Badge variant="ppv" className="text-[10px]">{stats.ppvCount} VIP PPV (Stars)</Badge>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.grokScheduler.previewTitle} ({generatedSchedule.length} Posts):</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-purple-400 gap-1"
                onClick={() => {
                  setGeneratedSchedule([]);
                  setStats(null);
                }}
              >
                <RefreshCw className="h-3 w-3" />
                {language === "de" ? "Zurück / Parameter anpassen" : "Reset / Adjust Parameters"}
              </Button>
            </div>

            {generatedSchedule.map((item, idx) => {
              const asset = getAssetById(item.assetId);
              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-card/60 flex items-start gap-3 hover:border-purple-500/40 transition-colors"
                >
                  <div className="h-16 w-16 rounded-md bg-muted overflow-hidden shrink-0 border flex flex-col items-center justify-center p-1 text-center">
                    {asset?.fileUrl ? (
                      <img
                        src={getMediaDisplayUrl(asset.fileUrl, asset.id)}
                        alt="Asset"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider block text-primary">
                          {asset?.type || "MEDIA"}
                        </span>
                        <span className="text-[9px] text-muted-foreground line-clamp-2">
                          {asset?.theme || asset?.title || "Inventar"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold truncate text-foreground">
                        {asset?.title || `Asset ${item.assetId.slice(0, 8)}`}
                      </span>
                      {asset?.theme && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {asset.theme}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {language === "de" ? "Tag" : "Day"} +{item.timeOffsetDays}
                      </span>
                      <span className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {item.timeOfDay}
                      </span>
                      {item.starsPrice > 0 ? (
                        <Badge variant="ppv" className="text-[10px] gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {item.starsPrice} Stars
                        </Badge>
                      ) : (
                        <Badge variant="teaser" className="text-[10px]">
                          {t.modelDetail.freeBadge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 italic">
                      "{item.caption}"
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          {generatedSchedule.length === 0 ? (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || availableAssets.length === 0}
              variant="gradient"
              className="gap-2 w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t.grokScheduler.generatingButton}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t.grokScheduler.generateButton}
                </>
              )}
            </Button>
          ) : (
            <div className="flex gap-2 w-full justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setGeneratedSchedule([]);
                  setStats(null);
                }}
                disabled={isPublishing}
              >
                {t.common.back}
              </Button>
              <Button
                variant="gradient"
                onClick={handleSavePosts}
                disabled={isPublishing}
                className="gap-2"
              >
                {isPublishing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.grokScheduler.savingButton}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t.grokScheduler.saveButton} ({generatedSchedule.length} Posts)
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
