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
  Pencil,
  Trash2,
  Lock,
  Wallet,
  Eye,
  EyeOff,
  User,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, formatDistanceToNow } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

interface UsersClientProps {
  initialUsers: any[];
  allModels: Array<{ id: string; name: string; slug: string; telegramChannelId: string; channelTitle?: string | null }>;
}

export function UsersClient({ initialUsers, allModels }: UsersClientProps) {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState(initialUsers);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedUserLogs, setSelectedUserLogs] = useState<any | null>(null);

  // Invite Form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteRole, setInviteRole] = useState<"INVESTOR" | "MASTER_ADMIN">("INVESTOR");
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

  // Full User Edit Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTonAddress, setEditTonAddress] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editRole, setEditRole] = useState<"INVESTOR" | "MASTER_ADMIN">("INVESTOR");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editAssignedModelIds, setEditAssignedModelIds] = useState<string[]>([]);
  const [editActiveTab, setEditActiveTab] = useState<string>("general");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  const isRootMaster = (userToCheck: any) => {
    if (!userToCheck?.email) return false;
    return userToCheck.email.toLowerCase() === "admin@autoacts.link".toLowerCase();
  };

  const handleOpenEditModal = (userToEdit: any) => {
    setEditingUser(userToEdit);
    setEditName(userToEdit.name || "");
    setEditEmail(userToEdit.email || "");
    setEditTonAddress(userToEdit.tonAddress || "");
    setEditPassword("");
    setShowPassword(false);
    setEditRole(userToEdit.role);
    setEditIsActive(userToEdit.isActive !== false);
    setEditAssignedModelIds(userToEdit.assignedModels?.map((m: any) => m.id) || []);
    setEditActiveTab("general");
    setEditError(null);
    setEditSuccess(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSavingEdit(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          tonAddress: editTonAddress,
          password: editPassword.trim() || undefined,
          role: editRole,
          isActive: editIsActive,
          assignedModelIds: editRole === "INVESTOR" ? editAssignedModelIds : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Speichern der Benutzerdaten");

      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...data } : u))
      );
      setEditSuccess(t.adminUsers.userUpdated || "Benutzer erfolgreich aktualisiert");
      setTimeout(() => {
        setEditingUser(null);
      }, 700);
    } catch (err: any) {
      setEditError(err.message || "Fehler beim Speichern");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!editingUser) return;
    if (!window.confirm(t.adminUsers.regenerateKeyWarning)) return;
    setIsRegeneratingKey(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateKey: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Neugenerieren des Registrierungsschlüssels");

      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...data } : u))
      );
      setEditingUser((prev: any) => ({ ...prev, registrationKey: data.registrationKey, isRegistered: false }));
      setEditSuccess("Registrierungsschlüssel erfolgreich neu generiert!");
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const handleDeleteUser = async (userToDelete: any) => {
    if (!window.confirm(`${t.adminUsers.deleteUserConfirm}\n\n${userToDelete.name || userToDelete.email || userToDelete.id}`)) {
      return;
    }
    setIsDeletingUser(true);

    try {
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Löschen des Benutzers");

      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      if (editingUser?.id === userToDelete.id) {
        setEditingUser(null);
      }
    } catch (err: any) {
      alert(err.message || "Fehler beim Löschen");
    } finally {
      setIsDeletingUser(false);
    }
  };

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

  const handleRoleToggle = async (user: any) => {
    const newRole = user.role === "MASTER_ADMIN" ? "INVESTOR" : "MASTER_ADMIN";
    const targetLabel = newRole === "MASTER_ADMIN" ? "Master Admin" : "Investor";
    if (!window.confirm(`${t.adminUsers.changeRolePrompt}\n\n${user.name || user.email} ➔ ${targetLabel}`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rollenänderung fehlgeschlagen");

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      alert(err.message);
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
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          name: name.trim() || undefined,
          role: inviteRole,
          assignedModelIds: inviteRole === "INVESTOR" ? selectedModelIds : [],
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
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.adminUsers.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.adminUsers.subtitle}
          </p>
        </div>

        <Button onClick={() => { setGeneratedInvite(null); setInviteRole("INVESTOR"); setSelectedModelIds([]); setEmail(""); setName(""); setIsInviteModalOpen(true); }} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {t.adminUsers.createKey}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left whitespace-nowrap">
                  <th className="p-3">Investor / User</th>
                  <th className="p-3">{t.adminUsers.roleLabel}</th>
                  <th className="p-3">{t.adminUsers.assignedChannels}</th>
                  <th className="p-3">TON Wallet (Payout)</th>
                  <th className="p-3">Registration Key</th>
                  <th className="p-3">{t.adminUsers.status}</th>
                  <th className="p-3">{t.adminUsers.lastSeen}</th>
                  <th className="p-3 text-right">{t.adminUsers.actions}</th>
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
                      {/* Investor / User */}
                      <td className="p-3">
                        <div className="font-bold text-foreground">
                          {user.name || (isMaster ? "Master Admin" : (user.isRegistered ? "Investor" : "Investor (ausstehend)"))}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]" title={user.email || ""}>
                          {user.email || (
                            <span className="italic text-muted-foreground/60">
                              {language === "de" ? "Wird bei Registrierung gewählt" : "Set during registration"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isMaster ? (
                            <Badge variant="default" className="bg-purple-600 font-semibold text-[10px]">
                              Master Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-semibold text-[10px]">
                              Investor
                            </Badge>
                          )}
                          {!isRootMaster(user) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t.adminUsers.changeRole}
                              onClick={() => handleRoleToggle(user)}
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            >
                              <Shield className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>

                      {/* Assigned Channels */}
                      <td className="p-3 max-w-[180px]">
                        {isMaster ? (
                          <span className="text-muted-foreground italic text-[11px]">
                            {language === "de" ? "Alle Kanäle (Master)" : "All Channels (Master)"}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 items-center">
                            {user.assignedModels?.length > 0 ? (
                              <>
                                {user.assignedModels.slice(0, 2).map((m: any) => (
                                  <Badge key={m.id} variant="secondary" className="text-[10px] truncate max-w-[90px]">
                                    {m.name}
                                  </Badge>
                                ))}
                                {user.assignedModels.length > 2 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    +{user.assignedModels.length - 2}
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">
                                {language === "de" ? "Keine zugeordnet" : "None assigned"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* TON Wallet */}
                      <td className="p-3 whitespace-nowrap">
                        {user.tonAddress ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono text-[11px] text-sky-400 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-800/40"
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
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Wallet Bereit" />
                          </div>
                        ) : isMaster ? (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        ) : (
                          <span className="text-[11px] text-amber-400/80 italic">
                            {language === "de" ? "Nicht hinterlegt" : "Not configured"}
                          </span>
                        )}
                      </td>

                      {/* Registration Key */}
                      <td className="p-3 font-mono whitespace-nowrap">
                        {user.registrationKey ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-purple-400 text-[11px]">
                              {user.registrationKey}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Copy Key"
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

                      {/* Status */}
                      <td className="p-3 whitespace-nowrap">
                        {!user.isActive ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {language === "de" ? "Gesperrt" : "Suspended"}
                          </Badge>
                        ) : user.isRegistered ? (
                          <Badge variant="success" className="text-[10px]">
                            {language === "de" ? "Aktiv" : "Active"}
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">
                            {language === "de" ? "Einladung offen" : "Invite Pending"}
                          </Badge>
                        )}
                      </td>

                      {/* Last Seen */}
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="h-3 w-3" />
                          {lastSeen}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Primary Edit Button */}
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleOpenEditModal(user)}
                            className="h-7 text-xs gap-1.5 px-2.5 font-medium bg-primary/20 text-primary-foreground border border-primary/40 hover:bg-primary/30"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>{t.adminUsers.editUser}</span>
                          </Button>

                          {/* Quick Channels Button */}
                          {!isMaster && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingUserChannels(user);
                                setEditModelIds(user.assignedModels?.map((m: any) => m.id) || []);
                              }}
                              className="h-7 text-xs px-2 gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              title={language === "de" ? "Kanäle zuweisen" : "Assign channels"}
                            >
                              <Radio className="h-3 w-3" />
                              <span>({user.assignedModels?.length || 0})</span>
                            </Button>
                          )}

                          {/* Audit Logs Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedUserLogs(user)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Audit Logs"
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </Button>

                          {/* Toggle Active/Suspend */}
                          {!isRootMaster(user) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(user.id, user.isActive)}
                              className={cn(
                                "h-7 w-7 p-0",
                                user.isActive ? "text-destructive hover:bg-destructive/10" : "text-emerald-400 hover:bg-emerald-500/10"
                              )}
                              title={user.isActive ? (language === "de" ? "Benutzer sperren" : "Suspend user") : (language === "de" ? "Benutzer aktivieren" : "Activate user")}
                            >
                              {user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
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

      {/* Comprehensive Edit Investor / User Modal */}
      {editingUser && (
        <Dialog open={true} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onClose={() => setEditingUser(null)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                <DialogTitle>{t.adminUsers.editUserTitle}</DialogTitle>
              </div>
              <DialogDescription>
                {t.adminUsers.editUserSubtitle}: <strong>{editingUser.name || editingUser.email || "Investor"}</strong>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
              <Tabs value={editActiveTab} onValueChange={setEditActiveTab} className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="general" className="text-xs gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>{language === "de" ? "Stammdaten & Wallet" : "Profile & Wallet"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="channels" className="text-xs gap-1.5">
                    <Radio className="h-3.5 w-3.5" />
                    <span>{t.adminUsers.assignedChannels} ({editAssignedModelIds.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="security" className="text-xs gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    <span>{language === "de" ? "Passwort & Key" : "Password & Key"}</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: General & Wallet */}
                <TabsContent value="general" className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        {t.adminUsers.nameLabel}
                      </label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="z.B. Testinvestor"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        {t.adminUsers.emailLabel}
                      </label>
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="investor@example.com"
                      />
                    </div>
                  </div>

                  {/* Role Selection */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                      {t.adminUsers.roleLabel}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isRootMaster(editingUser)}
                        onClick={() => setEditRole("INVESTOR")}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all",
                          editRole === "INVESTOR"
                            ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                            : "border-border bg-card text-muted-foreground hover:border-border/80",
                          isRootMaster(editingUser) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <Radio className="h-3 w-3 text-primary" />
                          {t.adminUsers.roleInvestor}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                          {t.adminUsers.roleInvestorDesc}
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={isRootMaster(editingUser)}
                        onClick={() => setEditRole("MASTER_ADMIN")}
                        className={cn(
                          "p-2.5 rounded-lg border text-left transition-all",
                          editRole === "MASTER_ADMIN"
                            ? "border-purple-500 bg-purple-500/10 text-foreground ring-1 ring-purple-500"
                            : "border-border bg-card text-muted-foreground hover:border-border/80",
                          isRootMaster(editingUser) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="font-semibold text-xs text-purple-400 flex items-center gap-1.5">
                          <Shield className="h-3 w-3 text-purple-400" />
                          {t.adminUsers.roleMaster}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                          {t.adminUsers.roleMasterDesc}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Status Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <div className="text-xs font-semibold text-foreground">{t.adminUsers.accountStatusLabel}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {editIsActive ? t.adminUsers.accountActive : t.adminUsers.accountSuspended}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={editIsActive ? "outline" : "destructive"}
                      size="sm"
                      disabled={isRootMaster(editingUser)}
                      onClick={() => setEditIsActive(!editIsActive)}
                      className="gap-1.5 text-xs h-8"
                    >
                      {editIsActive ? (
                        <>
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                          <span>{language === "de" ? "Account sperren" : "Suspend Account"}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>{language === "de" ? "Account aktivieren" : "Activate Account"}</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* TON Wallet Address */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-sky-400" />
                        {t.adminUsers.tonWalletLabel}
                      </span>
                      {editTonAddress && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {language === "de" ? "Wallet konfiguriert" : "Wallet configured"}
                        </span>
                      )}
                    </label>
                    <Input
                      value={editTonAddress}
                      onChange={(e) => setEditTonAddress(e.target.value)}
                      placeholder={t.adminUsers.tonWalletPlaceholder}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.adminUsers.tonWalletHint}
                    </p>
                  </div>
                </TabsContent>

                {/* Tab 2: Channels */}
                <TabsContent value="channels" className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-foreground">{t.adminUsers.assignedChannelsTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{t.adminUsers.assignedChannelsHint}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditAssignedModelIds(allModels.map((m) => m.id))}
                      >
                        {language === "de" ? "Alle wählen" : "Select All"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditAssignedModelIds([])}
                      >
                        {language === "de" ? "Keine" : "Clear"}
                      </Button>
                    </div>
                  </div>

                  {editRole === "MASTER_ADMIN" ? (
                    <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Shield className="h-4 w-4" />
                        {language === "de" ? "Master-Admin Zugriff" : "Master Admin Access"}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {language === "de"
                          ? "Master Admins haben automatisch vollen Zugriff auf alle Kanäle. Eine selektive Zuweisung ist nicht erforderlich."
                          : "Master Admins automatically have full access to all channels. Selective assignment is not applicable."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 border rounded-lg p-2 bg-muted/20">
                      {allModels.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          {language === "de" ? "Keine Creator-Kanäle vorhanden." : "No creator channels available."}
                        </div>
                      ) : (
                        allModels.map((m) => {
                          const isAssigned = editAssignedModelIds.includes(m.id);
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                setEditAssignedModelIds((prev) =>
                                  prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                );
                              }}
                              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                                isAssigned
                                  ? "bg-primary/10 border-primary text-foreground font-semibold"
                                  : "bg-card border-border text-muted-foreground hover:bg-muted/40"
                              }`}
                            >
                              <div>
                                <div>{m.name}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {m.channelTitle || m.telegramChannelId}
                                </div>
                              </div>
                              <Badge variant={isAssigned ? "default" : "outline"} className="text-[10px]">
                                {isAssigned ? (language === "de" ? "Zugewiesen" : "Assigned") : (language === "de" ? "Nicht aktiv" : "Inactive")}
                              </Badge>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 3: Security, Password & Danger Zone */}
                <TabsContent value="security" className="space-y-4 pt-2">
                  {/* Reset Password */}
                  <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      {t.adminUsers.newPasswordLabel}
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder={t.adminUsers.newPasswordPlaceholder}
                        className="pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t.adminUsers.newPasswordHint}
                    </p>
                  </div>

                  {/* Registration Key & Reset */}
                  <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-purple-400" />
                      {t.adminUsers.keySectionTitle}
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-md bg-card border font-mono text-xs">
                      <div>
                        <span className="text-muted-foreground mr-2">{t.adminUsers.currentKey}</span>
                        <span className="font-bold text-purple-400">
                          {editingUser.registrationKey || "—"}
                        </span>
                      </div>
                      {editingUser.registrationKey && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleCopy(editingUser.registrationKey, "modal-key")}
                        >
                          {copiedKey === "modal-key" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRegeneratingKey}
                      onClick={handleRegenerateKey}
                      className="w-full text-xs gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                    >
                      {isRegeneratingKey ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      <span>{t.adminUsers.regenerateKeyButton}</span>
                    </Button>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {t.adminUsers.regenerateKeyWarning}
                    </p>
                  </div>

                  {/* Danger Zone: Delete User */}
                  <div className="p-3.5 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
                    <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {t.adminUsers.deleteUserTitle}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {language === "de"
                        ? "Löscht das Benutzerkonto unwiderruflich. Zugeordnete Modelle werden wieder freigegeben."
                        : "Permanently deletes the user account. Assigned models will be unlinked."}
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isDeletingUser || isRootMaster(editingUser)}
                      onClick={() => handleDeleteUser(editingUser)}
                      className="gap-1.5 text-xs w-full"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t.adminUsers.deleteUserButton}</span>
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {editError && (
                <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  {editSuccess}
                </div>
              )}

              <DialogFooter className="gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingEdit}
                  size="sm"
                  className="gap-1.5"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{t.adminUsers.saving}</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{t.adminUsers.saveChanges}</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Invite Investor Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent onClose={() => setIsInviteModalOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-purple-400" />
              <DialogTitle>{t.adminUsers.dialogTitle}</DialogTitle>
            </div>
            <DialogDescription>
              {t.adminUsers.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          {generatedInvite ? (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center space-y-2">
                <span className="text-xs uppercase tracking-wider text-purple-400 font-semibold block">
                  {language === "de" ? "Generierter Registrierungsschlüssel" : "Generated Registration Key"}
                </span>
                <div className="font-mono text-xl font-black text-foreground tracking-widest">
                  {generatedInvite.key}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-semibold">{language === "de" ? "Direkter Einladungslink:" : "Direct Invite Link:"}</span>
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
                {language === "de"
                  ? "Sende diesen Schlüssel oder Einladungslink an den Investor. Er muss diesen Schlüssel bei der Registrierung angeben."
                  : "Send this key or invite link to the investor. They will be required to input this key during registration."}
              </p>

              <DialogFooter>
                <Button onClick={() => setIsInviteModalOpen(false)} className="w-full">
                  {language === "de" ? "Fertig" : "Done"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateInvite} className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs space-y-1 text-muted-foreground">
                <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {language === "de" ? "E-Mail & Name sind rein optional" : "Email & name are purely optional"}
                </div>
                <p className="text-[11px] leading-relaxed">
                  {t.adminUsers.prefillHint}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.adminUsers.emailOptionalLabel}
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="z.B. user@example.com (optional)"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.adminUsers.nameOptionalLabel}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Markus Weber (optional)"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  {t.adminUsers.roleLabel}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole("INVESTOR")}
                    className={cn(
                      "p-2.5 rounded-lg border text-left transition-all",
                      inviteRole === "INVESTOR"
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                        : "border-border bg-card text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      <Radio className="h-3 w-3 text-primary" />
                      {t.adminUsers.roleInvestor}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                      {t.adminUsers.roleInvestorDesc}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole("MASTER_ADMIN")}
                    className={cn(
                      "p-2.5 rounded-lg border text-left transition-all",
                      inviteRole === "MASTER_ADMIN"
                        ? "border-purple-500 bg-purple-500/10 text-foreground ring-1 ring-purple-500"
                        : "border-border bg-card text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="font-semibold text-xs text-purple-400 flex items-center gap-1.5">
                      <Shield className="h-3 w-3 text-purple-400" />
                      {t.adminUsers.roleMaster}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                      {t.adminUsers.roleMasterDesc}
                    </div>
                  </button>
                </div>
              </div>

              {inviteRole === "INVESTOR" ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    {language === "de" ? "Kanal-Portfolios zuweisen (Investitionen sind kanalgebunden)" : "Assign Channel Portfolios (Investments will be channel-bound)"}
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
              ) : (
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 space-y-1">
                  <span className="font-semibold block flex items-center gap-1.5 text-purple-200">
                    <Shield className="h-3.5 w-3.5" />
                    {language === "de" ? "Voller Master Administrator Zugriff" : "Full Master Administrator Access"}
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    {language === "de"
                      ? "Master Admins haben automatischen Zugriff auf alle Creator Models, das gesamte Finanz-Hauptbuch, Beleggenehmigungen und Systemeinstellungen."
                      : "Master Admins have automatic access to all Creator Models, the complete financial ledger, expense reviews, and system settings."}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {language === "de" ? "Erzeuge Schlüssel..." : "Generating Key..."}
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      {language === "de" ? "Registrierungsschlüssel erzeugen" : "Generate Registration Key & Invite"}
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
                {language === "de" ? "Protokollierte Sitzungen, IP-Adressen und Anmelde-Zeitstempel" : "Recorded sessions, IP addresses, and login timestamps"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {selectedUserLogs.activityLogs?.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  {language === "de" ? "Noch keine Aktivitäten für diesen Benutzer protokolliert." : "No activity recorded yet for this user."}
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
                {t.common.close}
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
                <DialogTitle>{language === "de" ? "Kanal-Zuweisung für" : "Channel Assignment for"} {editingUserChannels.name || editingUserChannels.email}</DialogTitle>
              </div>
              <DialogDescription>
                {language === "de"
                  ? "Wähle die Creator-Kanäle aus, deren Statistiken und Einnahmen dieser Investor im Dashboard einsehen darf."
                  : "Select the creator channels whose statistics and revenues this investor is allowed to view in the dashboard."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allModels.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {language === "de" ? "Keine Creator-Kanäle im System angelegt." : "No creator channels registered in system."}
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
                        {isAssigned ? (language === "de" ? "Sichtbar" : "Visible") : (language === "de" ? "Gesperrt" : "Locked")}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button onClick={() => setEditingUserChannels(null)} variant="outline" size="sm">
                {t.common.cancel}
              </Button>
              <Button onClick={handleSaveChannels} disabled={isSavingChannels} size="sm" className="gap-1.5">
                {isSavingChannels ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {language === "de" ? "Zuweisung speichern" : "Save Assignment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
