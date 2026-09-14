"use client";

import React, { useState, useEffect, useRef } from "react";

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      if (res.status === 504) {
        throw new Error("Gateway Timeout (504): Die Server-Verbindung hat das Zeitlimit überschritten.");
      }
      if (res.status === 502) {
        throw new Error("Bad Gateway (502): Der Server konnte die Anfrage nicht verarbeiten.");
      }
      throw new Error(`Serverfehler (${res.status}): ${res.statusText || "Ungültige Serverantwort"}`);
    }
    throw new Error("Ungültige Antwort vom Server erhalten.");
  }
}
import {
  Sparkles,
  Wallet,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  TrendingUp,
  Lock,
  RefreshCw,
  Plus,
  Send,
  Star,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Trash2,
  Sliders,
  Percent,
  Users,
  UploadCloud,
  Radio,
  HardDrive,
  Minimize2,
  Maximize2,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PipelineOverview } from "@/components/PipelineOverview";
import { GrokSchedulerModal } from "@/components/GrokSchedulerModal";
import { PayoutModal } from "@/components/PayoutModal";
import { ContentUploadModal } from "@/components/ContentUploadModal";
import { DirectPublishModal } from "@/components/DirectPublishModal";
import { ManualClassifyModal } from "@/components/ManualClassifyModal";
import { ScheduleAssetModal } from "@/components/ScheduleAssetModal";
import { SourceChannelModal } from "@/components/SourceChannelModal";
import { formatUsd, formatStars, truncateAddress, getMediaDisplayUrl } from "@/lib/utils";
import type { ModelFinancials } from "@/lib/financial-engine";
import { format, formatDistanceToNow } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";

interface InvestorItem {
  id: string;
  name: string | null;
  email: string | null;
}

interface ModelDetailClientProps {
  initialModel: any;
  initialFinancials: ModelFinancials;
  investors?: InvestorItem[];
  isMasterAdmin?: boolean;
}

function getTierBadgeInfo(tags: string[] = []) {
  const t = tags.map((x: string) => x.toLowerCase());
  if (t.includes("tier5") || t.includes("explizit")) {
    return { label: "Tier 5: Explizit", className: "bg-red-500/25 text-red-300 border-red-500/50" };
  }
  if (t.includes("tier4") || t.includes("vollakt")) {
    return { label: "Tier 4: Vollakt", className: "bg-rose-500/25 text-rose-300 border-rose-500/50" };
  }
  if (t.includes("tier3") || t.includes("teilakt") || t.includes("topless")) {
    return { label: "Tier 3: Teilakt", className: "bg-purple-500/25 text-purple-300 border-purple-500/50" };
  }
  if (t.includes("tier2") || t.includes("lingerie")) {
    return { label: "Tier 2: Lingerie", className: "bg-pink-500/25 text-pink-300 border-pink-500/50" };
  }
  if (t.includes("tier1") || t.includes("bademode")) {
    return { label: "Tier 1: Bademode", className: "bg-cyan-500/25 text-cyan-300 border-cyan-500/50" };
  }
  if (t.includes("tier0") || t.includes("sfw")) {
    return { label: "Tier 0: SFW", className: "bg-blue-500/25 text-blue-300 border-blue-500/50" };
  }
  return null;
}

