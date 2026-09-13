"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowRight,
  RefreshCw,
  Users,
  Tv,
  Radio,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

interface TelegramDialog {
  id: string;
  title: string;
  username: string | null;
  isChannel: boolean;
  isGroup: boolean;
  type: "channel" | "group";
  participantsCount: number | null;
}

interface ModelsListClientProps {
  initialModels: any[];
}

export function ModelsListClient({ initialModels }: ModelsListClientProps) {
  const { t, language } = useLanguage();
  const [models, setModels] = useState(initialModels);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Telegram Channels/Groups Fetching
  const [telegramDialogs, setTelegramDialogs] = useState<TelegramDialog[]>([]);
  const [isLoadingDialogs, setIsLoadingDialogs] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManualFields, setShowManualFields] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [telegramChannelId, setTelegramChannelId] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [openInvestBalance, setOpenInvestBalance] = useState("0");

  const fetchTelegramDialogs = async () => {
    setIsLoadingDialogs(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/telegram/dialogs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Telegram channels");
      if (data.dialogs) {
        setTelegramDialogs(data.dialogs);
      }
    } catch (err: any) {
      console.error("[ModelsList] Error fetching telegram dialogs:", err);
      setDialogError(err.message || "Fehler beim Abrufen der Telegram-Kanäle");
    } finally {
      setIsLoadingDialogs(false);
    }
  };

  useEffect(() => {
    if (isModalOpen && telegramDialogs.length === 0) {
      fetchTelegramDialogs();
    }
  }, [isModalOpen]);

  const handleSelectDialog = (dialog: TelegramDialog) => {
    setSelectedDialogId(dialog.id);
    setTelegramChannelId(dialog.id);
    setChannelTitle(dialog.title + (dialog.username ? ` (${dialog.username})` : ""));

    // Suggest model name if empty
    if (!name.trim()) {
      setName(dialog.title);
      setSlug(
        dialog.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      );
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    );
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramChannelId || !name) {
      setSaveError(language === "de" ? "Bitte wählen Sie einen Kanal aus oder geben Sie eine ID an." : "Please select a channel or enter an ID.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          telegramChannelId,
          channelTitle,
          avatarUrl,
          openInvestBalance: parseFloat(openInvestBalance) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create model");
      }

      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || "Error creating model");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredDialogs = telegramDialogs.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) ||
      d.id.includes(q) ||
      (d.username && d.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.models.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.models.subtitle}
          </p>
        </div>

        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.models.addNew}
        </Button>
      </div>

      {/* Models Grid or Empty State */}
      {models.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Radio className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold mb-1">{t.models.emptyTitle}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {t.models.emptyDesc}
          </p>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 mx-auto">
            <Plus className="h-4 w-4" />
            {t.models.addNew}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {models.map((model) => {
            const { fin } = model;
            return (
              <Card
                key={model.id}
                className="border-border hover:border-primary/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border shrink-0">
                        {model.avatarUrl ? (
                          <img
                            src={model.avatarUrl}
                            alt={model.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-muted-foreground">
                            {model.name?.charAt(0) || "M"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold truncate">{model.name}</CardTitle>
                          {fin?.isRecouped ? (
                            <Badge variant="success" className="text-[10px] py-0 shrink-0">
                              50/50
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] py-0 shrink-0">
                              Recouping
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs font-mono truncate">
                          {model.channelTitle || model.telegramChannelId}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-1 text-xs">
                    {/* Recoupment meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t.models.recoupment}</span>
                        <span className="font-semibold text-foreground">
                          {formatUsd(fin?.recoupedUsd || 0)} / {formatUsd(fin?.totalInvestTargetUsd || 0)}
                        </span>
                      </div>
                      <Progress
                        value={fin?.recoupmentProgressPercent || 0}
                        className="h-1.5"
                        indicatorClassName={fin?.isRecouped ? "bg-emerald-500" : "bg-indigo-500"}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t text-muted-foreground">
                      <div>
                        <span>{t.models.locked21d}:</span>
                        <span className="font-bold text-amber-400 block text-sm">
                          {formatUsd(fin?.pipeline?.lockedPendingUsd || 0)}
                        </span>
                      </div>
                      <div>
                        <span>{t.models.liquidProfit}:</span>
                        <span className="font-bold text-emerald-400 block text-sm">
                          {formatUsd(fin?.pipeline?.availableForPayoutUsd || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="p-4 pt-0">
                  <Link href={`/models/${model.slug}`}>
                    <Button variant="outline" className="w-full text-xs gap-1.5">
                      {t.models.openCenter}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Register New Model Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onClose={() => setIsModalOpen(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              {t.models.dialogTitle}
            </DialogTitle>
            <DialogDescription>
              {t.models.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          {saveError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <form onSubmit={handleCreateModel} className="space-y-4">
            {/* Telegram Channel / Group Selection Box */}
            <div className="space-y-2 p-3.5 rounded-xl bg-muted/40 border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-indigo-400" />
                  {t.models.telegramSelectLabel}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fetchTelegramDialogs}
                  disabled={isLoadingDialogs}
                  className="h-6 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingDialogs ? "animate-spin text-primary" : ""}`} />
                  {t.models.telegramRefresh}
                </Button>
              </div>

              {/* Search filter for channels */}
              {telegramDialogs.length > 0 && (
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === "de" ? "Kanäle oder Gruppen filtern..." : "Filter channels or groups..."}
                    className="h-8 pl-8 text-xs bg-background"
                  />
                </div>
              )}

              {/* Channels List */}
              {isLoadingDialogs ? (
                <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  {t.models.telegramLoading}
                </div>
              ) : dialogError ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  <span>{dialogError}</span>
                </div>
              ) : telegramDialogs.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {language === "de"
                    ? "Keine Kanäle gefunden oder MTProto lädt noch. Bitte 'Aktualisieren' klicken."
                    : "No channels found. Please click 'Refresh'."}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/40">
                  {filteredDialogs.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      {language === "de" ? "Keine Treffer für den Suchbegriff." : "No matching channels found."}
                    </div>
                  ) : (
                    filteredDialogs.map((d) => {
                      const isSelected = selectedDialogId === d.id || telegramChannelId === d.id;
                      return (
                        <div
                          key={d.id}
                          onClick={() => handleSelectDialog(d)}
                          className={`p-2.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-all pt-2 ${
                            isSelected
                              ? "bg-primary/15 border border-primary/40 text-foreground font-semibold"
                              : "hover:bg-muted/70 text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                                d.isChannel
                                  ? "bg-indigo-500/20 text-indigo-400"
                                  : "bg-purple-500/20 text-purple-400"
                              }`}
                            >
                              {d.isChannel ? <Tv className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold truncate">{d.title}</span>
                                {d.username && (
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    {d.username}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono block">
                                ID: {d.id}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={d.isChannel ? "info" : "ppv"} className="text-[10px] py-0 px-1.5">
                              {d.isChannel ? t.models.telegramChannel : t.models.telegramGroup}
                            </Badge>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Model Name & Slug */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.modelNameLabel}
                </label>
                <Input
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t.models.modelNamePlaceholder}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.slugLabel}
                </label>
                <Input
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mia-sommer"
                />
              </div>
            </div>

            {/* Telegram Channel ID & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.channelIdLabel}
                </label>
                <Input
                  required
                  value={telegramChannelId}
                  onChange={(e) => {
                    setTelegramChannelId(e.target.value);
                    setSelectedDialogId(e.target.value);
                  }}
                  placeholder="-100..."
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.channelTitleLabel}
                </label>
                <Input
                  value={channelTitle}
                  onChange={(e) => setChannelTitle(e.target.value)}
                  placeholder="@channel_name"
                />
              </div>
            </div>

            {/* Avatar & Initial Invest */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.avatarLabel}
                </label>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.models.investBalanceLabel}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={openInvestBalance}
                  onChange={(e) => setOpenInvestBalance(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="submit" disabled={isSaving} className="w-full gap-2">
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.models.creating}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t.models.createButton}
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
