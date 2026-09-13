"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck, Mail, Lock, User, Wallet, ArrowRight, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [registrationKey, setRegistrationKey] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [tonAddress, setTonAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const keyParam = searchParams.get("key");
    const emailParam = searchParams.get("email");
    if (keyParam) setRegistrationKey(keyParam);
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

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
        throw new Error(data.error || "Registration failed");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/investor");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-purple-500/20 text-purple-400 mx-auto flex items-center justify-center border border-purple-500/30">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Investor Activation</h1>
          <p className="text-xs text-muted-foreground">
            Activate your access with your official invitation key
          </p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Register Account</CardTitle>
            <CardDescription className="text-xs">
              Closed investor portal. A valid registration key is required.
            </CardDescription>
          </CardHeader>

          {success ? (
            <CardContent className="py-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold">Investor Account Activated!</h3>
              <p className="text-xs text-muted-foreground">
                Redirecting you to your channel portfolio...
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
                    Registration Key (Required)
                    <span className="text-[10px] text-purple-400 font-mono">Invitation Key</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 absolute left-3 top-2.5 text-purple-400" />
                    <Input
                      required
                      value={registrationKey}
                      onChange={(e) => setRegistrationKey(e.target.value.toUpperCase())}
                      placeholder="ACTS-INV-XXXXXXXX"
                      className="pl-9 font-mono uppercase tracking-wider"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
                  <div className="relative">
                    <User className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Markus Weber"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="investor@example.com"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Choose Password</label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Receiving TON Address (Optional)
                  </label>
                  <div className="relative">
                    <Wallet className="h-4 w-4 absolute left-3 top-2.5 text-[#0098EA]" />
                    <Input
                      value={tonAddress}
                      onChange={(e) => setTonAddress(e.target.value)}
                      placeholder="EQ... or UQ... for 100% recoupment payouts"
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
                      Validating Key & Activating...
                    </>
                  ) : (
                    <>
                      Activate Account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <Link href="/login" className="text-xs text-muted-foreground hover:underline">
                    Already registered? Sign In
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
