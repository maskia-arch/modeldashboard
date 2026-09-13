"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, User, ArrowRight, AlertCircle, RefreshCw, KeyRound, Shield } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLanguage } from "@/context/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.login.errorFailed);
      }

      // Redirect based on role with full window reload to reset layout and apply session
      if (data.user?.role === "INVESTOR") {
        window.location.href = "/investor";
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err.message || t.login.errorDefault);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 relative">
      {/* Top right language switch */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <LanguageSwitch variant="pill" />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 mx-auto flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{t.login.portalTitle}</h1>
          <p className="text-xs text-muted-foreground">
            {t.login.portalSubtitle}
          </p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">{t.login.cardTitle}</CardTitle>
            <CardDescription className="text-xs">
              {t.login.cardSubtitle}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{t.login.usernameLabel}</label>
                <div className="relative">
                  <User className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t.login.usernamePlaceholder}
                    className="pl-9"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{t.login.passwordLabel}</label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.login.passwordPlaceholder}
                    className="pl-9"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3">
              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t.login.authenticating}
                  </>
                ) : (
                  <>
                    {t.login.submitButton}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="text-center">
                <Link
                  href="/register"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <KeyRound className="h-3 w-3" />
                  {t.login.haveKey}
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
