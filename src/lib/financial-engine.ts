/**
 * Financial Engine & Channel-Specific Recoupment Calculator
 * 
 * Rules:
 * 1. Channel-Specific Isolation:
 *    Investments/expenses are strictly bound to an individual channel/model.
 *    Revenues from Channel A only recoup Channel A's approved expenses.
 * 2. Legitimation Workflow:
 *    Only expenses with status = 'APPROVED' enter the recoupment ledger.
 *    Pending review and rejected expenses do NOT count toward recoupment.
 * 3. 100% Recoupment Entitlement:
 *    Until the channel's approved investment is 100% amortized, the investor receives
 *    100% of all MATURED revenue from that channel.
 * 4. Post-Recoupment 50/50 Profit Split:
 *    Once the channel's investment reaches $0, further MATURED revenue is split
 *    50% to the Investor and 50% to Management.
 * 5. 21-Day Telegram Escrow:
 *    Revenue < 21 days old sits in Locked / Pending status.
 */

export interface ExpenseRecord {
  amountUsd: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
}

export interface StarTxRecord {
  starsAmount: number;
  estimatedUsd: number;
  status: 'PENDING' | 'MATURED';
  transactionDate: Date;
  maturesAt: Date;
}

export interface PayoutRecord {
  amountUsd: number;
  paidAt: Date;
}

export interface ChannelFinancials {
  modelId: string;
  modelName?: string;
  channelTitle?: string | null;
  slug?: string;
  avatarUrl?: string | null;
  
  // Investments
  totalApprovedInvestUsd: number;
  totalInvestTargetUsd: number; // Alias for backward compatibility
  pendingReviewInvestUsd: number;
  
  // Revenue
  totalPendingUsd: number;   // In 21-day holding period
  totalMaturedUsd: number;   // Liquid revenue on Telegram
  totalGrossRevenueUsd: number;

  // Recoupment & Amortization
  enableExpenseRecoupment: boolean; // True: 100% recoupment first. False: direct profit split, no investment deduction.
  recoupedUsd: number;
  remainingInvestBalanceUsd: number;
  isRecouped: boolean;
  recoupmentProgressPercent: number;

  // Investor Share Calculation
  // While recouping: Investor gets 100% of matured funds.
  // After recouping: Investor gets 100% of recouped amount + X% of gross profit.
  investorSharePercent: number;
  managementSharePercent: number;
  grossProfitUsd: number;
  partnerTotalShareUsd: number; // Share alias
  investorGrossEarningsUsd: number; 
  managementTotalShareUsd: number;
  
  // Payouts & Liquid Available
  totalPaidOutUsd: number;
  investorAvailablePayoutUsd: number;
  partnerAvailablePayoutUsd: number; // Alias for backward compatibility

  pipeline: {
    lockedPendingUsd: number;
    recoupingUsd: number;
    availableForPayoutUsd: number;
  };
}

export type ModelFinancials = ChannelFinancials;

export interface InvestorPortfolio {
  investorId: string;
  totalChannels: number;
  totalApprovedInvestUsd: number;
  totalPendingReviewInvestUsd: number;
  totalPendingUsd: number;
  totalMaturedUsd: number;
  totalGrossRevenueUsd: number;
  totalRecoupedUsd: number;
  totalRemainingInvestBalanceUsd: number;
  totalInvestorEarningsUsd: number;
  totalPaidOutUsd: number;
  totalAvailablePayoutUsd: number;
  channels: ChannelFinancials[];
}

/**
 * Calculates channel-specific financial metrics.
 * Enforces: only APPROVED expenses count, 100% recoupment first, then 50/50 split.
 */
