"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck, Mail, Lock, User, Wallet, ArrowRight, AlertCircle, RefreshCw, CheckCircle2, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLanguage } from "@/context/LanguageContext";

export const dynamic = "force-dynamic";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [registrationKey, setRegistrationKey] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [tonAddress, setTonAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const [keyInfo, setKeyInfo] = useState<{
    valid: boolean;
    role?: string;
    prefilled?: boolean;
    message?: string;
  } | null>(null);

  const verifyKey = async (keyToVerify: string) => {
    const trimmed = keyToVerify.trim().toUpperCase();
    if (!trimmed || trimmed.length < 6) {
      setKeyInfo(null);
      return;
    }
    setIsVerifyingKey(true);
    try {
      const res = await fetch(`/api/auth/register?key=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        let hasPrefilled = false;
        if (data.email) {
          setEmail(data.email);
          hasPrefilled = true;
        }
        if (data.name) {
          setName(data.name);
          hasPrefilled = true;
        }
        setKeyInfo({
          valid: true,
          role: data.role,
          prefilled: hasPrefilled || Boolean(data.email || data.name),
          message: `${t.register.keyVerifiedBadge} (${data.role === "MASTER_ADMIN" ? "Master Admin" : "Investor"})`,
        });
      } else {
        setKeyInfo({
          valid: false,
          message: data.error || t.register.errorDefault,
        });
      }
    } catch {
      setKeyInfo(null);
    } finally {
      setIsVerifyingKey(false);
    }
  };

  useEffect(() => {
    const keyParam = searchParams.get("key");
    const emailParam = searchParams.get("email");
    if (keyParam) {
      const upper = keyParam.toUpperCase();
      setRegistrationKey(upper);
      verifyKey(upper);
    }
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  const handleKeyChange = (val: string) => {
    const upper = val.toUpperCase();
    setRegistrationKey(upper);
    if (upper.length >= 10) {
      verifyKey(upper);
    } else {
      setKeyInfo(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationKey,
          email,
          name,
          password,
          tonAddress: tonAddress || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.register.errorDefault);
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/investor";
      }, 1500);
    } catch (err: any) {
      setError(err.message || t.register.errorDefault);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <LanguageSwitch variant="pill" />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-purple-500/20 text-purple-400 mx-auto flex items-center justify-center border border-purple-500/30">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{t.register.portalTitle}</h1>
          <p className="text-xs text-muted-foreground">
            {t.register.portalSubtitle}
          </p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">{t.register.cardTitle}</CardTitle>
            <CardDescription className="text-xs">
              {t.register.cardSubtitle}
            </CardDescription>
          </CardHeader>

          {success ? (
            <CardContent className="py-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold">{t.register.successTitle}</h3>
              <p className="text-xs text-muted-foreground">
                {t.register.successSubtitle}
              </p>
            </CardContent>
          ) : (
            <form onSubmit={handleRegister}>
              <CardContent className="space-y-3.5">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    {t.register.keyLabel}
                    <span className="text-[10px] text-purple-400 font-mono">{t.register.invitationBadge}</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 absolute left-3 top-2.5 text-purple-400" />
                    <Input
                      required
                      value={registrationKey}
                      onChange={(e) => handleKeyChange(e.target.value)}
                      onBlur={() => verifyKey(registrationKey)}
                      placeholder="ACTS-INV-XXXXXXXX"
                      className="pl-9 font-mono uppercase tracking-wider"
                    />
                  </div>

                  {isVerifyingKey && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1 animate-pulse">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>{t.register.keyChecking}</span>
                    </div>
                  )}

                  {keyInfo && keyInfo.valid && (
                    <div className="space-y-1.5 mt-1.5">
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">{keyInfo.message}</span>
                      </div>
                      {keyInfo.prefilled && (
                        <div className="text-[11px] text-purple-300 flex items-start gap-1.5 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-md leading-tight">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-purple-400" />
                          <span>{t.register.prefillInfoNotice}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {keyInfo && !keyInfo.valid && (
                    <div className="text-[11px] text-destructive flex items-center gap-1.5 mt-1.5 bg-destructive/10 border border-destructive/20 px-2.5 py-1 rounded-md">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{keyInfo.message}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{t.register.nameLabel}</label>
                  <div className="relative">
                    <User className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.register.namePlaceholder}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{t.register.emailLabel}</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.register.emailPlaceholder}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{t.register.passwordLabel}</label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.register.passwordPlaceholder}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t.register.tonLabel}
                  </label>
                  <div className="relative">
                    <Wallet className="h-4 w-4 absolute left-3 top-2.5 text-[#0098EA]" />
                    <Input
                      value={tonAddress}
                      onChange={(e) => setTonAddress(e.target.value)}
                      placeholder={t.register.tonPlaceholder}
                      className="pl-9 font-mono text-xs"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-3 pt-2">
                <Button type="submit" disabled={loading} className="w-full gap-2">
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {t.register.activating}
                    </>
                  ) : (
                    <>
                      {t.register.submitButton}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-xs text-muted-foreground hover:underline">
                    {t.register.alreadyRegistered}
                  </Link>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading registration portal...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
