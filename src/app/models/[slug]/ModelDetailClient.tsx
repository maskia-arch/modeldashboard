"use client";

import React, { useState } from "react";
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
import { formatUsd, formatStars, truncateAddress } from "@/lib/utils";
import type { ModelFinancials } from "@/lib/financial-engine";
import { format, formatDistanceToNow } from "date-fns";

interface InvestorItem {
  id: string;
  name: string | null;
  email: string;
}

interface ModelDetailClientProps {
  initialModel: any;
  initialFinancials: ModelFinancials;
  investors?: InvestorItem[];
  isMasterAdmin?: boolean;
}

export function ModelDetailClient({
  initialModel,
  initialFinancials,
  investors = [],
  isMasterAdmin = false,
}: ModelDetailClientProps) {
  const [model, setModel] = useState(initialModel);
  const [financials, setFinancials] = useState<ModelFinancials>(initialFinancials);
  const [isGrokModalOpen, setIsGrokModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isBatchAssetModalOpen, setIsBatchAssetModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Assign / Profit Split Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignInvestorId, setAssignInvestorId] = useState(model.investorId || "");
  const [assignSharePercent, setAssignSharePercent] = useState<number>(model.investorSharePercent ?? 50);
  const [assignEnableExpenseRecoupment, setAssignEnableExpenseRecoupment] = useState<boolean>(model.enableExpenseRecoupment !== false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

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
          investorSharePercent: parseFloat(assignSharePercent as any) || 50,
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

  const refreshData = async () => {
    try {
      const res = await fetch(`/api/models/${model.slug}`);
      if (res.ok) {
        const data = await res.json();
        setModel(data);
        setFinancials(data.financials);
      }
    } catch (e) {
      console.error(e);
    }
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
                <Badge variant="info">Direkt-Split ({model.investorSharePercent || 50}/{100 - (model.investorSharePercent || 50)} Aktiv)</Badge>
              ) : financials.isRecouped ? (
                <Badge variant="success">100% Recouped ({model.investorSharePercent || 50}/{100 - (model.investorSharePercent || 50)} Active)</Badge>
              ) : (
                <Badge variant="warning">Recouping Principal ({model.investorSharePercent || 50}%)</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Channel: {model.channelTitle || model.telegramChannelId} • ID: {model.telegramChannelId}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              {model.investor ? (
                <>
                  <span className="text-muted-foreground">Investor: <strong className="text-foreground">{model.investor.name || model.investor.email}</strong></span>
                  {model.investor.tonAddress ? (
                    <span className="font-mono text-[11px] text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/40 flex items-center gap-1">
                      💎 {truncateAddress(model.investor.tonAddress)}
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                      Wallet nicht eingerichtet
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground italic">Kein Investor zugeordnet</span>
              )}
              <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 ml-1">
                {model.investorSharePercent || 50}% Inv / {100 - (model.investorSharePercent || 50)}% Agentur
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
                  Zuweisung & Split anpassen
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
            AI Posting Plan (xAI Grok)
          </Button>

          <Button
            variant="ton"
            onClick={() => setIsPayoutModalOpen(true)}
            disabled={financials.partnerAvailablePayoutUsd <= 0}
            className="gap-2 text-xs font-semibold"
          >
            <Wallet className="h-4 w-4" />
            Log TON Payout ({formatUsd(financials.partnerAvailablePayoutUsd)})
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="pipeline" className="gap-1.5 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            Posts ({model.posts.length})
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5 text-xs">
            <ImageIcon className="h-3.5 w-3.5" />
            Vault ({model.assets.length})
          </TabsTrigger>
          <TabsTrigger value="stars" className="gap-1.5 text-xs">
            <Star className="h-3.5 w-3.5" />
            Stars ({model.starTransactions.length})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5 text-xs">
            <DollarSign className="h-3.5 w-3.5" />
            Expenses ({model.expenses.length})
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
              <h3 className="text-lg font-bold">Content Timeline & Queue</h3>
              <p className="text-xs text-muted-foreground">
                BullMQ scheduled dispatches and Telegram Bot API deliveries
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setIsGrokModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate Strategy via Grok
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">Status</th>
                      <th className="p-3">Scheduled For</th>
                      <th className="p-3">Asset</th>
                      <th className="p-3">Caption</th>
                      <th className="p-3">Stars Price</th>
                      <th className="p-3">Telegram Msg</th>
                      <th className="p-3 text-right">Manual Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.posts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No posts scheduled or published yet. Click "Generate Strategy via Grok" to create a timetable!
                        </td>
                      </tr>
                    ) : (
                      model.posts.map((post: any) => (
                        <tr key={post.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            {post.status === "PUBLISHED" && <Badge variant="success">Published</Badge>}
                            {post.status === "SCHEDULED" && <Badge variant="warning">Ready (Manual)</Badge>}
                            {post.status === "FAILED" && <Badge variant="destructive">Failed</Badge>}
                            {post.status === "DRAFT" && <Badge variant="outline">Draft</Badge>}
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
                              <span className="text-muted-foreground italic">Text only</span>
                            )}
                          </td>
                          <td className="p-3 max-w-xs truncate" title={post.caption}>
                            {post.caption}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {post.starsPrice > 0 ? (
                              <Badge variant="ppv" className="gap-1">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {post.starsPrice} Stars
                              </Badge>
                            ) : (
                              <Badge variant="teaser">Free</Badge>
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
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/posts/${post.id}/publish`, { method: "POST" });
                                    if (res.ok) await refreshData();
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }}
                                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 gap-1 font-semibold"
                              >
                                <Send className="h-3 w-3" />
                                Post Now
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Sent</span>
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
              <h3 className="text-lg font-bold">Content-Inventar & Medien-Bestand</h3>
              <p className="text-xs text-muted-foreground">
                Erfasster Bild- & Videobestand (Metadaten-first, kein Upload nötig) für automatische xAI Grok Langzeit-Planung
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setIsBatchAssetModalOpen(true)}
                className="gap-1.5 text-xs font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Stapel-Inventar anlegen (Batch)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssetModalOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Einzelnes Medium
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {model.assets.map((asset: any) => (
              <Card key={asset.id} className="overflow-hidden border group bg-card/60">
                <div className="relative aspect-square bg-muted flex flex-col items-center justify-center p-3 text-center border-b">
                  {asset.fileUrl ? (
                    <img
                      src={asset.fileUrl}
                      alt="Vault asset"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
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

                  <div className="absolute top-2 left-2 flex gap-1">
                    {asset.explicitLevel === "PPV" && <Badge variant="ppv">PPV</Badge>}
                    {asset.explicitLevel === "SOFT" && <Badge variant="soft">SOFT</Badge>}
                    {asset.explicitLevel === "TEASER" && <Badge variant="teaser">TEASER</Badge>}
                  </div>

                  {asset.isUsed && (
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="outline" className="bg-black/70 text-[10px] text-emerald-400 border-emerald-500/40">
                        Im Zeitplan
                      </Badge>
                    </div>
                  )}
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
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Telegram Stars Transactions (MTProto) */}
        <TabsContent value="stars" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Native Telegram Stars Ledger</h3>
              <p className="text-xs text-muted-foreground">
                Fetched via GramJS payments.getStarsTransactions with 21-day maturity counter
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              Maturity Rule: TxDate + 21 Days
            </Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">Status</th>
                      <th className="p-3">Transaction Date</th>
                      <th className="p-3">Matures At (21 Days)</th>
                      <th className="p-3">Stars Amount</th>
                      <th className="p-3">Estimated USD</th>
                      <th className="p-3">Telegram Tx ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.starTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          No star transactions recorded yet. They are synced automatically every 15 minutes.
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
                                  Matured (Liquid)
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="gap-1">
                                  <Lock className="h-3 w-3" />
                                  Pending Lock
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {format(new Date(tx.transactionDate), "dd.MM.yyyy HH:mm")}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {format(new Date(tx.maturesAt), "dd.MM.yyyy")}
                              <span className="text-[10px] text-muted-foreground block">
                                {isMatured ? "Matured" : `Matures ${maturesIn}`}
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
              <span>Hinweis: Für dieses Model ist die Vorab-Amortisation von Investitionsbelegen deaktiviert. Alle Umsätze fließen sofort zu {model.investorSharePercent || 50}% in den direkten Gewinn-Split. Eingetragene Ausgaben dienen lediglich der internen Dokumentation.</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Investments & Expenses</h3>
              <p className="text-xs text-muted-foreground">
                {model.enableExpenseRecoupment === false
                  ? "Direkt-Split aktiv – Keine vorrangige Amortisation von Investitionen/Belegen."
                  : `All logged expenses increase the 100% recoupment target prior to ${model.investorSharePercent || 50}/${100 - (model.investorSharePercent || 50)} profit splitting`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpenseModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Expense / Investment
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                      <th className="p-3">Description</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Amount ($ USD)</th>
                      <th className="p-3">Receipt Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.expenses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          No expenses logged yet.
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
                                View Receipt <ExternalLink className="h-3 w-3" />
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

      {/* Add Single Asset Modal (Metadata-First) */}
      <Dialog open={isAssetModalOpen} onOpenChange={setIsAssetModalOpen}>
        <DialogContent onClose={() => setIsAssetModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>Content-Inventar: Einzelnes Medium anlegen</DialogTitle>
            <DialogDescription>
              Erfasse Content-Metadaten (Art, Thema, Explizitheit) für die Grok-Zeitplanung. Kein Dateiupload erforderlich.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAsset} className="space-y-3.5 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Medientyp
                </label>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="PHOTO" className="bg-card">📷 Foto / Bild</option>
                  <option value="VIDEO" className="bg-card">🎬 Video Clip</option>
                  <option value="TEXT" className="bg-card">💬 Text / Story</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Explizitheitsgrad (Monetarisierung)
                </label>
                <select
                  value={assetLevel}
                  onChange={(e) => setAssetLevel(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="TEASER" className="bg-card">TEASER (Free / 0 Stars)</option>
                  <option value="SOFT" className="bg-card">SOFT (Promo / 0-25 Stars)</option>
                  <option value="PPV" className="bg-card">PPV (Stars Paywall 50-500)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Titel / Basis-Name
                </label>
                <Input
                  value={assetTitle}
                  onChange={(e) => setAssetTitle(e.target.value)}
                  placeholder="z.B. Strand Bikini Set"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Thema / Setting
                </label>
                <Input
                  value={assetTheme}
                  onChange={(e) => setAssetTheme(e.target.value)}
                  placeholder="z.B. Lingerie, Strand, Gym"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Anzahl / Menge
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
                ⚡ Erstellt automatisch {assetCount} nummerierte Medien-Slots (z. B. {assetTitle || "Medium"} #1 bis #{assetCount})
              </p>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Grok AI Regie-Hinweise (optional)
              </label>
              <Input
                value={assetNotes}
                onChange={(e) => setAssetNotes(e.target.value)}
                placeholder="z.B. Rotes Kleid, flirtender Blick, warmes Abendlicht"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Interne Referenz / Link / Dateipfad (optional)
              </label>
              <Input
                value={assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
                placeholder="z.B. ordner_juli/pic_01.jpg oder https://... (optional)"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingAsset} className="w-full">
                {isSavingAsset ? "Speichere..." : "In Content-Inventar aufnehmen"}
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
              <DialogTitle>Content-Inventar im Stapel anlegen (Batch)</DialogTitle>
            </div>
            <DialogDescription>
              Lege den Content-Bestand für 1–2+ Monate auf einmal fest. Das System erzeugt daraus automatisch den Vorrat für xAI Grok.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchCreateAssets} className="space-y-4 py-2">
            <div className="space-y-3">
              {batchItems.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-card/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                      Gruppe #{idx + 1}
                    </span>
                    {batchItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setBatchItems((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Entfernen
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Medientyp</label>
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
                        <option value="PHOTO" className="bg-card">📷 Foto</option>
                        <option value="VIDEO" className="bg-card">🎬 Video</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Explizitheit</label>
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
                        <option value="TEASER" className="bg-card">TEASER (Free)</option>
                        <option value="SOFT" className="bg-card">SOFT (0-25 ⭐)</option>
                        <option value="PPV" className="bg-card">PPV (Stars Paywall)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Thema / Setting</label>
                      <Input
                        className="h-8 text-xs"
                        value={item.theme}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, theme: val, baseTitle: `${val} ${it.type === "PHOTO" ? "Foto" : "Video"}` } : it))
                          );
                        }}
                        placeholder="z.B. Strand"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Anzahl (Vorrat)</label>
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
                  { type: "PHOTO", explicitLevel: "TEASER", theme: "Lifestyle / Casual", count: 10, baseTitle: "Lifestyle Foto" },
                ])
              }
            >
              <Plus className="h-3 w-3" />
              Weitere Content-Gruppe hinzufügen
            </Button>

            <div className="p-3 bg-muted/40 rounded-lg text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Gesamte neu erstellte Medien:</span>
              <span className="font-bold text-foreground">
                {batchItems.reduce((acc, it) => acc + (it.count || 0), 0)} Content-Einheiten
              </span>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingBatch} className="w-full gap-2">
                {isSavingBatch ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Erzeuge Inventar...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Inventar jetzt anlegen & freigeben
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
            <DialogTitle>Log Model Expense</DialogTitle>
            <DialogDescription>
              Record an investment to be recouped 100% prior to {model.investorSharePercent || 50}/{100 - (model.investorSharePercent || 50)} profit splitting
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Expense Description
              </label>
              <Input
                required
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="e.g. Studio photoshoot, Instagram shoutout"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Amount ($ USD)
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
                Receipt URL (optional)
              </label>
              <Input
                value={expenseReceipt}
                onChange={(e) => setExpenseReceipt(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSavingExpense} className="w-full">
                {isSavingExpense ? "Adding Expense..." : "Add Expense"}
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
              Investor & Gewinnbeteiligung zuordnen
            </DialogTitle>
            <DialogDescription>
              Legen Sie fest, welcher Investor diesen Kanal in seinem Portal einsehen kann und wie hoch seine Gewinnbeteiligung nach 100% Amortisation ist.
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
                Investor zuordnen
              </label>
              <select
                value={assignInvestorId}
                onChange={(e) => setAssignInvestorId(e.target.value)}
                className="w-full h-10 px-3 py-2 text-xs rounded-md border border-input bg-background text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Kein Investor zugeordnet (Nur Master Admin)</option>
                {investors.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name ? `${inv.name} (${inv.email})` : inv.email}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Der gewählte Investor sieht diesen Kanal sofort in seinem geschützten Investoren-Portal.
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-primary" />
                  Investor Gewinnbeteiligung (%)
                </label>
                <span className="text-xs font-mono font-bold text-primary">
                  {assignSharePercent}% Investor / {100 - assignSharePercent}% Agentur
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Prozentsatz des Reingewinns nach vollständiger 100% Amortisation aller Investitionen und Ausgaben.
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
                  Investitionsbelege & Vorab-Amortisation berücksichtigen
                </span>
              </label>
              <p className="text-[11px] text-muted-foreground pl-6">
                Wenn deaktiviert, greift eine reine Gewinnbeteiligung ab dem ersten Dollar. Investitionsbelege/Ausgaben werden nicht zur vorrangigen Tilgung herangezogen.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSavingAssign}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSavingAssign} className="gap-2">
                {isSavingAssign ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Zuweisung speichern
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
