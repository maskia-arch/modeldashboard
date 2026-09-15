"use client";

import React, { useState, useEffect } from "react";
import { Radio, Download, RefreshCw, CheckCircle2, AlertCircle, Trash2, ExternalLink, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

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
  const [classifyWithGrok, setClassifyWithGrok] = useState<boolean>(false);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
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
        const rawText = await res.text();
        try {
          const data = JSON.parse(rawText);
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
        } catch {}
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
        const rawText = await res.text();
        try {
          const data = JSON.parse(rawText);
          setDialogs(data.dialogs || []);
        } catch {}
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

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Ungültige Serverantwort (${res.status}): ${rawText.slice(0, 100)}`);
      }
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      setCurrentSourceId(targetId);
      setCurrentSourceTitle(targetTitle);
      setStatusMessage({
        type: "success",
        text: data.message || (t.sourceChannel.saveButton + " ✓"),
      });
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
    setSyncProgress(
      syncLimit === 0
        ? "Verbindung zum Quellkanal wird hergestellt (Modus: ALLE)..."
        : `Verbindung zum Quellkanal wird hergestellt (Ziel: ${syncLimit} Medien)...`
    );

    try {
      let currentOffset: number | undefined = undefined;
      let totalImported = 0;
      let totalSkipped = 0;
      let remainingLimit = syncLimit;
      let batchIndex = 1;

      while (true) {
        setSyncProgress(
          syncLimit === 0
            ? `📥 Stapel #${batchIndex}: Synchronisiere ALLE Medien (${totalImported} geladen, ${totalSkipped} übersprungen)...`
            : `📥 Stapel #${batchIndex}: Lade Medien (${totalImported}/${syncLimit} geladen, ${totalSkipped} übersprungen)...`
        );

        let data: any = null;
        let lastError: Error | null = null;

        // Auto-retry up to 2 times for transient network/proxy (520/504) blips
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(`/api/models/${modelSlug}/source/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                limit: syncLimit === 0 ? 0 : Math.max(1, remainingLimit),
                offsetId: currentOffset,
                classifyWithGrok,
              }),
            });

            const rawText = await res.text();
            try {
              data = JSON.parse(rawText);
            } catch {
              if (res.status === 520 || rawText.includes("520") || rawText.includes("Web server is returning an unknown error")) {
                throw new Error(
                  "Cloudflare-Verbindungsfehler (520): Die Verbindung zum Backend wurde kurzzeitig unterbrochen."
                );
              }
              if (res.status === 504 || rawText.includes("504") || rawText.includes("Gateway Timeout")) {
                throw new Error(
                  "Server-Gateway-Timeout (504): Die Telegram-Abfrage brauchte zu lange."
                );
              }
              throw new Error(`Serverfehler (${res.status}): Ungültige Serverantwort.`);
            }

            if (!res.ok || !data.success) {
              throw new Error(data.error || data.message || "Synchronisierung fehlgeschlagen");
            }

            lastError = null;
            break; // Success!
          } catch (err: any) {
            lastError = err;
            if (attempt < 3) {
              setSyncProgress(`⚠️ Kurze Pause vor erneutem Versuch (Versuch ${attempt + 1}/3)...`);
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }

        if (lastError || !data) {
          throw lastError || new Error("Synchronisierung fehlgeschlagen.");
        }

        totalImported += data.importedCount || 0;
        totalSkipped += data.skippedCount || 0;

        if (syncLimit > 0) {
          remainingLimit = Math.max(0, syncLimit - totalImported);
        }

        // Break if no more messages or target limit reached
        if (!data.hasMore || !data.nextOffsetId || (syncLimit > 0 && remainingLimit <= 0)) {
          break;
        }

        currentOffset = data.nextOffsetId;
        batchIndex++;
        // Gentle pause between batches to protect Telegram MTProto connection
        await new Promise((r) => setTimeout(r, 800));
      }

      let summary = "";
      if (totalImported === 0 && totalSkipped > 0) {
        summary = `Quellkanal ist aktuell: Keine neuen Medien gefunden (${totalSkipped} bereits im Dashboard vorhanden).`;
      } else if (totalImported > 0 && totalSkipped > 0) {
        summary = `Erfolg: ${totalImported} neue Medien heruntergeladen (${totalSkipped} bereits vorhandene übersprungen)!`;
      } else if (totalImported > 0) {
        summary = `Erfolg: ${totalImported} Medien erfolgreich auf die Festplatte gespeichert!`;
      } else {
        summary = "Keine neuen Medien im Quellkanal gefunden.";
      }

      setStatusMessage({
        type: "success",
        text: summary,
      });

      setLastSyncedAt(new Date().toISOString());
      if (onSyncCompleted) onSyncCompleted();
    } catch (err: any) {
      console.error("[SourceChannelModal] Sync error:", err);
      setStatusMessage({ type: "error", text: err.message || "Fehler beim Herunterladen" });
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
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

        {isSyncing && syncProgress && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 animate-pulse">
            <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-indigo-400" />
            <span className="font-medium">{syncProgress}</span>
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
            {currentSourceId && (customChannelInput.trim() === currentSourceId || selectedChannelId === currentSourceId) && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 pt-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {language === "de"
                  ? "Kanal bereits aktiv – erneutes Speichern bestätigt den Update-Modus (nur neuer Content wird geladen)."
                  : "Channel already active – saving confirms update mode (only new content will be imported)."}
              </p>
            )}
          </div>

          {/* Sync Limit & Action */}
          {currentSourceId && (
            <div className="p-3 rounded-lg border bg-card/80 space-y-3 border-indigo-500/30">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2 text-[11px] text-indigo-300">
                <RefreshCw className="h-3.5 w-3.5 shrink-0 text-indigo-400 mt-0.5" />
                <span>
                  {t.sourceChannel?.updateModeBanner || (language === "de"
                    ? "🔄 Update-Modus aktiv: Bereits importierte Inhalte werden übersprungen – nur neuer Content wird geladen."
                    : "🔄 Update Mode active: Existing items will be skipped – only new content is imported.")}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    {t.sourceChannel.limitLabel}
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[20, 50, 100, 0].map((lim) => (
                      <Button
                        key={lim}
                        type="button"
                        variant={syncLimit === lim ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-6 text-[11px] px-2.5 font-bold transition-all",
                          lim === 0
                            ? syncLimit === 0
                              ? "bg-purple-600 hover:bg-purple-500 text-white shadow-sm ring-1 ring-purple-400"
                              : "border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                            : ""
                        )}
                        onClick={() => setSyncLimit(lim)}
                      >
                        {lim === 0 ? (t.sourceChannel?.limitAll || (language === "de" ? "ALLE" : "ALL")) : lim}
                      </Button>
                    ))}
                  </div>
                </div>

                {syncLimit === 0 && (
                  <div className="p-2 rounded bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-300 flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>
                      {t.sourceChannel?.scanAllHint || (language === "de"
                        ? "Scannt den gesamten Kanal und importiert alle noch nicht vorhandenen Medien."
                        : "Scans the entire channel and imports all new media not yet present.")}
                    </span>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer pt-1 pb-1">
                <input
                  type="checkbox"
                  checked={classifyWithGrok}
                  onChange={(e) => setClassifyWithGrok(e.target.checked)}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  {language === "de"
                    ? "Fotos beim Import direkt mit Grok 4.1 Vision bewerten & klassifizieren"
                    : "Automatically classify photos with Grok 4.1 Vision upon download"}
                </span>
              </label>

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
                    {syncLimit === 0
                      ? (language === "de" ? "Alle neuen Medien aus Quellkanal ziehen (Update)" : "Pull all new media from source channel (Update)")
                      : (language === "de" ? "Neue Medien aus Quellkanal ziehen (Update)" : "Pull new media from source channel (Update)")}
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
