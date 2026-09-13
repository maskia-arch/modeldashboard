"use client";

import React, { useState } from "react";
import {
  UserPlus,
  KeyRound,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  Clock,
  Activity,
  UserX,
  UserCheck,
  RefreshCw,
  ExternalLink,
  Info,
  Radio,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";

interface UsersClientProps {
  initialUsers: any[];
  allModels: Array<{ id: string; name: string; slug: string; telegramChannelId: string; channelTitle?: string | null }>;
}

export function UsersClient({ initialUsers, allModels }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedUserLogs, setSelectedUserLogs] = useState<any | null>(null);

  // Invite Form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{ key: string; url: string } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const [editingUserChannels, setEditingUserChannels] = useState<any | null>(null);
  const [editModelIds, setEditModelIds] = useState<string[]>([]);
  const [isSavingChannels, setIsSavingChannels] = useState(false);

  const handleToggleStatus = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isActive: !currentActive } : u))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveChannels = async () => {
    if (!editingUserChannels) return;
    setIsSavingChannels(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUserChannels.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedModelIds: editModelIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update channel assignment");
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUserChannels.id ? { ...u, assignedModels: data.assignedModels } : u))
      );
      setEditingUserChannels(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingChannels(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          assignedModelIds: selectedModelIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invitation");

      setGeneratedInvite({ key: data.registrationKey, url: data.inviteUrl });
      setUsers((prev) => [data.user, ...prev]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleModelSelection = (id: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Investor Access & Key Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate access keys, assign channels, monitor activity logs, and configure account visibility
          </p>
        </div>

        <Button onClick={() => { setGeneratedInvite(null); setIsInviteModalOpen(true); }} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Create Investor Access Key
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">Investor</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Assigned Channels</th>
                  <th className="p-3">TON Wallet (Payout)</th>
                  <th className="p-3">Registration Key</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Last Online</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => {
                  const isMaster = user.role === "MASTER_ADMIN";
                  const lastSeen = user.lastLoginAt
                    ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                    : "Never";

                  return (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-foreground">{user.name || "Investor"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{user.email}</div>
                      </td>

                      <td className="p-3">
                        {isMaster ? (
                          <Badge variant="default" className="bg-purple-600">Master Admin</Badge>
                        ) : (
                          <Badge variant="outline">Investor</Badge>
                        )}
                      </td>

                      <td className="p-3">
                        {isMaster ? (
                          <span className="text-muted-foreground italic">All Channels (Master)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {user.assignedModels?.length > 0 ? (
                              user.assignedModels.map((m: any) => (
                                <Badge key={m.id} variant="secondary" className="text-[10px]">
                                  {m.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground italic">None assigned</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {user.tonAddress ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono text-[11px] text-sky-400 bg-sky-950/30 px-1.5 py-0.5 rounded border border-sky-800/40"
                              title={user.tonAddress}
                            >
                              {user.tonAddress.slice(0, 6)}...{user.tonAddress.slice(-4)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="Copy TON Payout Address"
                              onClick={() => handleCopy(user.tonAddress, `ton-${user.id}`)}
                            >
                              {copiedKey === `ton-${user.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400 py-0 h-4">
                              Wallet Bereit
                            </Badge>
                          </div>
                        ) : isMaster ? (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] text-amber-400/80 bg-amber-950/20 border border-amber-900/30">
                            Wallet Ausstehend
                          </Badge>
                        )}
                      </td>

                      <td className="p-3 font-mono">
                        {user.registrationKey ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-purple-400">{user.registrationKey}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopy(user.registrationKey, user.id)}
                            >
                              {copiedKey === user.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      <td className="p-3">
                        {!user.isActive ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : user.isRegistered ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Invite Pending</Badge>
                        )}
                      </td>

                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="h-3 w-3" />
                          {lastSeen}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isMaster && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingUserChannels(user);
                                setEditModelIds(user.assignedModels?.map((m: any) => m.id) || []);
                              }}
                              className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                            >
                              <Radio className="h-3 w-3" />
                              Kanäle ({user.assignedModels?.length || 0})
                            </Button>
                          )}

                          {/* Logs Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedUserLogs(user)}
                            className="h-7 text-xs gap-1"
                          >
                            <Activity className="h-3 w-3" />
                            Audit Logs
                          </Button>

                          {!isMaster && (
                            <Button
                              variant={user.isActive ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleToggleStatus(user.id, user.isActive)}
                              className={`h-7 text-xs gap-1 ${
                                user.isActive ? "text-destructive hover:bg-destructive/10" : ""
                              }`}
                            >
                              {user.isActive ? (
                                <>
                                  <UserX className="h-3 w-3" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3" />
                                  Activate
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Investor Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent onClose={() => setIsInviteModalOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-purple-400" />
              <DialogTitle>Issue Investor Access Key</DialogTitle>
            </div>
            <DialogDescription>
              Create an investor pre-profile and generate a one-time registration key
            </DialogDescription>
          </DialogHeader>

          {generatedInvite ? (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center space-y-2">
                <span className="text-xs uppercase tracking-wider text-purple-400 font-semibold block">
                  Generated Registration Key
                </span>
                <div className="font-mono text-xl font-black text-foreground tracking-widest">
                  {generatedInvite.key}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-semibold">Direct Invite Link:</span>
                <div className="p-2.5 rounded-lg bg-muted/50 border font-mono text-xs break-all flex items-center justify-between">
                  <span className="truncate mr-2">{generatedInvite.url}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => handleCopy(generatedInvite.url, "invite_url")}
                  >
                    {copiedKey === "invite_url" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Send this key or invite link to the investor. They will be required to input this key during registration.
              </p>

              <DialogFooter>
                <Button onClick={() => setIsInviteModalOpen(false)} className="w-full">
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateInvite} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Investor Email
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investor@example.com"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Investor Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Markus Weber"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Assign Channel Portfolios (Investments will be channel-bound)
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-2 border rounded-lg bg-muted/20">
                  {allModels.map((m) => {
                    const isSelected = selectedModelIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleModelSelection(m.id)}
                        className={`p-2 rounded-md border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10 border-primary text-foreground" : "bg-card hover:bg-muted/40"
                        }`}
                      >
                        <span className="font-semibold">{m.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{m.telegramChannelId}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generating Key...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      Generate Registration Key & Invite
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Activity Logs Drawer / Modal */}
      {selectedUserLogs && (
        <Dialog open={true} onOpenChange={() => setSelectedUserLogs(null)}>
          <DialogContent className="max-w-xl" onClose={() => setSelectedUserLogs(null)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <DialogTitle>Audit & Activity Logs: {selectedUserLogs.name || selectedUserLogs.email}</DialogTitle>
              </div>
              <DialogDescription>
                Recorded sessions, IP addresses, and login timestamps
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {selectedUserLogs.activityLogs?.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No activity recorded yet for this user.
                </div>
              ) : (
                selectedUserLogs.activityLogs?.map((log: any) => (
                  <div key={log.id} className="p-3 rounded-lg border bg-card/60 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-primary font-mono uppercase">{log.action}</span>
                      <span className="text-muted-foreground text-[10px]">
                        {format(new Date(log.createdAt), "dd.MM.yyyy HH:mm:ss")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                      <span>IP: {log.ipAddress || "Unknown"}</span>
                      <span className="truncate max-w-[200px]" title={log.userAgent}>{log.userAgent}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setSelectedUserLogs(null)} variant="outline">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign Channels Modal */}
      {editingUserChannels && (
        <Dialog open={true} onOpenChange={() => setEditingUserChannels(null)}>
          <DialogContent className="max-w-md" onClose={() => setEditingUserChannels(null)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-indigo-400" />
                <DialogTitle>Kanal-Zuweisung für {editingUserChannels.name || editingUserChannels.email}</DialogTitle>
              </div>
              <DialogDescription>
                Wähle die Creator-Kanäle aus, deren Statistiken und Einnahmen dieser Investor im Dashboard einsehen darf.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allModels.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Keine Creator-Kanäle im System angelegt.
                </div>
              ) : (
                allModels.map((model) => {
                  const isAssigned = editModelIds.includes(model.id);
                  return (
                    <div
                      key={model.id}
                      onClick={() => {
                        setEditModelIds((prev) =>
                          prev.includes(model.id)
                            ? prev.filter((id) => id !== model.id)
                            : [...prev, model.id]
                        );
                      }}
                      className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-all ${
                        isAssigned
                          ? "bg-indigo-950/30 border-indigo-500/50 text-foreground"
                          : "bg-card/60 border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-foreground">{model.name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{model.channelTitle || model.telegramChannelId}</div>
                      </div>
                      <Badge variant={isAssigned ? "default" : "outline"}>
                        {isAssigned ? "Sichtbar" : "Gesperrt"}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button onClick={() => setEditingUserChannels(null)} variant="outline" size="sm">
                Abbrechen
              </Button>
              <Button onClick={handleSaveChannels} disabled={isSavingChannels} size="sm" className="gap-1.5">
                {isSavingChannels ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Zuweisung speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
