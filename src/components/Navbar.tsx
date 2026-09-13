"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw, Globe, LogOut, User, KeyRound, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<any>(null);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await fetch("/api/sync/stars", { method: "POST" });
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/me", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const isMaster = user?.role === "MASTER_ADMIN";

  return (
    <header className="h-16 border-b border-border bg-card/40 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-mono font-medium text-foreground">model.autoacts.link</span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
            VPS Live
          </Badge>
          {user && (
            <Badge variant={isMaster ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
              {isMaster ? "Master Admin" : "Investor Account"}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isMaster && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
            {isSyncing ? "Syncing MTProto..." : "Sync Stars"}
          </Button>
        )}

        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline font-mono">
              {user.name || user.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Sign Out"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Link href="/login">
            <Button variant="outline" size="sm" className="text-xs h-8">
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
