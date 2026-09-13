"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitchProps {
  className?: string;
  variant?: "pill" | "compact";
}

export function LanguageSwitch({ className, variant = "compact" }: LanguageSwitchProps) {
  const { language, setLanguage } = useLanguage();

  if (variant === "pill") {
    return (
      <div className={cn("inline-flex items-center gap-1 p-1 rounded-lg bg-card/80 border border-border shadow-sm text-xs font-semibold backdrop-blur-sm", className)}>
        <button
          type="button"
          onClick={() => setLanguage("de")}
          className={cn(
            "px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5",
            language === "de"
              ? "bg-primary text-primary-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>🇩🇪</span>
          <span>DE</span>
        </button>
        <button
          type="button"
          onClick={() => setLanguage("en")}
          className={cn(
            "px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5",
            language === "en"
              ? "bg-primary text-primary-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>🇬🇧</span>
          <span>EN</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/80 text-xs font-mono",
        className
      )}
    >
      <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
      <button
        type="button"
        onClick={() => setLanguage("de")}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors text-[11px]",
          language === "de"
            ? "font-bold text-foreground bg-background shadow-xs border border-border/50"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        DE
      </button>
      <span className="text-border text-[10px]">|</span>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors text-[11px]",
          language === "en"
            ? "font-bold text-foreground bg-background shadow-xs border border-border/50"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
    </div>
  );
}
