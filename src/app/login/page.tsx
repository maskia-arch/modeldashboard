"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, User, ArrowRight, AlertCircle, RefreshCw, KeyRound, Shield } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
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
        throw new Error(data.error || "Login fehlgeschlagen");
      }

      // Redirect based on role
      if (data.user?.role === "INVESTOR") {
        router.push("/investor");
      } else {
        router.push("/");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Ungültige Anmeldedaten");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 mx-auto flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Investor Portal</h1>
          <p className="text-xs text-muted-foreground">
            Capital Management & Performance Gateway
          </p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access your channels
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
                <label className="text-xs font-semibold text-muted-foreground">Username</label>
                <div className="relative">
                  <User className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="pl-9"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Passwort</label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
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
                    Authenticating...
                  </>
                ) : (
                  <>
                    Sign In
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
                  Have an Invitation Key? Complete Registration
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
