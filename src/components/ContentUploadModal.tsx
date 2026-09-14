"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileImage, FileVideo, Film, CheckCircle2, AlertCircle, RefreshCw, X, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";

interface ContentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  onUploaded?: () => void;
}

export function ContentUploadModal({
  open,
  onOpenChange,
  modelId,
  modelName,
  onUploaded,
}: ContentUploadModalProps) {
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [autoClassify, setAutoClassify] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".mkv", ".avi", ".gif"].includes(ext)) {
        validFiles.push(f);
      }
    }
    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("modelId", modelId);
      formData.append("autoClassify", String(autoClassify));

      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setSelectedFiles([]);
      onOpenChange(false);
      if (onUploaded) onUploaded();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const photoCount = selectedFiles.filter((f) => {
    const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
  }).length;

  const videoGifCount = selectedFiles.length - photoCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t.contentUpload.modalTitle}</DialogTitle>
              <DialogDescription>
                {t.contentUpload.modalDesc} ({modelName})
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

        <div className="space-y-3.5 py-1">
          {/* Drag & Drop Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "border-purple-500 bg-purple-500/10"
                : "border-border hover:border-purple-500/50 hover:bg-muted/30"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.avi,.gif"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <UploadCloud className="h-10 w-10 mx-auto mb-2 text-purple-400/80" />
            <p className="text-xs font-semibold text-foreground">
              {t.contentUpload.dragDropText}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {t.contentUpload.dragDropSubtext}
            </p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selectedFiles.length} {t.contentUpload.filesSelected}
                </span>
                <div className="flex gap-1.5">
                  {photoCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      📷 {photoCount} Foto{photoCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {videoGifCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      🎬 {videoGifCount} Video/GIF
                    </Badge>
                  )}
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {selectedFiles.map((file, idx) => {
                  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
                  const isPic = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
                  const isGif = ext === ".gif";

                  return (
                    <div
                      key={idx}
                      className="p-2 rounded-md border bg-card/60 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isPic ? (
                          <FileImage className="h-4 w-4 text-sky-400 shrink-0" />
                        ) : isGif ? (
                          <Film className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <FileVideo className="h-4 w-4 text-purple-400 shrink-0" />
                        )}
                        <span className="truncate font-medium text-foreground">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Auto-Classify Toggle */}
          <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold text-foreground">
                  Grok 4.1 Vision KI-Klassifizierung
                </span>
              </div>
              <input
                type="checkbox"
                id="autoClassify"
                checked={autoClassify}
                onChange={(e) => setAutoClassify(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t.contentUpload.autoClassifyNotice}
            </p>
            <div className="text-[10px] text-amber-400/90 font-medium pt-1 border-t border-border/40">
              🔒 {t.contentUpload.videoNotice}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="gradient"
            onClick={handleSubmit}
            disabled={isUploading || selectedFiles.length === 0}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t.contentUpload.uploadingButton}
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                {t.contentUpload.uploadButton} ({selectedFiles.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