export function calculateChannelFinancials(
  modelId: string,
  baseInvestBalance: number,
  expenses: ExpenseRecord[],
  transactions: StarTxRecord[],
  payouts: PayoutRecord[],
  meta?: {
    modelName?: string;
    channelTitle?: string | null;
    slug?: string;
    avatarUrl?: string | null;
    investorSharePercent?: number | null;
    enableExpenseRecoupment?: boolean | null;
  }
): ChannelFinancials {
  const enableExpenseRecoupment = meta?.enableExpenseRecoupment !== false;

  // 1. Separate approved vs pending review expenses
  let approvedExpensesSum = 0;
  let pendingReviewInvestUsd = 0;

  for (const exp of expenses) {
    if (exp.status === 'APPROVED') {
      approvedExpensesSum += Number(exp.amountUsd || 0);
    } else if (exp.status === 'PENDING_REVIEW') {
      pendingReviewInvestUsd += Number(exp.amountUsd || 0);
    }
  }

  // Approved invest target is max of base initial balance or approved logged expenses
  const totalApprovedInvestUsd = enableExpenseRecoupment
    ? Number(Math.max(baseInvestBalance, approvedExpensesSum).toFixed(2))
    : 0;
  pendingReviewInvestUsd = Number(pendingReviewInvestUsd.toFixed(2));

  // 2. Aggregate transactions
  let totalPendingUsd = 0;
  let totalMaturedUsd = 0;

  for (const tx of transactions) {
    const amount = Number(tx.estimatedUsd || 0);
    if (tx.status === 'PENDING') {
      totalPendingUsd += amount;
    } else if (tx.status === 'MATURED') {
      totalMaturedUsd += amount;
    }
  }

  totalPendingUsd = Number(totalPendingUsd.toFixed(2));
  totalMaturedUsd = Number(totalMaturedUsd.toFixed(2));
  const totalGrossRevenueUsd = Number((totalPendingUsd + totalMaturedUsd).toFixed(2));

  // 3. Profit split ratios
  const sharePercent = typeof meta?.investorSharePercent === "number" && !isNaN(meta.investorSharePercent)
    ? Math.max(0, Math.min(100, meta.investorSharePercent))
    : 50.0;
  const managementSharePercent = Number((100 - sharePercent).toFixed(1));
  const investorRatio = sharePercent / 100;
  const managementRatio = managementSharePercent / 100;

  let recoupedUsd: number;
  let remainingInvestBalanceUsd: number;
  let isRecouped: boolean;
  let recoupmentProgressPercent: number;
  let grossProfitUsd: number;
  let investorProfitShareUsd: number;
  let managementTotalShareUsd: number;
  let investorGrossEarningsUsd: number;

  if (!enableExpenseRecoupment) {
    // DIRECT SPLIT MODE (No investment/expense recoupment hurdle)
    recoupedUsd = 0;
    remainingInvestBalanceUsd = 0;
    isRecouped = true;
    recoupmentProgressPercent = 100;
    grossProfitUsd = totalMaturedUsd;
    investorProfitShareUsd = Number((grossProfitUsd * investorRatio).toFixed(2));
    managementTotalShareUsd = Number((grossProfitUsd * managementRatio).toFixed(2));
    investorGrossEarningsUsd = investorProfitShareUsd;
  } else {
    // 100% RECOUPMENT FIRST MODE
    recoupedUsd = Number(Math.min(totalMaturedUsd, totalApprovedInvestUsd).toFixed(2));
    remainingInvestBalanceUsd = Number(Math.max(0, totalApprovedInvestUsd - totalMaturedUsd).toFixed(2));
    isRecouped = remainingInvestBalanceUsd === 0;
    recoupmentProgressPercent = totalApprovedInvestUsd > 0
      ? Number(Math.min(100, (recoupedUsd / totalApprovedInvestUsd) * 100).toFixed(1))
      : 100;

    grossProfitUsd = Number(Math.max(0, totalMaturedUsd - totalApprovedInvestUsd).toFixed(2));
    investorProfitShareUsd = Number((grossProfitUsd * investorRatio).toFixed(2));
    managementTotalShareUsd = Number((grossProfitUsd * managementRatio).toFixed(2));

    // Total gross amount earned by investor from this channel:
    // Recouped investment (100%) + X% of any profit beyond recoupment
    investorGrossEarningsUsd = Number((recoupedUsd + investorProfitShareUsd).toFixed(2));
  }

  // 5. Payouts deduction
  const totalPaidOutUsd = Number(
    payouts.reduce((acc, p) => acc + (p.amountUsd || 0), 0).toFixed(2)
  );
  const investorAvailablePayoutUsd = Number(
    Math.max(0, investorGrossEarningsUsd - totalPaidOutUsd).toFixed(2)
  );

  // 6. Pipeline metrics
  const pipeline = {
    lockedPendingUsd: totalPendingUsd,
    recoupingUsd: recoupedUsd,
    availableForPayoutUsd: investorAvailablePayoutUsd,
  };

  return {
    modelId,
    modelName: meta?.modelName,
    channelTitle: meta?.channelTitle,
    slug: meta?.slug,
    avatarUrl: meta?.avatarUrl,
    enableExpenseRecoupment,
    investorSharePercent: sharePercent,
    managementSharePercent,
    totalApprovedInvestUsd,
    totalInvestTargetUsd: totalApprovedInvestUsd,
    pendingReviewInvestUsd,
    totalPendingUsd,
    totalMaturedUsd,
    totalGrossRevenueUsd,
    recoupedUsd,
    remainingInvestBalanceUsd,
    isRecouped,
    recoupmentProgressPercent,
    grossProfitUsd,
    partnerTotalShareUsd: investorProfitShareUsd,
    investorGrossEarningsUsd,
    managementTotalShareUsd,
    totalPaidOutUsd,
    investorAvailablePayoutUsd,
    partnerAvailablePayoutUsd: investorAvailablePayoutUsd,
    pipeline,
  };
}

