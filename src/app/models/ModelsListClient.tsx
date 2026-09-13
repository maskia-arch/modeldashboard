"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, RefreshCw, Users, Star } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";

interface ModelsListClientProps {
  initialModels: any[];
}

export function ModelsListClient({ initialModels }: ModelsListClientProps) {
  const [models, setModels] = useState(initialModels);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [telegramChannelId, setTelegramChannelId] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [openInvestBalance, setOpenInvestBalance] = useState("0");

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
    setIsSaving(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          telegramChannelId,
          channelTitle,
          avatarUrl,
          openInvestBalance: parseFloat(openInvestBalance) || 0,
        }),
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Creator Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage model profiles, channel bindings, and individual recoupment parameters
          </p>
        </div>

        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Model
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {models.map((model) => {
          const { fin } = model;
          return (
            <Card key={model.id} className="border-border hover:border-primary/50 transition-all flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border shrink-0">
                      {model.avatarUrl ? (
                        <img src={model.avatarUrl} alt={model.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center font-bold text-muted-foreground">
                          {model.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold truncate">{model.name}</CardTitle>
                        {fin.isRecouped ? (
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
                        {model.telegramChannelId}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-1 text-xs">
                  {/* Recoupment meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Recoupment</span>
                      <span className="font-semibold text-foreground">
                        {formatUsd(fin.recoupedUsd)} / {formatUsd(fin.totalInvestTargetUsd)}
                      </span>
                    </div>
                    <Progress
                      value={fin.recoupmentProgressPercent}
                      className="h-1.5"
                      indicatorClassName={fin.isRecouped ? "bg-emerald-500" : "bg-indigo-500"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t text-muted-foreground">
                    <div>
                      <span>Locked (21d):</span>
                      <span className="font-bold text-amber-400 block text-sm">
                        {formatUsd(fin.pipeline.lockedPendingUsd)}
                      </span>
                    </div>
                    <div>
                      <span>Liquid Profit:</span>
                      <span className="font-bold text-emerald-400 block text-sm">
                        {formatUsd(fin.pipeline.availableForPayoutUsd)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="p-4 pt-0">
                <Link href={`/models/${model.slug}`}>
                  <Button variant="outline" className="w-full text-xs gap-1.5">
                    Open Model Center
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create Model Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent onClose={() => setIsModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>Register New Creator Model</DialogTitle>
            <DialogDescription>
              Set up a new model channel and initial open investment balance
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateModel} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Model Name
              </label>
              <Input
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Mia Sommer"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Slug (URL Identifier)
              </label>
              <Input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="mia-sommer"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Telegram Channel ID
              </label>
              <Input
                required
                value={telegramChannelId}
                onChange={(e) => setTelegramChannelId(e.target.value)}
                placeholder="-100..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Channel Title / Username
              </label>
              <Input
                value={channelTitle}
                onChange={(e) => setChannelTitle(e.target.value)}
                placeholder="@miasommer_vip"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Avatar Image URL
              </label>
              <Input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Initial Open Investment Balance ($ USD)
              </label>
              <Input
                type="number"
                step="0.01"
                value={openInvestBalance}
                onChange={(e) => setOpenInvestBalance(e.target.value)}
                placeholder="1000.00"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? "Creating Model..." : "Create Model"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
