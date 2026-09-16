"use client";

import React, { useState, useEffect } from "react";
import { Tag, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { getMediaDisplayUrl } from "@/lib/utils";

interface ManualClassifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: {
    id: string;
    title?: string | null;
    theme?: string | null;
    explicitLevel: "TEASER" | "SOFT" | "PPV";
    tags: string[];
    notes?: string | null;
    fileUrl?: string | null;
    type: "PHOTO" | "VIDEO" | "TEXT";
  } | null;
  onClassified?: () => void;
}

export function ManualClassifyModal({
  open,
  onOpenChange,
  asset,
  onClassified,
}: ManualClassifyModalProps) {
  const { t, language } = useLanguage();

  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("Beach & Sun");
  const [explicitLevel, setExplicitLevel] = useState<"TEASER" | "SOFT" | "PPV">("TEASER");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGrokClassifying, setIsGrokClassifying] = useState(false);

  useEffect(() => {
    if (asset && open) {
      setTitle(asset.title || "");
      setTheme(asset.theme || "Beach & Sun");
      setExplicitLevel(asset.explicitLevel || "TEASER");
      setTags(asset.tags?.join(", ") || "");
      setNotes(asset.notes || "");
      setError(null);
    }
  }, [asset, open]);

  const isVideo = asset?.type === "VIDEO" || asset?.fileUrl?.match(/\.(mp4|mov|mkv|avi)$/i);

  const handleGrokClassify = async () => {
    if (!asset) return;
    setIsGrokClassifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/classify`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grok-Analyse fehlgeschlagen");

      if (data.classification) {
        setTitle(data.classification.title || "");
        setTheme(data.classification.theme || "VIP Exclusive");
        setExplicitLevel(data.classification.explicitLevel || (isVideo ? "PPV" : "TEASER"));
        setTags(data.classification.tags?.join(", ") || "");
        setNotes(
          `${data.classification.notes || ""} | Caption: "${data.classification.suggestedCaption || ""}" | Stars: ${data.classification.suggestedStarsPrice ?? (isVideo ? 25 : 0)}`
        );
      }
      if (onClassified) onClassified();
    } catch (err: any) {
      setError(err.message || "Grok-Analyse fehlgeschlagen");
    } finally {
      setIsGrokClassifying(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    setIsSaving(true);
    setError(null);

    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      const res = await fetch(`/api/assets/${asset.id}/classify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          theme: theme.trim(),
          explicitLevel,
          tags: parsedTags,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update classification");

      onOpenChange(false);
      if (onClassified) onClassified();
    } catch (err: any) {
      setError(err.message || "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.manualClassify.modalTitle}</DialogTitle>
              <DialogDescription>{t.manualClassify.modalDesc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3.5 py-1">
          {/* Media Mini-Preview */}
          <div className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-14 w-14 rounded bg-muted overflow-hidden shrink-0 border flex items-center justify-center">
                {asset?.fileUrl ? (
                  isVideo ? (
                    <video src={getMediaDisplayUrl(asset.fileUrl, asset.id)} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={getMediaDisplayUrl(asset.fileUrl, asset.id)} alt="Preview" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="text-[10px] font-bold text-muted-foreground">{asset?.type}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold truncate block text-foreground">
                  {asset?.title || asset?.fileUrl || "Medium"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {isVideo ? "🎬 Video (Thumbnail + Länge für Grok)" : "📷 Foto"}
                </span>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isGrokClassifying || isSaving}
              onClick={handleGrokClassify}
              className="gap-1.5 text-xs font-bold bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 shrink-0 shadow-sm"
              title={isVideo ? "Video per Thumbnail & Dauer von Grok bewerten lassen" : "Foto von Grok bewerten lassen"}
            >
              {isGrokClassifying ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              )}
              {isGrokClassifying
                ? (language === "de" ? "Grok analysiert..." : "Grok analyzing...")
                : "🤖 Grok AI"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.manualClassify.titleLabel}
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Sommerkleid Clip 01"
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.manualClassify.themeLabel}
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm"
              >
                <option value="Beach & Sun">Beach & Sun</option>
                <option value="Boudoir / Lingerie">Boudoir / Lingerie</option>
                <option value="VIP Exclusive">VIP Exclusive</option>
                <option value="Late Night Glamour">Late Night Glamour</option>
                <option value="Casual / Lifestyle">Casual / Lifestyle</option>
                <option value="Gym & Fitness">Gym & Fitness</option>
                <option value="Allgemein">Allgemein</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.manualClassify.levelLabel}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExplicitLevel("TEASER")}
                className={`p-2 rounded-md border text-xs font-bold transition-colors ${
                  explicitLevel === "TEASER"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : "border-border hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                TEASER (0 ⭐)
              </button>
              <button
                type="button"
                onClick={() => setExplicitLevel("SOFT")}
                className={`p-2 rounded-md border text-xs font-bold transition-colors ${
                  explicitLevel === "SOFT"
                    ? "bg-purple-500/20 border-purple-500 text-purple-400"
                    : "border-border hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                SOFT (15–35 ⭐)
              </button>
              <button
                type="button"
                onClick={() => setExplicitLevel("PPV")}
                className={`p-2 rounded-md border text-xs font-bold transition-colors ${
                  explicitLevel === "PPV"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400"
                    : "border-border hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                VIP PPV (Stars)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.manualClassify.tagsLabel}
            </label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="beach, bikini, video, vip"
              className="text-xs h-9"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t.manualClassify.notesLabel}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="z. B. Outfit, Pose, Caption-Vorschlag..."
              className="flex w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs shadow-sm font-mono"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t.manualClassify.savingButton}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {t.manualClassify.saveButton}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