/**
 * Aggregates multiple channels for an Investor's overall portfolio view.
 * Ensures accounting remains strictly per-channel, while displaying totals.
 */
export function calculateInvestorPortfolio(
  investorId: string,
  channels: ChannelFinancials[]
): InvestorPortfolio {
  const totalApprovedInvestUsd = Number(channels.reduce((acc, c) => acc + c.totalApprovedInvestUsd, 0).toFixed(2));
  const totalPendingReviewInvestUsd = Number(channels.reduce((acc, c) => acc + c.pendingReviewInvestUsd, 0).toFixed(2));
  const totalPendingUsd = Number(channels.reduce((acc, c) => acc + c.totalPendingUsd, 0).toFixed(2));
  const totalMaturedUsd = Number(channels.reduce((acc, c) => acc + c.totalMaturedUsd, 0).toFixed(2));
  const totalGrossRevenueUsd = Number(channels.reduce((acc, c) => acc + c.totalGrossRevenueUsd, 0).toFixed(2));
  const totalRecoupedUsd = Number(channels.reduce((acc, c) => acc + c.recoupedUsd, 0).toFixed(2));
  const totalRemainingInvestBalanceUsd = Number(channels.reduce((acc, c) => acc + c.remainingInvestBalanceUsd, 0).toFixed(2));
  const totalInvestorEarningsUsd = Number(channels.reduce((acc, c) => acc + c.investorGrossEarningsUsd, 0).toFixed(2));
  const totalPaidOutUsd = Number(channels.reduce((acc, c) => acc + c.totalPaidOutUsd, 0).toFixed(2));
  const totalAvailablePayoutUsd = Number(channels.reduce((acc, c) => acc + c.investorAvailablePayoutUsd, 0).toFixed(2));

  return {
    investorId,
    totalChannels: channels.length,
    totalApprovedInvestUsd,
    totalPendingReviewInvestUsd,
    totalPendingUsd,
    totalMaturedUsd,
    totalGrossRevenueUsd,
    totalRecoupedUsd,
    totalRemainingInvestBalanceUsd,
    totalInvestorEarningsUsd,
    totalPaidOutUsd,
    totalAvailablePayoutUsd,
    channels,
  };
}

// Backward compatibility alias
export const calculateFinancials = (
  modelId: string,
  baseInvestBalance: number,
  expenses: any[],
  transactions: any[],
  payouts: any[],
  meta?: {
    modelName?: string;
    channelTitle?: string | null;
    investorSharePercent?: number | null;
    enableExpenseRecoupment?: boolean | null;
  }
) => calculateChannelFinancials(modelId, baseInvestBalance, expenses, transactions, payouts, meta);

export function calculateMaturityDate(transactionDate: Date = new Date()): Date {
  const maturesAt = new Date(transactionDate);
  maturesAt.setDate(maturesAt.getDate() + 21);
  return maturesAt;
}

export function starsToUsd(starsAmount: number, customRate?: number): number {
  const rate = customRate ?? Number(process.env.STAR_USD_RATE || 0.013);
  return Number((starsAmount * rate).toFixed(2));
}
