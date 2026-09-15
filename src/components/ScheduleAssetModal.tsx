"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock, Star, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";

import { formatGermanDateInput, parseGermanDateTime } from "@/lib/timezone";
import { getFormatAwareDefaultCaption, sanitizeCaptionForMediaType } from "@/lib/captions";

interface ScheduleAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: {
    id: string;
    title?: string | null;
    theme?: string | null;
    fileUrl?: string | null;
    type: "PHOTO" | "VIDEO" | "TEXT";
    explicitLevel: "TEASER" | "SOFT" | "PPV";
    notes?: string | null;
  } | null;
  onScheduled?: () => void;
}

export function ScheduleAssetModal({
  open,
  onOpenChange,
  asset,
  onScheduled,
}: ScheduleAssetModalProps) {
  const { t, language } = useLanguage();

  const [dateStr, setDateStr] = useState<string>("");
  const [caption, setCaption] = useState<string>("");
  const [starsPrice, setStarsPrice] = useState<number>(0);
  const [isScheduling, setIsScheduling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (asset && open) {
      // Default to tomorrow 18:30 German time
      const tomorrow = new Date(Date.now() + 86400000);
      const datePart = formatGermanDateInput(tomorrow);
      setDateStr(`${datePart}T18:30`);

      let initialCaption = "";
      let initialPrice = asset.explicitLevel === "PPV" ? 150 : (asset.explicitLevel === "SOFT" ? 25 : 0);

      if (asset.notes && asset.notes.includes('Caption: "')) {
        const match = asset.notes.match(/Caption: "([^"]+)"/);
        if (match && match[1]) initialCaption = match[1];
      }

      if (!initialCaption) {
        initialCaption = getFormatAwareDefaultCaption(asset.type, asset.explicitLevel, asset.theme);
      } else {
        initialCaption = sanitizeCaptionForMediaType(initialCaption, asset.type);
      }

      setCaption(initialCaption);
      setStarsPrice(initialPrice);
      setError(null);
    }
  }, [asset, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !dateStr) return;
    setIsScheduling(true);
    setError(null);

    try {
      const [dPart, tPart] = dateStr.split("T");
      const scheduledFor = parseGermanDateTime(dPart, tPart || "18:30").toISOString();

      const res = await fetch(`/api/assets/${asset.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor,
          caption: caption.trim(),
          starsPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule post");

      onOpenChange(false);
      if (onScheduled) onScheduled();
    } catch (err: any) {
      setError(err.message || "Failed to schedule");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.scheduleAsset.modalTitle}</DialogTitle>
              <DialogDescription>{t.scheduleAsset.modalDesc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.scheduleAsset.dateLabel}
            </label>
            <Input
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="text-xs h-9"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.scheduleAsset.captionLabel}
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-sm font-mono"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.scheduleAsset.starsLabel}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Star className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <Input
                  type="number"
                  min={0}
                  value={starsPrice}
                  onChange={(e) => setStarsPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="pl-8 text-xs h-9"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {starsPrice === 0 ? "0 ⭐ (Free)" : `${starsPrice} Stars`}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isScheduling}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={isScheduling}
              className="gap-2"
            >
              {isScheduling ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t.scheduleAsset.schedulingButton}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {t.scheduleAsset.scheduleButton}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
