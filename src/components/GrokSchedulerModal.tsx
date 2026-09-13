"use client";

import React, { useState } from "react";
import { Sparkles, Calendar, Clock, Star, CheckCircle2, AlertCircle, RefreshCw, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ScheduleItem } from "@/lib/grok";

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
  const [days, setDays] = useState<number>(30);
  const [postsPerDay, setPostsPerDay] = useState<number>(1);
  const [tone, setTone] = useState<string>("Alluring, playful, engaging German VIP creator");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<ScheduleItem[]>([]);
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate schedule");
      }

      const data = await res.json();
      setGeneratedSchedule(data.schedule || []);
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
              <DialogTitle>xAI Grok Content & Posting Scheduler</DialogTitle>
              <DialogDescription>
                AI-driven content timetable, captions & Stars monetization pricing for {modelName}
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
                  Planungszeitraum (Dauer in Tagen)
                </label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant={days === 14 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setDays(14)}
                  >
                    14 Tage
                  </Button>
                  <Button
                    type="button"
                    variant={days === 30 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2 font-bold"
                    onClick={() => setDays(30)}
                  >
                    1 Monat (30 Tage)
                  </Button>
                  <Button
                    type="button"
                    variant={days === 60 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2 font-bold"
                    onClick={() => setDays(60)}
                  >
                    2 Monate (60 Tage)
                  </Button>
                  <Button
                    type="button"
                    variant={days === 90 ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setDays(90)}
                  >
                    3 Monate (90 Tage)
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    Exakte Tage (1 - 120 Tage)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
                  />
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    Posting-Frequenz
                  </label>
                  <select
                    value={postsPerDay}
                    onChange={(e) => setPostsPerDay(parseInt(e.target.value, 10) || 1)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                  >
                    <option value={1} className="bg-card">1 Post täglich (Fokus Qualität)</option>
                    <option value={2} className="bg-card">2 Posts täglich (Teaser + PPV)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    Verfügbarer Content-Bestand
                  </label>
                  <div className="h-9 px-3 border rounded-md bg-muted/30 text-xs flex items-center justify-between">
                    <span className="font-semibold">{availableAssets.length} Medien</span>
                    <div className="flex gap-1">
                      <Badge variant="teaser" className="text-[10px] px-1 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "TEASER").length} T
                      </Badge>
                      <Badge variant="soft" className="text-[10px] px-1 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "SOFT").length} S
                      </Badge>
                      <Badge variant="ppv" className="text-[10px] px-1 py-0">
                        {availableAssets.filter((a) => a.explicitLevel === "PPV").length} PPV
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Runway Calculation Bar */}
              <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs flex items-center justify-between">
                <span className="text-purple-300">
                  🎯 Content-Reichweite: <strong>{availableAssets.length} Unikate</strong> reichen bei <strong>{postsPerDay} Post(s)/Tag</strong> für ca. <strong>{Math.ceil(availableAssets.length / postsPerDay)} Tage</strong> autarken Betrieb ohne Upload.
                </span>
                {Math.ceil(availableAssets.length / postsPerDay) < days && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
                    Smart Rotation aktiv
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Model Tone & Content Directives
              </label>
              <Input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Flirty, natural, seductive German influencer"
              />
            </div>

            <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Langzeit-Strategie & Monetarisierungs-Regeln:</p>
              <p>• TEASER (Free / 0 Stars): Tägliche Bindung und Interaktion in den Stories/Posts.</p>
              <p>• PPV (Stars Paywall): Dynamische Taktung von 50 bis 500 Stars für exklusive Sets & Videos.</p>
              <p>• Zeitplan reicht über {days} Tage ({Math.round(days / 30 * 10) / 10} Monate) für stabilen, langfristigen Kanalbetrieb.</p>
            </div>
          </div>
        ) : (
          /* Preview Generated Schedule */
          <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Generated {generatedSchedule.length} posts for schedule:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-purple-400 gap-1"
                onClick={() => setGeneratedSchedule([])}
              >
                <RefreshCw className="h-3 w-3" />
                Reset / Adjust Parameters
              </Button>
            </div>

            {generatedSchedule.map((item, idx) => {
              const asset = getAssetById(item.assetId);
              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-card/60 flex items-start gap-3 hover:border-purple-500/40 transition-colors"
                >
                  {/* Asset thumbnail or Metadata Badge */}
                  <div className="h-16 w-16 rounded-md bg-muted overflow-hidden shrink-0 border flex flex-col items-center justify-center p-1 text-center">
                    {asset?.fileUrl ? (
                      <img
                        src={asset.fileUrl}
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
                        Day +{item.timeOffsetDays}
                      </span>
                      <span className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {item.timeOfDay}
                      </span>
                      {item.starsPrice > 0 ? (
                        <Badge variant="ppv" className="text-[10px] gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {item.starsPrice} Stars Paywall
                        </Badge>
                      ) : (
                        <Badge variant="teaser" className="text-[10px]">
                          Free Post
                        </Badge>
                      )}
                      {asset?.explicitLevel && (
                        <Badge variant="outline" className="text-[10px]">
                          {asset.explicitLevel}
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
                  Generating Posting Strategy via Grok...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Schedule via xAI Grok
                </>
              )}
            </Button>
          ) : (
            <div className="flex gap-2 w-full justify-end">
              <Button
                variant="outline"
                onClick={() => setGeneratedSchedule([])}
                disabled={isPublishing}
              >
                Back
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
                    Enqueuing into BullMQ...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm & Enqueue {generatedSchedule.length} Posts
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