export function ModelDetailClient({
  initialModel,
  initialFinancials,
  investors = [],
  isMasterAdmin = false,
}: ModelDetailClientProps) {
  const { t, language } = useLanguage();
  const [model, setModel] = useState(initialModel);
  const [financials, setFinancials] = useState<ModelFinancials>(initialFinancials);
  const [isGrokModalOpen, setIsGrokModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isBatchAssetModalOpen, setIsBatchAssetModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isContentUploadOpen, setIsContentUploadOpen] = useState(false);
  const [isDirectPublishOpen, setIsDirectPublishOpen] = useState(false);
  const [isManualClassifyOpen, setIsManualClassifyOpen] = useState(false);
  const [isScheduleAssetOpen, setIsScheduleAssetOpen] = useState(false);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [selectedAssetForPublish, setSelectedAssetForPublish] = useState<any>(null);
  const [selectedPostForPublish, setSelectedPostForPublish] = useState<any>(null);
  const [selectedAssetForClassify, setSelectedAssetForClassify] = useState<any>(null);
  const [selectedAssetForSchedule, setSelectedAssetForSchedule] = useState<any>(null);

  // Assign / Profit Split Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignInvestorId, setAssignInvestorId] = useState(model.investorId || "");
  const [assignSharePercent, setAssignSharePercent] = useState<number>(model.investorSharePercent ?? 50);
  const [assignEnableExpenseRecoupment, setAssignEnableExpenseRecoupment] = useState<boolean>(model.enableExpenseRecoupment !== false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [deleteModelError, setDeleteModelError] = useState<string | null>(null);

  const handleDeleteModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmName.trim().toLowerCase() !== model.name.trim().toLowerCase()) {
      setDeleteModelError(
        language === "de"
          ? `Bitte tippen Sie "${model.name}" zur Bestätigung ein.`
          : `Please type "${model.name}" to confirm.`
      );
      return;
    }

    setIsDeletingModel(true);
    setDeleteModelError(null);

    try {
      const res = await fetch(`/api/models/${model.slug}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Fehler beim Löschen des Models");

      alert(data.message);
      router.push("/models");
    } catch (err: any) {
      setDeleteModelError(err.message || "Fehler beim Löschen des Models");
      setIsDeletingModel(false);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAssign(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/models/${model.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: assignInvestorId || null,
          investorSharePercent:
            typeof assignSharePercent === "number"
              ? assignSharePercent
              : !isNaN(parseFloat(assignSharePercent as any))
              ? Math.max(0, Math.min(100, parseFloat(assignSharePercent as any)))
              : 50,
          enableExpenseRecoupment: assignEnableExpenseRecoupment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update assignment");
      setIsAssignModalOpen(false);
      await refreshData();
    } catch (err: any) {
      setAssignError(err.message || "Fehler beim Speichern der Zuweisung");
    } finally {
      setIsSavingAssign(false);
    }
  };

  // New Asset Form state (Metadata-first, no file upload required)
  const [assetTitle, setAssetTitle] = useState("");
  const [assetTheme, setAssetTheme] = useState("Lingerie / Boudoir");
  const [assetNotes, setAssetNotes] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetType, setAssetType] = useState<"PHOTO" | "VIDEO" | "TEXT">("PHOTO");
  const [assetLevel, setAssetLevel] = useState<"TEASER" | "SOFT" | "PPV">("TEASER");
  const [assetTags, setAssetTags] = useState("");
  const [assetCount, setAssetCount] = useState<number>(1);
  const [isSavingAsset, setIsSavingAsset] = useState(false);

  // Batch Asset Form state
  const [batchItems, setBatchItems] = useState([
    { type: "PHOTO" as const, explicitLevel: "TEASER" as const, theme: "Strand & Sommer", count: 15, baseTitle: "Strand Bikini Set" },
    { type: "PHOTO" as const, explicitLevel: "SOFT" as const, theme: "Lingerie / Bedroom", count: 10, baseTitle: "Lingerie Boudoir" },
    { type: "VIDEO" as const, explicitLevel: "PPV" as const, theme: "VIP Exclusive", count: 8, baseTitle: "VIP Room Clip HD" },
  ]);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // New Expense Form state
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReceipt, setExpenseReceipt] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [isCleaningStorage, setIsCleaningStorage] = useState(false);

  const fetchStorageStatus = async () => {
    try {
      const res = await fetch("/api/storage");
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data.storage);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStorageStatus();
  }, []);

  const refreshData = async () => {
    try {
      const res = await fetch(`/api/models/${model.slug}`);
      if (res.ok) {
        const data = await res.json();
        setModel(data);
        setFinancials(data.financials);
      }
      await fetchStorageStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCleanupStorage = async () => {
    if (
      !confirm(
        language === "de"
          ? "Möchten Sie verbrauchten (bereits geposteten) Content von der Festplatte löschen und Duplikate bereinigen?"
          : "Do you want to delete used content and remove duplicates from disk?"
      )
    ) {
      return;
    }
    setIsCleaningStorage(true);
    try {
      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        alert(data.message);
        await refreshData();
      } else {
        alert(data.error || "Fehler bei der Bereinigung");
      }
    } catch (err: any) {
      alert(err.message || "Fehler beim Optimieren");
    } finally {
      setIsCleaningStorage(false);
    }
  };

  const [classifyingAssetId, setClassifyingAssetId] = useState<string | null>(null);
  const [isBatchClassifying, setIsBatchClassifying] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    isOpen: boolean;
    isMinimized?: boolean;
    total: number;
    current: number;
    currentTitle: string;
    successCount: number;
    skippedCount: number;
    errorCount: number;
    isFinished: boolean;
    isCancelled: boolean;
    logs: string[];
  } | null>(null);
  const cancelBatchRef = useRef(false);

  const handleQuickGrokClassify = async (assetId: string) => {
    setClassifyingAssetId(assetId);
    try {
      let data: any = null;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          }
          const res = await fetch(`/api/assets/${assetId}/classify`, {
            method: "POST",
          });
          data = await safeJson(res);
          if (res.ok && data.success) break;
          if (attempt < 3 && (res.status >= 500 || res.status === 429 || res.status === 520)) {
            continue;
          }
          throw new Error(data?.error || `Grok Klassifizierung fehlgeschlagen (${res.status})`);
        } catch (e: any) {
          lastErr = e;
          if (attempt >= 3) throw e;
        }
      }
      await refreshData();
    } catch (err: any) {
      alert(err.message || "Fehler bei der Grok-Analyse");
    } finally {
      setClassifyingAssetId(null);
    }
  };

  const handleBatchGrokClassify = async (force: boolean = false) => {
    // Collect eligible photo assets
    const eligiblePhotos = (model.assets || []).filter((a: any) => {
      if (a.type !== "PHOTO" || !a.fileUrl) return false;
      if (force) return true;
      const isUnclassifiedTag = a.tags?.includes("unclassified");
      const isQuelleGeneric =
        a.tags?.includes("quelle") &&
        (!a.theme || a.theme === "Allgemein" || a.theme === "Unklassifiziert" || a.title?.startsWith("Quell-Medium"));
      return isUnclassifiedTag || isQuelleGeneric;
    });

    if (eligiblePhotos.length === 0) {
      alert(
        language === "de"
          ? "Keine passenden Fotos zur Klassifizierung vorhanden."
          : "No matching photos found to classify."
      );
      return;
    }

    cancelBatchRef.current = false;
    setIsBatchClassifying(true);
    setBatchProgress({
      isOpen: true,
      isMinimized: false,
      total: eligiblePhotos.length,
      current: 0,
      currentTitle: eligiblePhotos[0]?.title || "Initialisiere...",
      successCount: 0,
      skippedCount: 0,
      errorCount: 0,
      isFinished: false,
      isCancelled: false,
      logs: [],
    });

    let successes = 0;
    let skipped = 0;
    let errors = 0;
    const logs: string[] = [];

    for (let i = 0; i < eligiblePhotos.length; i++) {
      if (cancelBatchRef.current) {
        logs.unshift(language === "de" ? "⏹️ Vorgang durch Benutzer abgebrochen." : "⏹️ Process cancelled by user.");
        setBatchProgress((prev) =>
          prev
            ? {
                ...prev,
                isCancelled: true,
                isFinished: true,
                logs: [...logs],
              }
            : null
        );
        break;
      }

      const asset = eligiblePhotos[i];
      const assetLabel = asset.title || `Foto #${i + 1}`;

      setBatchProgress((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentTitle: assetLabel,
            }
          : null
      );

      const MAX_RETRIES = 3;
      let handled = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (cancelBatchRef.current) break;

        if (attempt > 1) {
          logs.unshift(
            language === "de"
              ? `🔄 ${assetLabel}: Wiederholungsversuch (${attempt}/${MAX_RETRIES}) wegen Serververzögerung...`
              : `🔄 ${assetLabel}: Retry attempt (${attempt}/${MAX_RETRIES}) due to server delay...`
          );
          setBatchProgress((prev) => (prev ? { ...prev, logs: [...logs] } : null));
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }

        try {
          const res = await fetch(`/api/assets/${asset.id}/classify`, {
            method: "POST",
          });
          const data = await safeJson(res);

          if (res.ok && data.success) {
            successes++;
            const tier =
              data.classification?.classification?.tier ||
              data.classification?.explicitLevel ||
              "Klassifiziert";
            const cat = data.classification?.classification?.category || "";
            const stars = data.classification?.suggestedStarsPrice ?? 0;
            logs.unshift(`✅ ${assetLabel}: ${tier}${cat ? ` (${cat})` : ""} • ${stars} ⭐`);
            handled = true;
            break;
          } else {
            if (
              res.status === 404 ||
              data.error?.includes("Festplatte") ||
              data.error?.includes("nicht gefunden")
            ) {
              skipped++;
              logs.unshift(`⚠️ ${assetLabel}: Datei nicht auf Server-Festplatte (übersprungen)`);
              handled = true;
              break;
            }

            // If transient error (520, 502, 503, 504, 429) and attempts remaining:
            if (attempt < MAX_RETRIES && (res.status >= 500 || res.status === 429 || res.status === 520 || res.status === 0)) {
              console.warn(`[BatchClassify] Asset ${asset.id} attempt ${attempt} returned ${res.status}, retrying...`);
              continue;
            }

            errors++;
            logs.unshift(`❌ ${assetLabel}: Serverfehler (${res.status}): ${data.error || "Ungültige Serverantwort"}`);
            handled = true;
            break;
          }
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            console.warn(`[BatchClassify] Asset ${asset.id} attempt ${attempt} threw: ${err.message}, retrying...`);
            continue;
          }
          errors++;
          logs.unshift(`❌ ${assetLabel}: ${err.message}`);
          handled = true;
          break;
        }
      }

      setBatchProgress((prev) =>
        prev
          ? {
              ...prev,
              successCount: successes,
              skippedCount: skipped,
              errorCount: errors,
              logs: [...logs],
            }
          : null
      );

      // Periodically refresh dashboard data in background so cards update live
      if ((i + 1) % 2 === 0 || i === eligiblePhotos.length - 1) {
        refreshData().catch(() => {});
      }
    }

    setBatchProgress((prev) => (prev ? { ...prev, isFinished: true } : null));
    setIsBatchClassifying(false);
    await refreshData();
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAsset(true);
    try {
      const tags = assetTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          title: assetTitle || undefined,
          theme: assetTheme || undefined,
          notes: assetNotes || undefined,
          fileUrl: assetUrl || undefined,
          type: assetType,
          explicitLevel: assetLevel,
          tags,
          count: assetCount,
        }),
      });
      if (res.ok) {
        setIsAssetModalOpen(false);
        setAssetTitle("");
        setAssetNotes("");
        setAssetUrl("");
        setAssetTags("");
        setAssetCount(1);
        await refreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleBatchCreateAssets = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBatch(true);
    try {
      const res = await fetch("/api/assets/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          items: batchItems,
        }),
      });

      if (res.ok) {
        setIsBatchAssetModalOpen(false);
        await refreshData();
      } else {
        const data = await res.json();
        alert(data.error || "Fehler beim Anlegen des Stapel-Inventars");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount) return;
    setIsSavingExpense(true);
    try {
      const res = await fetch("/api/finances/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          description: expenseDesc,
          amountUsd: parseFloat(expenseAmount),
          receiptUrl: expenseReceipt || null,
        }),
      });
      if (res.ok) {
        setIsExpenseModalOpen(false);
        setExpenseDesc("");
        setExpenseAmount("");
        setExpenseReceipt("");
        await refreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingExpense(false);
    }
  };

  const unclassifiedPhotosCount = (model.assets || []).filter((a: any) => {
    if (a.isUsed || a.type !== "PHOTO") return false;
    const isUnclassifiedTag = a.tags?.includes("unclassified");
    const isQuelleGeneric =
      a.tags?.includes("quelle") &&
      (!a.theme || a.theme === "Allgemein" || a.theme === "Unklassifiziert" || a.title?.startsWith("Quell-Medium"));
    return isUnclassifiedTag || isQuelleGeneric;
  }).length;

  const hasPhotos = (model.assets || []).some((a: any) => a.type === "PHOTO");

  return (
    <div className="space-y-6">
      {/* Model Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-muted border-2 border-primary/30 shrink-0">
            {model.avatarUrl ? (
              <img src={model.avatarUrl} alt={model.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xl font-bold">
                {model.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{model.name}</h1>
              {model.enableExpenseRecoupment === false ? (
                <Badge variant="info">{language === "de" ? "Direkt-Split" : "Direct Split"} ({model.investorSharePercent ?? 50}/{100 - (model.investorSharePercent ?? 50)} {language === "de" ? "Aktiv" : "Active"})</Badge>
              ) : financials.isRecouped ? (
                <Badge variant="success">100% {language === "de" ? "Amortisiert" : "Recouped"} ({model.investorSharePercent ?? 50}/{100 - (model.investorSharePercent ?? 50)} {language === "de" ? "Aktiv" : "Active"})</Badge>
              ) : (
                <Badge variant="warning">{language === "de" ? "Amortisiert noch" : "Recouping Principal"} ({model.investorSharePercent ?? 50}%)</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {t.modelDetail.channelLabel}: {model.channelTitle || model.telegramChannelId} • {t.modelDetail.idLabel}: {model.telegramChannelId}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              {model.investor ? (
                <>
                  <span className="text-muted-foreground">{t.modelDetail.investorLabel}: <strong className="text-foreground">{model.investor.name || model.investor.email}</strong></span>
                  {model.investor.tonAddress ? (
                    <span className="font-mono text-[11px] text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/40 flex items-center gap-1">
                      💎 {truncateAddress(model.investor.tonAddress)}
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                      {t.modelDetail.walletNotConfigured}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground italic">{t.modelDetail.unassignedInvestor}</span>
              )}
              <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 ml-1">
                {model.investorSharePercent ?? 50}% {language === "de" ? "Inv" : "Inv"} / {100 - (model.investorSharePercent ?? 50)}% {language === "de" ? "Agentur" : "Agency"}
              </Badge>
              {isMasterAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAssignInvestorId(model.investorId || "");
                    setAssignSharePercent(model.investorSharePercent ?? 50);
                    setIsAssignModalOpen(true);
                  }}
                  className="h-6 text-[11px] px-2 text-primary hover:text-primary gap-1 font-semibold"
                >
                  <Sliders className="h-3 w-3" />
                  {t.modelDetail.adjustSplitButton}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="gradient"
            onClick={() => setIsGrokModalOpen(true)}
            className="gap-2 text-xs font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            {t.modelDetail.aiPlanButton}
          </Button>

          <Button
            variant="ton"
            onClick={() => setIsPayoutModalOpen(true)}
            disabled={financials.partnerAvailablePayoutUsd <= 0}
            className="gap-2 text-xs font-semibold"
          >
            <Wallet className="h-4 w-4" />
            {t.modelDetail.logPayoutButton} ({formatUsd(financials.partnerAvailablePayoutUsd)})
          </Button>

          {isMasterAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteConfirmName("");
                setDeleteModelError(null);
                setIsDeleteModalOpen(true);
              }}
              className="gap-1.5 text-xs font-semibold border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 hover:border-rose-500/50 shadow-sm"
              title={t.models.deleteModel}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.models.deleteModel}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="pipeline" className="gap-1.5 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            {t.modelDetail.tabPipeline}
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            {t.modelDetail.tabPosts} ({model.posts.length})
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5 text-xs">
            <ImageIcon className="h-3.5 w-3.5" />
            {t.modelDetail.tabVault} ({model.assets.length})
          </TabsTrigger>
          <TabsTrigger value="stars" className="gap-1.5 text-xs">
            <Star className="h-3.5 w-3.5" />
            {t.modelDetail.tabStars} ({model.starTransactions.length})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5 text-xs">
            <DollarSign className="h-3.5 w-3.5" />
            {t.modelDetail.tabExpenses} ({model.expenses.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Financial Pipeline */}
        <TabsContent value="pipeline" className="space-y-6 pt-2">
          <PipelineOverview
            financials={financials}
            modelName={model.name}
            onOpenPayout={() => setIsPayoutModalOpen(true)}
          />
        </TabsContent>

        {/* Tab 2: Content & Scheduled Posts */}
        <TabsContent value="posts" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{t.modelDetail.postsTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {t.modelDetail.postsSubtitle}
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setIsGrokModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t.modelDetail.generateGrokButton}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">{t.modelDetail.colStatus}</th>
                      <th className="p-3">{t.modelDetail.colScheduledFor}</th>
                      <th className="p-3">{t.modelDetail.colAsset}</th>
                      <th className="p-3">{t.modelDetail.colCaption}</th>
                      <th className="p-3">{t.modelDetail.colStarsPrice}</th>
                      <th className="p-3">{t.modelDetail.colTelegramMsg}</th>
                      <th className="p-3 text-right">{t.modelDetail.colManualAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.posts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          {t.modelDetail.noPostsScheduled}
                        </td>
                      </tr>
                    ) : (
                      model.posts.map((post: any) => (
                        <tr key={post.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            {post.status === "PUBLISHED" && <Badge variant="success">{t.modelDetail.published}</Badge>}
                            {post.status === "SCHEDULED" && <Badge variant="warning">{t.modelDetail.readyManual}</Badge>}
                            {post.status === "FAILED" && <Badge variant="destructive">{t.modelDetail.failed}</Badge>}
                            {post.status === "DRAFT" && <Badge variant="outline">{t.modelDetail.draft}</Badge>}
                          </td>
                          <td className="p-3 whitespace-nowrap font-medium">
                            {format(new Date(post.scheduledFor), "dd.MM.yyyy HH:mm")}
                          </td>
                          <td className="p-3">
                            {post.asset ? (
                              <div className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded bg-muted overflow-hidden border shrink-0 flex items-center justify-center text-center p-0.5">
                                  {post.asset.fileUrl ? (
                                    <img src={post.asset.fileUrl} alt="Asset" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="text-[9px] font-bold uppercase text-primary">
                                      {post.asset.type === "VIDEO" ? "🎬 VID" : "📷 PIC"}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 max-w-[140px]">
                                  <span className="text-xs font-semibold block truncate text-foreground" title={post.asset.title || "Content Asset"}>
                                    {post.asset.title || "Content Asset"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground block truncate">
                                    {post.asset.theme || post.asset.explicitLevel}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">{t.modelDetail.textOnly}</span>
                            )}
                          </td>
                          <td className="p-3 max-w-xs truncate" title={post.caption}>
                            {post.caption}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {post.starsPrice > 0 ? (
                              <Badge variant="ppv" className="gap-1">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {post.starsPrice} {t.modelDetail.starsBadge}
                              </Badge>
                            ) : (
                              <Badge variant="teaser">{t.modelDetail.freeBadge}</Badge>
                            )}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {post.telegramMsgId ? `#${post.telegramMsgId}` : "-"}
                          </td>
                          <td className="p-3 text-right">
                            {post.status !== "PUBLISHED" ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setSelectedPostForPublish(post);
                                  setSelectedAssetForPublish(null);
                                  setIsDirectPublishOpen(true);
                                }}
                                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 gap-1 font-semibold"
                              >
                                <Send className="h-3 w-3" />
                                {t.modelDetail.postNow}
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">{t.modelDetail.sent}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Content Inventar & Vault */}
        <TabsContent value="assets" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">{t.modelDetail.vaultTitle}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t.modelDetail.vaultSubtitle}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {unclassifiedPhotosCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBatchClassifying}
                      onClick={() => handleBatchGrokClassify(false)}
                      className="gap-1.5 text-xs font-bold bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 shadow-sm"
                    >
                      {isBatchClassifying ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      {isBatchClassifying
                        ? (language === "de" ? "Grok analysiert..." : "Grok analyzing...")
                        : (language === "de"
                            ? `🤖 Grok AI: Fotos bewerten (${unclassifiedPhotosCount})`
                            : `🤖 Grok AI: Classify Photos (${unclassifiedPhotosCount})`)}
                    </Button>
                  )}
                  {hasPhotos && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBatchClassifying}
                      onClick={() => handleBatchGrokClassify(true)}
                      className="gap-1.5 text-xs font-semibold border-purple-500/40 text-purple-300 hover:text-purple-200 hover:bg-purple-950/30 shadow-sm"
                      title={language === "de" ? "Alle Fotos des Models nochmals von Grok bewerten lassen" : "Re-classify all photos with Grok"}
                    >
                      {isBatchClassifying ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 text-purple-400" />
                      )}
                      {t.modelDetail.reclassifyAllButton}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSourceModalOpen(true)}
                    className="gap-1.5 text-xs font-semibold border-indigo-500/40 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 shadow-sm"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    {t.sourceChannel?.button || (language === "de" ? "Quell-Kanal" : "Source Channel")}
                  </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setIsContentUploadOpen(true)}
                className="gap-1.5 text-xs font-bold shadow-sm"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                {t.modelDetail.uploadContentButton}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBatchAssetModalOpen(true)}
                className="gap-1.5 text-xs font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t.modelDetail.batchButton}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssetModalOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.modelDetail.singleAssetButton}
              </Button>
            </div>
          </div>

          {/* Prominent One-Click Initial Grok Classification Banner */}
          {unclassifiedPhotosCount > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>{t.schedule.classifyAllBannerTitle}</span>
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-[10px] font-bold">
                      {unclassifiedPhotosCount} {language === "de" ? "Fotos ausstehend" : "photos pending"}
                    </Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.schedule.classifyAllBannerDesc}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                disabled={isBatchClassifying}
                onClick={() => handleBatchGrokClassify(false)}
                className="gap-2 bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-bold h-9 shadow-md shrink-0"
              >
                {isBatchClassifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{language === "de" ? "Grok bewertet Content..." : "Grok analyzing..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>{t.schedule.classifyAllButton}</span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 50 GB Server Content-Speicher Widget */}
          {storageStatus && (
            <Card className="border border-border/60 bg-gradient-to-br from-card/90 via-card to-background shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">
                          {t.modelDetail.storageTitle}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            storageStatus.isOverQuota
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                              : storageStatus.isNearQuota
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                          }`}
                        >
                          {storageStatus.usedGb.toFixed(2)} GB / {storageStatus.quotaGb} GB ({storageStatus.usedPercentage.toFixed(1)}%)
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {language === "de"
                          ? `${storageStatus.freeGb.toFixed(2)} GB frei • ${storageStatus.totalFiles} Mediendateien auf Server (${storageStatus.activeAssetsCount} aktiv, ${storageStatus.usedAssetsCount} verbraucht)`
                          : `${storageStatus.freeGb.toFixed(2)} GB available • ${storageStatus.totalFiles} media files on server (${storageStatus.activeAssetsCount} active, ${storageStatus.usedAssetsCount} used)`}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCleaningStorage}
                    onClick={handleCleanupStorage}
                    className="gap-2 text-xs font-semibold border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors shrink-0"
                    title={language === "de" ? "Bereinigt verbrauchte Dateien von der Festplatte und entfernt Duplikate" : "Delete used content and remove duplicates from disk"}
                  >
                    {isCleaningStorage ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>{isCleaningStorage ? t.modelDetail.storageCleaning : t.modelDetail.storageCleanupButton}</span>
                  </Button>
                </div>

                {/* Storage Progress Bar */}
                <div className="w-full bg-secondary/60 h-2.5 rounded-full overflow-hidden border border-border/40">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      storageStatus.isOverQuota
                        ? "bg-rose-500"
                        : storageStatus.isNearQuota
                        ? "bg-amber-500"
                        : "bg-gradient-to-r from-indigo-500 to-purple-600"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(storageStatus.usedPercentage, 0.5))}%` }}
                  />
                </div>

                {storageStatus.isNearQuota && (
                  <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5 mt-0.5">
                    <span>⚠️</span> {t.modelDetail.storageNearQuotaWarning}
                  </p>
                )}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {model.assets.map((asset: any) => {
              const isUnclassified =
                asset.tags?.includes("unclassified") ||
                (asset.tags?.includes("quelle") && (!asset.theme || asset.theme === "Allgemein" || asset.theme === "Unklassifiziert" || asset.title?.startsWith("Quell-Medium")));
              const tierBadge = getTierBadgeInfo(asset.tags || []);

              return (
                <Card key={asset.id} className="overflow-hidden border group bg-card/60 flex flex-col justify-between">
                  <div>
                    <div className="relative aspect-square bg-muted flex flex-col items-center justify-center p-3 text-center border-b">
                      {asset.fileUrl ? (
                        asset.type === "VIDEO" || asset.fileUrl.match(/\.(mp4|mov|mkv|avi)$/i) ? (
                          <video
                            src={getMediaDisplayUrl(asset.fileUrl, asset.id)}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                            muted
                          />
                        ) : (
                          <>
                            <img
                              src={getMediaDisplayUrl(asset.fileUrl, asset.id)}
                              alt={asset.title || "Vault asset"}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "flex";
                              }}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div style={{ display: "none" }} className="h-full w-full flex flex-col items-center justify-center p-3 text-center space-y-1 bg-muted/60">
                              <div className="h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center font-bold text-xs">
                                📷 PIC
                              </div>
                              <span className="text-[11px] font-semibold text-foreground truncate max-w-[130px] block">
                                {asset.title || "Medium"}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] text-amber-300 border-amber-500/40 hover:bg-amber-500/10 gap-1 px-2 mt-1"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(`/api/assets/${asset.id}/preview?reload=1`);
                                    if (res.ok) {
                                      window.location.reload();
                                    }
                                  } catch {}
                                }}
                              >
                                <RefreshCw className="h-3 w-3" />
                                {language === "de" ? "Neu laden" : "Reload"}
                              </Button>
                            </div>
                          </>
                        )
                      ) : (
                        <div className="space-y-1">
                          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center font-bold text-xs uppercase">
                            {asset.type === "VIDEO" ? "🎬 VID" : "📷 PIC"}
                          </div>
                          <span className="text-xs font-bold block text-foreground truncate max-w-[130px]">
                            {asset.title || `${asset.type} #${asset.id.slice(0, 4)}`}
                          </span>
                          {asset.theme && (
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {asset.theme}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="absolute top-2 left-2 flex gap-1 flex-wrap items-center">
                        {isUnclassified ? (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-[10px] font-bold gap-1 shadow-sm backdrop-blur-sm">
                            <Sparkles className="h-3 w-3 text-amber-400" />
                            {language === "de" ? "Grok AI ausstehend" : "Grok AI pending"}
                          </Badge>
                        ) : (
                          <>
                            {tierBadge && (
                              <Badge variant="outline" className={`text-[9px] font-bold py-0 h-4 border shadow-sm backdrop-blur-sm ${tierBadge.className}`}>
                                {tierBadge.label}
                              </Badge>
                            )}
                            {asset.explicitLevel === "PPV" && <Badge variant="ppv">PPV</Badge>}
                            {asset.explicitLevel === "SOFT" && <Badge variant="soft">SOFT</Badge>}
                            {asset.explicitLevel === "TEASER" && <Badge variant="teaser">TEASER</Badge>}
                          </>
                        )}
                      </div>

                      <div className="absolute bottom-2 right-2 flex flex-col gap-1 items-end">
                        {asset.fileUrl?.startsWith("/uploads/") && (
                          <Badge variant="outline" className="bg-purple-950/80 text-[9px] text-purple-300 border-purple-500/40">
                            📁 Festplatte
                          </Badge>
                        )}
                        {asset.isUsed && (
                          <Badge variant="outline" className="bg-black/70 text-[10px] text-emerald-400 border-emerald-500/40">
                            {t.modelDetail.inScheduleBadge}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground truncate" title={asset.title}>
                          {asset.title || "Content-Eintrag"}
                        </span>
                        <Badge variant="outline" className="text-[9px] py-0 h-4">
                          {asset.type}
                        </Badge>
                      </div>

                      {asset.notes && (
                        <p className="text-[10px] text-muted-foreground italic line-clamp-1" title={asset.notes}>
                          "{asset.notes}"
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1 pt-1">
                        {asset.tags?.map((tag: string, i: number) => (
                          <span key={i} className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </div>

                  {/* Card Action Buttons (Direct Publish, Grok Classify, Manual Classify, Schedule) */}
                  {!asset.isUsed && (
                    <div className="p-2.5 pt-0 border-t border-border/40 mt-1 flex items-center justify-between gap-1 flex-wrap">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-6 text-[10px] px-2 bg-indigo-600 hover:bg-indigo-500 font-bold gap-1"
                        onClick={() => {
                          setSelectedAssetForPublish(asset);
                          setSelectedPostForPublish(null);
                          setIsDirectPublishOpen(true);
                        }}
                      >
                        <Send className="h-2.5 w-2.5" />
                        {t.modelDetail.directPostButton}
                      </Button>
                      <div className="flex items-center gap-1">
                        {asset.type === "PHOTO" && (
                          isUnclassified ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={classifyingAssetId === asset.id}
                              className="h-6 text-[10px] px-2 bg-gradient-to-r from-amber-500/15 to-purple-500/15 border-amber-500/40 text-amber-300 hover:text-amber-200 font-bold gap-1"
                              onClick={() => handleQuickGrokClassify(asset.id)}
                            >
                              {classifyingAssetId === asset.id ? (
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                              )}
                              {classifyingAssetId === asset.id
                                ? (language === "de" ? "Grok..." : "Grok...")
                                : "🤖 Grok AI"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={classifyingAssetId === asset.id}
                              className="h-6 text-[10px] px-1.5 border-purple-500/40 text-purple-300 hover:text-purple-200 hover:bg-purple-950/30 font-medium gap-1"
                              title={language === "de" ? "Mit Grok AI erneut bewerten" : "Re-classify with Grok AI"}
                              onClick={() => handleQuickGrokClassify(asset.id)}
                            >
                              {classifyingAssetId === asset.id ? (
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-2.5 w-2.5 text-purple-400" />
                              )}
                              {classifyingAssetId === asset.id
                                ? (language === "de" ? "Grok..." : "Grok...")
                                : t.modelDetail.reclassifyButton}
                            </Button>
                          )
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => {
                            setSelectedAssetForClassify(asset);
                            setIsManualClassifyOpen(true);
                          }}
                        >
                          {t.modelDetail.classifyButton}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => {
                            setSelectedAssetForSchedule(asset);
                            setIsScheduleAssetOpen(true);
                          }}
                        >
                          {t.modelDetail.scheduleAssetButton}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Telegram Stars Transactions (MTProto) */}
        <TabsContent value="stars" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{t.modelDetail.starsTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {t.modelDetail.starsSubtitle}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {t.modelDetail.maturityRuleBadge}
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">{t.modelDetail.colStatus}</th>
                      <th className="p-3">{t.modelDetail.colTxDate}</th>
                      <th className="p-3">{t.modelDetail.colMaturesAt}</th>
                      <th className="p-3">{t.modelDetail.colStarsAmount}</th>
                      <th className="p-3">{t.modelDetail.colEstimatedUsd}</th>
                      <th className="p-3">{t.modelDetail.colTelegramTxId}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.starTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          {t.modelDetail.noStarsRecorded}
                        </td>
                      </tr>
                    ) : (
                      model.starTransactions.map((tx: any) => {
                        const isMatured = tx.status === "MATURED";
                        const maturesIn = formatDistanceToNow(new Date(tx.maturesAt), { addSuffix: true });

                        return (
                          <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              {isMatured ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {t.modelDetail.maturedStatus}
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="gap-1">
                                  <Lock className="h-3 w-3" />
                                  {t.modelDetail.pendingLockStatus}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {format(new Date(tx.transactionDate), "dd.MM.yyyy HH:mm")}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {format(new Date(tx.maturesAt), "dd.MM.yyyy")}
                              <span className="text-[10px] text-muted-foreground block">
                                {isMatured ? t.modelDetail.maturedLabel : `${t.modelDetail.maturesLabel} ${maturesIn}`}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap font-bold text-amber-400">
                              {formatStars(tx.starsAmount)}
                            </td>
                            <td className="p-3 whitespace-nowrap font-bold text-foreground">
                              {formatUsd(tx.estimatedUsd)}
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">
                              {tx.telegramTxId}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Expenses & Recoupment Tracker */}
        <TabsContent value="expenses" className="space-y-4 pt-2">
          {model.enableExpenseRecoupment === false && (
            <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/30 text-sky-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{t.modelDetail.directSplitNotice}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{t.modelDetail.expensesTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {model.enableExpenseRecoupment === false
                  ? t.modelDetail.directSplitNotice
                  : t.modelDetail.expensesSubtitle}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpenseModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.modelDetail.addExpenseButton}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">{t.modelDetail.colDescription}</th>
                      <th className="p-3">{t.modelDetail.colDate}</th>
                      <th className="p-3">{t.modelDetail.colAmount}</th>
                      <th className="p-3">{t.modelDetail.colReceipt}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.expenses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          {t.modelDetail.noExpensesLogged}
                        </td>
                      </tr>
                    ) : (
                      model.expenses.map((exp: any) => (
                        <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">{exp.description}</td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {format(new Date(exp.createdAt), "dd.MM.yyyy")}
                          </td>
                          <td className="p-3 font-bold text-destructive">
                            {formatUsd(exp.amountUsd)}
                          </td>
                          <td className="p-3">
                            {exp.receiptUrl ? (
                              <a
                                href={exp.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-mono"
                              >
                                {t.modelDetail.viewReceipt} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grok AI Scheduler Modal */}
      <GrokSchedulerModal
        open={isGrokModalOpen}
        onOpenChange={setIsGrokModalOpen}
        modelId={model.id}
        modelName={model.name}
        channelTitle={model.channelTitle}
        availableAssets={model.assets}
        onScheduleCreated={refreshData}
      />

      {/* Payout Modal */}
      <PayoutModal
        open={isPayoutModalOpen}
        onOpenChange={setIsPayoutModalOpen}
        modelId={model.id}
        modelName={model.name}
        defaultRecipient={model.investor?.tonAddress || null}
        maxAvailableUsd={financials.partnerAvailablePayoutUsd}
        onPayoutLogged={refreshData}
      />

      {/* Content Upload Modal */}
      <ContentUploadModal
        open={isContentUploadOpen}
        onOpenChange={setIsContentUploadOpen}
        modelId={model.id}
        modelName={model.name}
        onUploaded={refreshData}
      />

      {/* Direct Publish ("Jetzt Posten") Modal */}
      <DirectPublishModal
        open={isDirectPublishOpen}
        onOpenChange={setIsDirectPublishOpen}
        modelId={model.id}
        channelTitle={model.channelTitle}
        telegramChannelId={model.telegramChannelId}
        asset={selectedAssetForPublish}
        post={selectedPostForPublish}
        onPublished={refreshData}
      />

      {/* Manual Classify Modal */}
      <ManualClassifyModal
        open={isManualClassifyOpen}
        onOpenChange={setIsManualClassifyOpen}
        asset={selectedAssetForClassify}
        onClassified={refreshData}
      />

      {/* Schedule Asset Modal */}
      <ScheduleAssetModal
        open={isScheduleAssetOpen}
        onOpenChange={setIsScheduleAssetOpen}
        asset={selectedAssetForSchedule}
        onScheduled={refreshData}
      />

      {/* Source Channel Modal (GramJS Telegram Media Import) */}
      <SourceChannelModal
        open={isSourceModalOpen}
        onOpenChange={setIsSourceModalOpen}
        modelId={model.id}
        modelSlug={model.slug}
        modelName={model.name}
        onSyncCompleted={refreshData}
      />

      {/* Add Single Asset Modal (Metadata-First) */}
      <Dialog open={isAssetModalOpen} onOpenChange={setIsAssetModalOpen}>
        <DialogContent onClose={() => setIsAssetModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t.modelDetail.singleAssetModalTitle}</DialogTitle>
            <DialogDescription>
              {t.modelDetail.singleAssetModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAsset} className="space-y-3.5 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.modelDetail.mediaTypeLabel}
                </label>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="PHOTO" className="bg-card">{t.modelDetail.mediaTypePhoto}</option>
                  <option value="VIDEO" className="bg-card">{t.modelDetail.mediaTypeVideo}</option>
                  <option value="TEXT" className="bg-card">{t.modelDetail.mediaTypeText}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.modelDetail.explicitLabel}
                </label>
                <select
                  value={assetLevel}
                  onChange={(e) => setAssetLevel(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="TEASER" className="bg-card">{t.modelDetail.explicitTeaser}</option>
                  <option value="SOFT" className="bg-card">{t.modelDetail.explicitSoft}</option>
                  <option value="PPV" className="bg-card">{t.modelDetail.explicitPpv}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.modelDetail.titleLabel}
                </label>
                <Input
                  value={assetTitle}
                  onChange={(e) => setAssetTitle(e.target.value)}
                  placeholder={t.modelDetail.titlePlaceholder}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.modelDetail.themeLabel}
                </label>
                <Input
                  value={assetTheme}
                  onChange={(e) => setAssetTheme(e.target.value)}
                  placeholder={t.modelDetail.themePlaceholder}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.modelDetail.countLabel}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={assetCount}
                  onChange={(e) => setAssetCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="font-bold text-center"
                />
              </div>
            </div>
            {assetCount > 1 && (
              <p className="text-[11px] text-purple-400 font-medium">
                ⚡ {language === "de"
                  ? `Erstellt automatisch ${assetCount} nummerierte Medien-Slots (z. B. ${assetTitle || "Medium"} #1 bis #${assetCount})`
                  : `Automatically creates ${assetCount} numbered media slots (e.g. ${assetTitle || "Media"} #1 to #${assetCount})`}
              </p>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.notesLabel}
              </label>
              <Input
                value={assetNotes}
                onChange={(e) => setAssetNotes(e.target.value)}
                placeholder={t.modelDetail.notesPlaceholder}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.urlLabel}
              </label>
              <Input
                value={assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
                placeholder={t.modelDetail.urlPlaceholder}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingAsset} className="w-full">
                {isSavingAsset ? t.modelDetail.savingAssetButton : t.modelDetail.saveAssetButton}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Batch Inventory Modal */}
      <Dialog open={isBatchAssetModalOpen} onOpenChange={setIsBatchAssetModalOpen}>
        <DialogContent className="max-w-2xl" onClose={() => setIsBatchAssetModalOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <DialogTitle>{t.modelDetail.batchModalTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.modelDetail.batchModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchCreateAssets} className="space-y-4 py-2">
            <div className="space-y-3">
              {batchItems.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-card/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                      {language === "de" ? "Gruppe" : "Group"} #{idx + 1}
                    </span>
                    {batchItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setBatchItems((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        {language === "de" ? "Entfernen" : "Remove"}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{t.modelDetail.mediaTypeLabel}</label>
                      <select
                        value={item.type}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setBatchItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, type: val } : it))
                          );
                        }}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="PHOTO" className="bg-card">{language === "de" ? "📷 Foto" : "📷 Photo"}</option>
                        <option value="VIDEO" className="bg-card">{language === "de" ? "🎬 Video" : "🎬 Video"}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{t.modelDetail.explicitLabel}</label>
                      <select
                        value={item.explicitLevel}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setBatchItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, explicitLevel: val } : it))
                          );
                        }}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="TEASER" className="bg-card">{t.modelDetail.explicitTeaser}</option>
                        <option value="SOFT" className="bg-card">{t.modelDetail.explicitSoft}</option>
                        <option value="PPV" className="bg-card">{t.modelDetail.explicitPpv}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{t.modelDetail.themeLabel}</label>
                      <Input
                        className="h-8 text-xs"
                        value={item.theme}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, theme: val, baseTitle: `${val} ${it.type === "PHOTO" ? (language === "de" ? "Foto" : "Photo") : "Video"}` } : it))
                          );
                        }}
                        placeholder={t.modelDetail.themePlaceholder}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">{t.modelDetail.countLabel}</label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        className="h-8 text-xs font-bold text-center"
                        value={item.count}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setBatchItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, count: val } : it))
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1 border-dashed"
              onClick={() =>
                setBatchItems((prev) => [
                  ...prev,
                  { type: "PHOTO", explicitLevel: "TEASER", theme: "Lifestyle / Casual", count: 10, baseTitle: language === "de" ? "Lifestyle Foto" : "Lifestyle Photo" },
                ])
              }
            >
              <Plus className="h-3 w-3" />
              {t.modelDetail.batchAddGroup}
            </Button>

            <div className="p-3 bg-muted/40 rounded-lg text-xs flex items-center justify-between">
              <span className="text-muted-foreground">{t.modelDetail.batchTotalUnits}</span>
              <span className="font-bold text-foreground">
                {batchItems.reduce((acc, it) => acc + (it.count || 0), 0)} {language === "de" ? "Content-Einheiten" : "Units"}
              </span>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingBatch} className="w-full gap-2">
                {isSavingBatch ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.modelDetail.batchSavingButton}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t.modelDetail.batchSaveButton}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Expense Modal */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent onClose={() => setIsExpenseModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t.modelDetail.expenseModalTitle}</DialogTitle>
            <DialogDescription>
              {t.modelDetail.expenseModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.expenseDescLabel}
              </label>
              <Input
                required
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder={t.modelDetail.expenseDescPlaceholder}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.expenseAmountLabel}
              </label>
              <Input
                required
                type="number"
                step="0.01"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="500.00"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.expenseReceiptLabel}
              </label>
              <Input
                value={expenseReceipt}
                onChange={(e) => setExpenseReceipt(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingExpense} className="w-full">
                {isSavingExpense ? t.modelDetail.savingExpenseButton : t.modelDetail.saveExpenseButton}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Investor & Profit Split Modal */}
      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent className="max-w-md" onClose={() => setIsAssignModalOpen(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              {t.modelDetail.assignModalTitle}
            </DialogTitle>
            <DialogDescription>
              {t.modelDetail.assignModalDesc}
            </DialogDescription>
          </DialogHeader>

          {assignError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{assignError}</span>
            </div>
          )}

          <form onSubmit={handleSaveAssignment} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t.modelDetail.assignInvestorLabel}
              </label>
              <select
                value={assignInvestorId}
                onChange={(e) => setAssignInvestorId(e.target.value)}
                className="w-full h-10 px-3 py-2 text-xs rounded-md border border-input bg-background text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t.modelDetail.assignInvestorNone}</option>
                {investors.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name ? `${inv.name} (${inv.email})` : inv.email}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t.modelDetail.assignInvestorHint}
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-primary" />
                  {t.modelDetail.assignShareLabel}
                </label>
                <span className="text-xs font-mono font-bold text-primary">
                  {assignSharePercent}% {language === "de" ? "Investor" : "Investor"} / {100 - assignSharePercent}% {language === "de" ? "Agentur" : "Agency"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t.modelDetail.assignShareHint}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={assignSharePercent}
                  onChange={(e) => setAssignSharePercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-24 font-mono font-bold text-center h-8 text-xs"
                />
                <div className="flex items-center gap-1 flex-1">
                  {[30, 40, 50, 60, 70].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      variant={assignSharePercent === pct ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAssignSharePercent(pct)}
                      className="h-8 text-xs px-2 flex-1"
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recoupment & Expense Receipts Toggle */}
            <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignEnableExpenseRecoupment}
                  onChange={(e) => setAssignEnableExpenseRecoupment(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="text-xs font-semibold text-foreground">
                  {t.modelDetail.assignRecoupmentLabel}
                </span>
              </label>
              <p className="text-[11px] text-muted-foreground pl-6">
                {t.modelDetail.assignRecoupmentDesc}
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSavingAssign}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={isSavingAssign} className="gap-2">
                {isSavingAssign ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.modelDetail.savingAssignButton}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t.modelDetail.saveAssignButton}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Grok Vision Classification Modal with Real-time Progress */}
      {batchProgress?.isOpen && !batchProgress?.isMinimized && (
        <Dialog
          open={Boolean(batchProgress.isOpen && !batchProgress.isMinimized)}
          onOpenChange={(open) => {
            if (!open) {
              if (!batchProgress.isFinished) {
                // Minimize instead of aborting when closing the dialog
                setBatchProgress((prev) => (prev ? { ...prev, isMinimized: true } : null));
              } else {
                setBatchProgress(null);
              }
            }
          }}
        >
          <DialogContent className="max-w-xl bg-card border-border shadow-2xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <span>
                        {language === "de"
                          ? "🤖 Grok 4.20 Vision Batch-Klassifizierung"
                          : "🤖 Grok 4.20 Vision Batch Classifier"}
                      </span>
                      {batchProgress.isFinished ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]"
                        >
                          {language === "de" ? "Abgeschlossen" : "Completed"}
                        </Badge>
                      ) : batchProgress.isCancelled ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]"
                        >
                          {language === "de" ? "Angehalten" : "Stopped"}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] animate-pulse"
                        >
                          {language === "de" ? "Aktiv..." : "Running..."}
                        </Badge>
                      )}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {model.name} • {batchProgress.current} von {batchProgress.total} Fotos bearbeitet
                    </DialogDescription>
                  </div>
                </div>

                {/* Minimize Button in Header */}
                {!batchProgress.isFinished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBatchProgress((prev) => (prev ? { ...prev, isMinimized: true } : null))
                    }
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    title={language === "de" ? "Im Hintergrund weiterlaufen lassen" : "Run in background"}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {language === "de" ? "Hintergrund" : "Minimize"}
                    </span>
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Progress bar & Percent */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {language === "de" ? "Gesamtfortschritt" : "Overall Progress"}
                  </span>
                  <span className="text-primary font-mono font-bold">
                    {Math.round(
                      (batchProgress.current / Math.max(1, batchProgress.total)) * 100
                    )}
                    %
                  </span>
                </div>
                <div className="w-full bg-secondary/80 h-3 rounded-full overflow-hidden border border-border/60">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-indigo-500 transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          2,
                          (batchProgress.current / Math.max(1, batchProgress.total)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Status Counters */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-center">
                  <div className="text-lg font-bold text-emerald-300 font-mono">
                    {batchProgress.successCount}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Klassifiziert" : "Classified"}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-center">
                  <div className="text-lg font-bold text-amber-300 font-mono">
                    {batchProgress.skippedCount}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Nicht auf Server" : "Missing from Disk"}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-center">
                  <div className="text-lg font-bold text-rose-300 font-mono">
                    {batchProgress.errorCount}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === "de" ? "Fehler" : "Errors"}
                  </div>
                </div>
              </div>

              {/* Current Asset Processing Preview */}
              {!batchProgress.isFinished && batchProgress.currentTitle && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-purple-500/30 bg-purple-950/20 text-xs">
                  <RefreshCw className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
                  <span className="text-muted-foreground shrink-0">
                    {language === "de" ? "Aktuell in Analyse:" : "Currently analyzing:"}
                  </span>
                  <span className="font-semibold text-foreground truncate">
                    {batchProgress.currentTitle}
                  </span>
                </div>
              )}

              {/* Live Log Box */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {language === "de" ? "Live-Aktivitätsprotokoll:" : "Live Activity Log:"}
                </span>
                <div className="h-44 overflow-y-auto rounded-lg border border-border/60 bg-background/80 p-2.5 font-mono text-[11px] space-y-1">
                  {batchProgress.logs.length === 0 ? (
                    <span className="text-muted-foreground italic">
                      {language === "de"
                        ? "Initialisiere xAI Grok 4.20 Vision..."
                        : "Initializing xAI Grok 4.20 Vision..."}
                    </span>
                  ) : (
                    batchProgress.logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="leading-tight py-0.5 border-b border-border/20 last:border-0"
                      >
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
              {!batchProgress.isFinished ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBatchProgress((prev) => (prev ? { ...prev, isMinimized: true } : null))
                    }
                    className="w-full sm:w-auto text-xs font-semibold"
                  >
                    <Minimize2 className="h-3.5 w-3.5 mr-1.5" />
                    {language === "de" ? "Im Hintergrund weiterlaufen" : "Run in Background"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      cancelBatchRef.current = true;
                      setBatchProgress((prev) =>
                        prev ? { ...prev, isCancelled: true, isFinished: true } : null
                      );
                      refreshData();
                    }}
                    className="w-full sm:w-auto text-xs font-semibold"
                  >
                    {language === "de" ? "Analyse stoppen" : "Stop Analysis"}
                  </Button>
                </>
              ) : (
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => {
                    setBatchProgress(null);
                    refreshData();
                  }}
                  className="w-full sm:w-auto text-xs font-bold"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {language === "de"
                    ? "Schließen & Vault aktualisieren"
                    : "Close & Refresh Vault"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Floating Background Task Widget (Visible when minimized & active or just completed) */}
      {batchProgress && batchProgress.isMinimized && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-3 px-4 rounded-xl border border-purple-500/50 bg-card/95 backdrop-blur-md shadow-2xl shadow-purple-950/40 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="relative flex items-center justify-center">
            {batchProgress.isFinished ? (
              <div className="h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            ) : batchProgress.isCancelled ? (
              <div className="h-7 w-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
                <AlertCircle className="h-4 w-4" />
              </div>
            ) : (
              <div className="h-7 w-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/40">
                <RefreshCw className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>

          <div
            className="flex flex-col text-xs cursor-pointer select-none"
            onClick={() =>
              setBatchProgress((prev) => (prev ? { ...prev, isMinimized: false, isOpen: true } : null))
            }
          >
            <div className="font-bold text-foreground flex items-center gap-1.5">
              <span>
                {batchProgress.isFinished
                  ? (language === "de" ? "Grok-Analyse abgeschlossen" : "Grok Analysis Completed")
                  : batchProgress.isCancelled
                  ? (language === "de" ? "Analyse angehalten" : "Analysis Paused")
                  : (language === "de" ? "Grok läuft im Hintergrund" : "Grok in Background")}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                {batchProgress.current}/{batchProgress.total}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
              {batchProgress.isFinished
                ? `${batchProgress.successCount} ${language === "de" ? "Fotos klassifiziert" : "photos classified"}`
                : batchProgress.currentTitle || (language === "de" ? "Analysiere Fotos..." : "Analyzing photos...")}
            </span>
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setBatchProgress((prev) => (prev ? { ...prev, isMinimized: false, isOpen: true } : null))
              }
              className="h-7 px-2 text-[11px] font-semibold text-purple-300 hover:text-purple-100 hover:bg-purple-500/20"
              title={language === "de" ? "Vollständiges Protokoll öffnen" : "Open full log"}
            >
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              {language === "de" ? "Öffnen" : "Expand"}
            </Button>
            {batchProgress.isFinished ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBatchProgress(null)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancelBatchRef.current = true;
                  setBatchProgress((prev) =>
                    prev ? { ...prev, isCancelled: true, isFinished: true } : null
                  );
                  refreshData();
                }}
                className="h-7 px-1.5 text-[11px] text-rose-400 hover:text-rose-200 hover:bg-rose-500/20"
                title={language === "de" ? "Analyse stoppen" : "Stop"}
              >
                {language === "de" ? "Stopp" : "Stop"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Delete Model Safety Confirmation Dialog */}
      {isDeleteModalOpen && (
        <Dialog
          open={isDeleteModalOpen}
          onOpenChange={(open) => !open && setIsDeleteModalOpen(false)}
        >
          <DialogContent className="max-w-md bg-card border-border shadow-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-rose-400">
                    {t.models.deleteModelTitle}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {model.name} ({model.channelTitle || model.telegramChannelId})
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleDeleteModel} className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  {t.models.deleteModelWarning}
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300/80 pt-1">
                  <li>
                    {model.assets?.length || 0}{" "}
                    {language === "de"
                      ? "Mediendateien werden von Festplatte gelöscht"
                      : "media files will be deleted from disk"}
                  </li>
                  <li>
                    {model.posts?.length || 0}{" "}
                    {language === "de"
                      ? "geplante & gepostete Beiträge"
                      : "scheduled & published posts"}
                  </li>
                  <li>
                    {language === "de"
                      ? "Alle Ausgaben, Einnahmen- & Payout-Einträge"
                      : "All expenses, revenue & payout records"}
                  </li>
                </ul>
              </div>

              {deleteModelError && (
                <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{deleteModelError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  {t.models.deleteModelConfirmPrompt}{" "}
                  <span className="font-mono text-rose-400 font-bold select-all bg-rose-950/40 px-1 py-0.5 rounded border border-rose-800/40">
                    {model.name}
                  </span>
                </label>
                <Input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={model.name}
                  autoFocus
                  className="font-mono text-xs border-rose-500/30 focus-visible:ring-rose-500"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeletingModel}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={
                    isDeletingModel ||
                    deleteConfirmName.trim().toLowerCase() !== model.name.trim().toLowerCase()
                  }
                  className="gap-2 font-bold"
                >
                  {isDeletingModel ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{t.models.deletingModel}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t.models.deleteModelButton}</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
