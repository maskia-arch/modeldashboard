"use client";

import React, { useState, useEffect } from "react";
import { Radio, Download, RefreshCw, CheckCircle2, AlertCircle, Trash2, ExternalLink, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";

interface SourceChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelSlug: string;
  modelName: string;
  onSyncCompleted?: () => void;
}

interface DialogItem {
  id: string;
  title: string;
  username?: string | null;
  type: string;
}

export function SourceChannelModal({
  open,
  onOpenChange,
  modelId,
  modelSlug,
  modelName,
  onSyncCompleted,
}: SourceChannelModalProps) {
  const { t, language } = useLanguage();

  const [currentSourceId, setCurrentSourceId] = useState<string>("");
  const [currentSourceTitle, setCurrentSourceTitle] = useState<string>("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [dialogs, setDialogs] = useState<DialogItem[]>([]);
  const [isLoadingDialogs, setIsLoadingDialogs] = useState<boolean>(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [customChannelInput, setCustomChannelInput] = useState<string>("");
  const [syncLimit, setSyncLimit] = useState<number>(50);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      loadSourceConfig();
      loadUserbotDialogs();
      setStatusMessage(null);
    }
  }, [open, modelSlug]);

  const loadSourceConfig = async () => {
    try {
      const res = await fetch(`/api/models/${modelSlug}/source`);
      if (res.ok) {
        const data = await res.json();
        if (data.source) {
          setCurrentSourceId(data.source.sourceChannelId || "");
          setCurrentSourceTitle(data.source.sourceChannelTitle || "");
          setLastSyncedAt(data.source.lastSyncedAt || null);
          setSelectedChannelId(data.source.sourceChannelId || "");
        } else {
          setCurrentSourceId("");
          setCurrentSourceTitle("");
          setLastSyncedAt(null);
        }
      }
    } catch (err) {
      console.error("Failed to load source channel config:", err);
    }
  };

  const loadUserbotDialogs = async () => {
    setIsLoadingDialogs(true);
    try {
      const res = await fetch("/api/telegram/dialogs");
      if (res.ok) {
        const data = await res.json();
        setDialogs(data.dialogs || []);
      }
    } catch (err) {
      console.error("Failed to load userbot dialogs:", err);
    } finally {
      setIsLoadingDialogs(false);
    }
  };

  const handleSaveSource = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const targetId = customChannelInput.trim() || selectedChannelId;
    let targetTitle = "";
    const matched = dialogs.find((d) => d.id === targetId || d.username === targetId);
    if (matched) targetTitle = matched.title;

    try {
      const res = await fetch(`/api/models/${modelSlug}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceChannelId: targetId,
          sourceChannelTitle: targetTitle,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      setCurrentSourceId(targetId);
      setCurrentSourceTitle(targetTitle);
      setStatusMessage({ type: "success", text: t.sourceChannel.saveButton + " ✓" });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Fehler beim Speichern" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSource = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/models/${modelSlug}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceChannelId: "" }),
      });
      if (res.ok) {
        setCurrentSourceId("");
        setCurrentSourceTitle("");
        setSelectedChannelId("");
        setCustomChannelInput("");
        setStatusMessage({ type: "success", text: "Quellkanal entfernt." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/models/${modelSlug}/source/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: syncLimit }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Synchronisierung fehlgeschlagen");

      setStatusMessage({
        type: "success",
        text: data.message || `${data.importedCount || 0} Medien erfolgreich heruntergeladen!`,
      });

      setLastSyncedAt(new Date().toISOString());
      if (onSyncCompleted) onSyncCompleted();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Fehler beim Herunterladen" });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.sourceChannel.modalTitle}</DialogTitle>
              <DialogDescription>
                {t.sourceChannel.modalDesc} ({modelName})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {statusMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                : "bg-destructive/15 border border-destructive/30 text-destructive"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="space-y-4 py-1">
          {/* Current Source Info Banner */}
          <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground block">
                {t.sourceChannel.currentSource}
              </span>
              <div className="flex items-center gap-2">
                {currentSourceId ? (
                  <>
                    <span className="text-sm font-bold text-foreground">
                      {currentSourceTitle || currentSourceId}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30">
                      ID: {currentSourceId}
                    </Badge>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    {t.sourceChannel.noSourceConfigured}
                  </span>
                )}
              </div>
              {lastSyncedAt && (
                <span className="text-[10px] text-muted-foreground block pt-0.5">
                  {t.sourceChannel.lastSynced} {new Date(lastSyncedAt).toLocaleString(language === "de" ? "de-DE" : "en-US")}
                </span>
              )}
            </div>

            {currentSourceId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveSource}
                disabled={isSaving || isSyncing}
                className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Dialogs Selection from Userbot */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground block">
              {t.sourceChannel.selectLabel}
            </label>
            <div className="max-h-36 overflow-y-auto space-y-1 border rounded-md p-1.5 bg-card/50">
              {isLoadingDialogs ? (
                <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Lade Kanäle des Userbots...</span>
                </div>
              ) : dialogs.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Keine Kanäle gefunden. Geben Sie die Kanal-ID unten manuell ein.
                </div>
              ) : (
                dialogs.map((d) => {
                  const isSelected = selectedChannelId === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => {
                        setSelectedChannelId(d.id);
                        setCustomChannelInput("");
                      }}
                      className={`p-2 rounded cursor-pointer text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 font-semibold"
                          : "hover:bg-muted/40 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Radio className={`h-3.5 w-3.5 ${isSelected ? "text-indigo-400" : "text-muted-foreground"}`} />
                        <span className="truncate">{d.title}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {d.id}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Manual Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground block">
              {t.sourceChannel.customChannelLabel}
            </label>
            <Input
              value={customChannelInput}
              onChange={(e) => {
                setCustomChannelInput(e.target.value);
                if (e.target.value) setSelectedChannelId("");
              }}
              placeholder={t.sourceChannel.customChannelPlaceholder}
              className="text-xs h-9 font-mono"
            />
          </div>

          {/* Sync Limit & Action */}
          {currentSourceId && (
            <div className="p-3 rounded-lg border bg-card/80 space-y-3 border-indigo-500/30">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  {t.sourceChannel.limitLabel}
                </label>
                <div className="flex items-center gap-1.5">
                  {[20, 50, 100].map((lim) => (
                    <Button
                      key={lim}
                      type="button"
                      variant={syncLimit === lim ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setSyncLimit(lim)}
                    >
                      {lim}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="w-full gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold h-9 shadow-md"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.sourceChannel.syncingButton}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    {t.sourceChannel.syncNowButton}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isSyncing}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="gradient"
            onClick={handleSaveSource}
            disabled={isSaving || isSyncing || (!selectedChannelId && !customChannelInput.trim())}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t.sourceChannel.savingButton}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {t.sourceChannel.saveButton}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
