"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, Clock, ExternalLink, Filter, AlertCircle, Check, DollarSign } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";

interface ExpenseReviewClientProps {
  initialExpenses: any[];
}

export function ExpenseReviewClient({ initialExpenses }: ExpenseReviewClientProps) {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [filter, setFilter] = useState<"ALL" | "PENDING_REVIEW" | "APPROVED" | "REJECTED">("ALL");
  const [reviewingExpense, setReviewingExpense] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredExpenses = expenses.filter((e) => {
    if (filter === "ALL") return true;
    return e.status === filter;
  });

  const pendingCount = expenses.filter((e) => e.status === "PENDING_REVIEW").length;

  const handleOpenReview = (expense: any, action: "APPROVED" | "REJECTED") => {
    setReviewingExpense(expense);
    setReviewAction(action);
    setReviewNote(action === "APPROVED" ? "Legitimate marketing expense confirmed." : "");
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingExpense) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/expenses/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId: reviewingExpense.id,
          status: reviewAction,
          reviewNote,
        }),
      });

      if (res.ok) {
        setExpenses((prev) =>
          prev.map((item) =>
            item.id === reviewingExpense.id
              ? { ...item, status: reviewAction, reviewNote, reviewedAt: new Date() }
              : item
          )
        );
        setReviewingExpense(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t.adminExpenses.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.adminExpenses.subtitle}
          </p>
        </div>

        {pendingCount > 0 && (
          <Badge variant="warning" className="gap-1.5 text-xs py-1 px-3">
            <Clock className="h-3.5 w-3.5" />
            {pendingCount} {t.adminExpenses.pendingBadge}
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["ALL", "PENDING_REVIEW", "APPROVED", "REJECTED"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs"
          >
            {f === "ALL" && t.adminExpenses.tabAll}
            {f === "PENDING_REVIEW" && `${t.adminExpenses.tabPending} (${pendingCount})`}
            {f === "APPROVED" && t.adminExpenses.tabApproved}
            {f === "REJECTED" && t.adminExpenses.tabRejected}
          </Button>
        ))}
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                  <th className="p-3">{t.adminExpenses.colStatus}</th>
                  <th className="p-3">{t.adminExpenses.colDate}</th>
                  <th className="p-3">{t.adminExpenses.colChannel}</th>
                  <th className="p-3">{t.adminExpenses.colSubmittedBy}</th>
                  <th className="p-3">{t.adminExpenses.colDescription}</th>
                  <th className="p-3">{t.adminExpenses.colAmount}</th>
                  <th className="p-3">{t.adminExpenses.colReceipt}</th>
                  <th className="p-3 text-right">{t.adminExpenses.colAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {t.adminExpenses.noExpensesFound}
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        {exp.status === "APPROVED" && <Badge variant="success">{t.adminExpenses.tabApproved}</Badge>}
                        {exp.status === "PENDING_REVIEW" && <Badge variant="warning">{t.adminExpenses.tabPending}</Badge>}
                        {exp.status === "REJECTED" && <Badge variant="destructive">{t.adminExpenses.tabRejected}</Badge>}
                      </td>

                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(exp.createdAt), "dd.MM.yyyy")}
                      </td>

                      <td className="p-3 font-semibold text-foreground">
                        {exp.model?.name}
                      </td>

                      <td className="p-3 font-mono">
                        {exp.submittedBy?.name || exp.submittedBy?.email || "Master"}
                      </td>

                      <td className="p-3 max-w-xs truncate" title={exp.description}>
                        {exp.description}
                      </td>

                      <td className="p-3 font-bold text-foreground">
                        {formatUsd(exp.amountUsd)}
                      </td>

                      <td className="p-3">
                        {exp.receiptUrl ? (
                          <a
                            href={exp.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 font-mono"
                          >
                            {t.adminExpenses.colReceipt} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        {exp.status === "PENDING_REVIEW" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleOpenReview(exp, "APPROVED")}
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {t.adminExpenses.approveButton}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReview(exp, "REJECTED")}
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1"
                            >
                              <XCircle className="h-3 w-3" />
                              {t.adminExpenses.rejectButton}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            {t.adminExpenses.reviewedLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      {reviewingExpense && (
        <Dialog open={true} onOpenChange={() => setReviewingExpense(null)}>
          <DialogContent onClose={() => setReviewingExpense(null)}>
            <DialogHeader>
              <DialogTitle>
                {reviewAction === "APPROVED" ? t.adminExpenses.dialogApproveTitle : t.adminExpenses.dialogRejectTitle}
              </DialogTitle>
              <DialogDescription>
                {reviewAction === "APPROVED"
                  ? `${formatUsd(reviewingExpense.amountUsd)} - ${reviewingExpense.model?.name}`
                  : t.adminExpenses.dialogRejectDesc}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleConfirmReview} className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.adminExpenses.colChannel}:</span>
                  <span className="font-bold">{reviewingExpense.model?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.adminExpenses.colAmount}:</span>
                  <span className="font-bold text-foreground">{formatUsd(reviewingExpense.amountUsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.adminExpenses.colDescription}:</span>
                  <span className="truncate max-w-xs">{reviewingExpense.description}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {t.adminExpenses.dialogNoteLabel}
                </label>
                <Input
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={t.adminExpenses.dialogNotePlaceholder}
                />
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full ${reviewAction === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-destructive"}`}
                >
                  {isSubmitting
                    ? t.adminExpenses.submittingReview
                    : reviewAction === "APPROVED"
                    ? t.adminExpenses.confirmApproveButton
                    : t.adminExpenses.confirmRejectButton}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
