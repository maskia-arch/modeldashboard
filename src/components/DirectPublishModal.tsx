"use client";

import React, { useState, useEffect } from "react";
import { Send, Star, AlertCircle, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { getMediaDisplayUrl } from "@/lib/utils";

interface DirectPublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  channelTitle?: string | null;
  telegramChannelId?: string;
  asset?: {
    id: string;
    title?: string | null;
    theme?: string | null;
    fileUrl?: string | null;
    type: "PHOTO" | "VIDEO" | "TEXT";
    explicitLevel: "TEASER" | "SOFT" | "PPV";
    notes?: string | null;
  } | null;
  post?: {
    id: string;
    caption: string;
    starsPrice: number;
    asset?: {
      id: string;
      title?: string | null;
      theme?: string | null;
      fileUrl?: string | null;
      type: "PHOTO" | "VIDEO" | "TEXT";
    } | null;
  } | null;
  onPublished?: (updatedData?: { caption: string; starsPrice: number }) => void;
}

export function DirectPublishModal({
  open,
  onOpenChange,
  modelId,
  channelTitle,
  telegramChannelId,
  asset,
  post,
  onPublished,
}: DirectPublishModalProps) {
  const { t, language } = useLanguage();

  const [caption, setCaption] = useState<string>("");
  const [starsPrice, setStarsPrice] = useState<number>(0);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      if (post) {
        setCaption(post.caption || "");
        setStarsPrice(post.starsPrice || 0);
      } else if (asset) {
        // Check if notes contains suggested caption
        let initialCaption = "";
        let initialPrice = asset.explicitLevel === "PPV" ? 150 : (asset.explicitLevel === "SOFT" ? 25 : 0);

        if (asset.notes && asset.notes.includes('Caption: "')) {
          const match = asset.notes.match(/Caption: "([^"]+)"/);
          if (match && match[1]) initialCaption = match[1];
        }

        if (!initialCaption) {
          initialCaption = asset.explicitLevel === "PPV"
            ? `Exklusiver VIP Content für euch 🔥 ${asset.theme ? `[${asset.theme}] ` : ""}Schaltet das Video unten frei mit Telegram Stars! 🌟`
            : `Guten Morgen meine Lieben! 💕 Kleiner Gruß für euren Start in den Tag. Lasst mir gerne ein Like da ✨`;
        }

        setCaption(initialCaption);
        setStarsPrice(initialPrice);
      }
    }
  }, [open, asset, post]);

  const activeAsset = asset || post?.asset;
  const isVideo = activeAsset?.type === "VIDEO" || activeAsset?.fileUrl?.match(/\.(mp4|mov|mkv|avi)$/i);

  const handlePublish = async () => {
    if (!caption.trim()) {
      setError(language === "de" ? "Bitte geben Sie einen Begleittext ein." : "Please provide a caption.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const res = await fetch("/api/posts/publish-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          assetId: asset?.id,
          postId: post?.id,
          caption: caption.trim(),
          starsPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publishing failed");

      onOpenChange(false);
      if (onPublished) onPublished({ caption: caption.trim(), starsPrice });
    } catch (err: any) {
      setError(err.message || "Failed to publish post");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.directPublish.modalTitle}</DialogTitle>
              <DialogDescription>
                {channelTitle || telegramChannelId ? `Kanal: ${channelTitle || telegramChannelId}` : t.directPublish.modalDesc}
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

        <div className="space-y-4 py-1">
          {/* Media Preview & Meta */}
          <div className="p-3 rounded-lg border bg-card/60 flex items-start gap-3">
            <div className="h-20 w-20 rounded-md bg-muted overflow-hidden shrink-0 border flex items-center justify-center">
              {activeAsset?.fileUrl ? (
                isVideo ? (
                  <video
                    src={getMediaDisplayUrl(activeAsset.fileUrl, activeAsset.id)}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={getMediaDisplayUrl(activeAsset.fileUrl, activeAsset.id)}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {activeAsset?.type || "MEDIA"}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold truncate text-foreground">
                  {activeAsset?.title || "Ausgewähltes Medium"}
                </span>
                <Badge variant="outline" className="text-[9px] py-0">
                  {activeAsset?.type || "PHOTO"}
                </Badge>
              </div>

              {activeAsset?.theme && (
                <span className="text-[10px] text-muted-foreground block">
                  {language === "de" ? "Thema" : "Theme"}: {activeAsset.theme}
                </span>
              )}

              <div className="text-[11px] text-amber-400/90 font-medium pt-1">
                {t.directPublish.deleteNotice}
              </div>
            </div>
          </div>

          {/* Caption Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                {t.directPublish.captionLabel}
              </label>
              <span className="text-[10px] text-muted-foreground">
                {caption.length} / 1024
              </span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder={t.directPublish.captionPlaceholder}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono"
            />
          </div>

          {/* Stars Paywall Configuration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                {t.directPublish.starsPriceLabel}
              </label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={starsPrice === 0 ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setStarsPrice(0)}
                >
                  0 ⭐ ({t.modelDetail.freeBadge})
                </Button>
                <Button
                  type="button"
                  variant={starsPrice === 50 ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setStarsPrice(50)}
                >
                  50 ⭐
                </Button>
                <Button
                  type="button"
                  variant={starsPrice === 150 ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[11px] px-2 font-bold"
                  onClick={() => setStarsPrice(150)}
                >
                  150 ⭐
                </Button>
                <Button
                  type="button"
                  variant={starsPrice === 250 ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setStarsPrice(250)}
                >
                  250 ⭐
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Star className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <Input
                  type="number"
                  min={0}
                  max={5000}
                  value={starsPrice}
                  onChange={(e) => setStarsPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="pl-8 text-xs h-9 font-bold"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {starsPrice === 0 ? t.directPublish.starsFree : `${starsPrice} Telegram Stars Paywall`}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t.directPublish.starsPriceHint}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="gradient"
            onClick={handlePublish}
            disabled={isPublishing}
            className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            {isPublishing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t.directPublish.publishingButton}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {t.directPublish.publishButton}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
