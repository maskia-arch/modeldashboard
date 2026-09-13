"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Client Application Error]:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-2">Ein Anzeigefehler ist aufgetreten</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {error?.message || "Die Anwendung konnte die Seite nicht ordnungsgemäß laden."}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()} variant="default" className="gap-2 text-xs">
          <RefreshCw className="h-4 w-4" />
          Erneut versuchen
        </Button>
        <Button onClick={() => (window.location.href = "/")} variant="outline" className="gap-2 text-xs">
          <Home className="h-4 w-4" />
          Zum Dashboard
        </Button>
      </div>
    </div>
  );
}
