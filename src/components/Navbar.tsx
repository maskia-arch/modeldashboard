"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { RefreshCw, Globe, LogOut, User, KeyRound, Shield, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLanguage } from "@/context/LanguageContext";
import { useNavigation } from "@/context/NavigationContext";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const { toggleMobileMenu } = useNavigation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

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

  const isMaster = user?.role ? user.role === "MASTER_ADMIN" : !pathname.startsWith("/investor");

  return (
    <header className="h-16 border-b border-border bg-card/40 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMobileMenu}
          aria-label="Navigation Menu"
          className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="font-mono font-medium text-foreground hidden sm:inline">model.autoacts.link</span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal hidden sm:inline-flex">
            {t.navbar.vpsLive}
          </Badge>
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
            {isMaster ? t.navbar.partner : t.navbar.investor}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Bilingual Switcher */}
        <LanguageSwitch />

        {isMaster && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
            {isSyncing ? t.navbar.syncing : t.navbar.syncStars}
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
              title={t.navbar.signOut}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Link href="/login">
            <Button variant="outline" size="sm" className="text-xs h-8">
              {t.navbar.signIn}
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
