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
  id?: string;
  amountUsd?: number;
  paidAt?: Date;
  starsWithdrawn?: number;
  currency?: string;
  amountCrypto?: number;
  investorCrypto?: number;
  managementCrypto?: number;
  amountTon?: number;
  investorUsd?: number;
  managementUsd?: number;
  recipient?: string;
  txHash?: string | null;
  notes?: string | null;
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
  
  // Stars Revenue Breakdown
  totalGrossStars: number;
  totalPendingStars: number;
  totalMaturedStars: number;
  totalStarsWithdrawn: number;
  availableStars: number;
  telegramAvailableStars?: number;
  telegramCurrentBalance?: number;
  telegramOverallRevenue?: number;
  telegramUsdRate?: number;
  telegramWithdrawalEnabled?: boolean;

  // USD Revenue
  totalPendingUsd: number;   // In 21-day holding period
  totalMaturedUsd: number;   // Liquid revenue on Telegram
  totalGrossRevenueUsd: number;

  // Crypto Disbursed Metrics (GRAM & TON)
  totalCryptoWithdrawn: number;
  totalInvestorCryptoPaid: number;
  totalManagementCryptoRetained: number;

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
  managementAvailablePayoutUsd: number;
  managementProjectedPendingShareUsd: number;
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
  totalGrossStars: number;
  totalStarsWithdrawn: number;
  totalPendingUsd: number;
  totalMaturedUsd: number;
  totalGrossRevenueUsd: number;
  totalRecoupedUsd: number;
  totalRemainingInvestBalanceUsd: number;
  totalInvestorEarningsUsd: number;
  totalPaidOutUsd: number;
  totalAvailablePayoutUsd: number;
  totalCryptoPaidOut: number;
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
    telegramAvailableStars?: number | null;
    telegramCurrentBalance?: number | null;
    telegramOverallRevenue?: number | null;
    telegramUsdRate?: number | null;
    telegramWithdrawalEnabled?: boolean | null;
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
  let totalPendingStars = 0;
  let totalMaturedStars = 0;

  for (const tx of transactions) {
    const amount = Number(tx.estimatedUsd || 0);
    const stars = Number(tx.starsAmount || 0);
    if (tx.status === 'PENDING') {
      totalPendingUsd += amount;
      totalPendingStars += stars;
    } else if (tx.status === 'MATURED') {
      totalMaturedUsd += amount;
      totalMaturedStars += stars;
    }
  }

  totalPendingUsd = Number(totalPendingUsd.toFixed(2));
  totalMaturedUsd = Number(totalMaturedUsd.toFixed(2));
  const totalGrossRevenueUsd = Number((totalPendingUsd + totalMaturedUsd).toFixed(2));
  const totalGrossStars = totalPendingStars + totalMaturedStars;

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

  // 5. Payouts and Stars Withdrawn deduction
  let totalPaidOutUsd = 0;
  let totalStarsWithdrawn = 0;
  let totalCryptoWithdrawn = 0;
  let totalInvestorCryptoPaid = 0;
  let totalManagementCryptoRetained = 0;

  for (const p of payouts) {
    const pInvestorUsd = (typeof p.investorUsd === 'number' && p.investorUsd > 0)
      ? p.investorUsd
      : Number(p.amountUsd || 0);
    totalPaidOutUsd += pInvestorUsd;
    totalStarsWithdrawn += Number(p.starsWithdrawn || 0);
    totalCryptoWithdrawn += Number(p.amountCrypto || p.amountTon || 0);
    totalInvestorCryptoPaid += Number(p.investorCrypto || p.amountTon || 0);
    totalManagementCryptoRetained += Number(p.managementCrypto || 0);
  }

  totalPaidOutUsd = Number(totalPaidOutUsd.toFixed(2));
  totalCryptoWithdrawn = Number(totalCryptoWithdrawn.toFixed(3));
  totalInvestorCryptoPaid = Number(totalInvestorCryptoPaid.toFixed(3));
  totalManagementCryptoRetained = Number(totalManagementCryptoRetained.toFixed(3));

  const starRate = meta?.telegramUsdRate || 0.013;

  // 1. Determine Telegram Gross Stars
  let effectiveGrossStars = totalGrossStars;
  if (typeof meta?.telegramOverallRevenue === "number" && meta.telegramOverallRevenue > 0) {
    effectiveGrossStars = Math.max(effectiveGrossStars, meta.telegramOverallRevenue);
  }
  const effectiveGrossRevenueUsd = Number((effectiveGrossStars * starRate).toFixed(2));

  // 2. Telegram's official "Belohnungen zur Abhebung verfügbar" (telegramAvailableStars) is the primary ground truth!
  const hasTelegramAvailable = typeof meta?.telegramAvailableStars === "number";
  const availableStars = hasTelegramAvailable
    ? Math.max(0, meta.telegramAvailableStars!)
    : Math.max(0, totalMaturedStars - totalStarsWithdrawn);

  const channelAvailableUsd = Number((availableStars * starRate).toFixed(2));

  // 3. Align 21-Day Holding (Haltefrist) with Telegram reality:
  // All unwithdrawn stars that are NOT yet withdrawable ("Belohnungen zur Abhebung verfügbar")
  // are locked in the 21-day holding period!
  let lockedPendingStars = totalPendingStars;
  let lockedPendingUsd = totalPendingUsd;

  if (hasTelegramAvailable) {
    const unwithdrawnGrossStars = Math.max(0, effectiveGrossStars - totalStarsWithdrawn);
    lockedPendingStars = Math.max(0, unwithdrawnGrossStars - availableStars);
    lockedPendingUsd = Number((lockedPendingStars * starRate).toFixed(2));
    totalMaturedStars = availableStars;
    totalMaturedUsd = channelAvailableUsd;
  }

  // 4. Calculate Claims & Available Payouts:
  // If availableStars === 0, then Telegram has 0 withdrawable funds.
  // There is NO payout claim due currently ("es gibt keinen auszahlungsanspruch aktuell").
  let investorAvailablePayoutUsd = 0;
  let managementAvailablePayoutUsd = 0;

  if (availableStars <= 0) {
    investorAvailablePayoutUsd = 0;
    managementAvailablePayoutUsd = 0;
  } else if (!hasTelegramAvailable) {
    investorAvailablePayoutUsd = Number(
      Math.max(0, investorGrossEarningsUsd - totalPaidOutUsd).toFixed(2)
    );
    managementAvailablePayoutUsd = Number((totalMaturedUsd * managementRatio).toFixed(2));
  } else {
    // Liquid withdrawable stars from Telegram split according to business rules:
    if (!enableExpenseRecoupment) {
      investorAvailablePayoutUsd = Number((channelAvailableUsd * investorRatio).toFixed(2));
      managementAvailablePayoutUsd = Number((channelAvailableUsd * managementRatio).toFixed(2));
    } else {
      const recoupAmount = Math.min(channelAvailableUsd, remainingInvestBalanceUsd);
      const profitAmount = Math.max(0, channelAvailableUsd - recoupAmount);
      investorAvailablePayoutUsd = Number((recoupAmount + (profitAmount * investorRatio)).toFixed(2));
      managementAvailablePayoutUsd = Number((profitAmount * managementRatio).toFixed(2));
    }
  }

  // Projected management share from unreleased holding funds (for transparency)
  const managementProjectedPendingShareUsd = Number((lockedPendingUsd * managementRatio).toFixed(2));

  // Management's currently realizable share: strictly what is available to withdraw right now
  const effectiveManagementShareUsd = hasTelegramAvailable && availableStars <= 0
    ? 0
    : (managementAvailablePayoutUsd > 0 ? managementAvailablePayoutUsd : (hasTelegramAvailable ? 0 : managementTotalShareUsd));

  // 6. Pipeline metrics
  const pipeline = {
    lockedPendingUsd,
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
    totalGrossStars: effectiveGrossStars,
    totalPendingStars: lockedPendingStars,
    totalMaturedStars,
    totalStarsWithdrawn,
    availableStars,
    telegramAvailableStars: meta?.telegramAvailableStars ?? undefined,
    telegramCurrentBalance: meta?.telegramCurrentBalance ?? undefined,
    telegramOverallRevenue: meta?.telegramOverallRevenue ?? undefined,
    telegramUsdRate: meta?.telegramUsdRate ?? undefined,
    telegramWithdrawalEnabled: meta?.telegramWithdrawalEnabled ?? undefined,
    totalPendingUsd: lockedPendingUsd,
    totalMaturedUsd,
    totalGrossRevenueUsd: effectiveGrossRevenueUsd,
    totalCryptoWithdrawn,
    totalInvestorCryptoPaid,
    totalManagementCryptoRetained,
    recoupedUsd,
    remainingInvestBalanceUsd,
    isRecouped,
    recoupmentProgressPercent,
    grossProfitUsd,
    partnerTotalShareUsd: investorProfitShareUsd,
    investorGrossEarningsUsd: investorAvailablePayoutUsd,
    managementTotalShareUsd: effectiveManagementShareUsd,
    managementAvailablePayoutUsd,
    managementProjectedPendingShareUsd,
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
  const totalGrossStars = Number(channels.reduce((acc, c) => acc + (c.totalGrossStars || 0), 0));
  const totalStarsWithdrawn = Number(channels.reduce((acc, c) => acc + (c.totalStarsWithdrawn || 0), 0));
  const totalPendingUsd = Number(channels.reduce((acc, c) => acc + c.totalPendingUsd, 0).toFixed(2));
  const totalMaturedUsd = Number(channels.reduce((acc, c) => acc + c.totalMaturedUsd, 0).toFixed(2));
  const totalGrossRevenueUsd = Number(channels.reduce((acc, c) => acc + c.totalGrossRevenueUsd, 0).toFixed(2));
  const totalRecoupedUsd = Number(channels.reduce((acc, c) => acc + c.recoupedUsd, 0).toFixed(2));
  const totalRemainingInvestBalanceUsd = Number(channels.reduce((acc, c) => acc + c.remainingInvestBalanceUsd, 0).toFixed(2));
  const totalInvestorEarningsUsd = Number(channels.reduce((acc, c) => acc + c.investorGrossEarningsUsd, 0).toFixed(2));
  const totalPaidOutUsd = Number(channels.reduce((acc, c) => acc + c.totalPaidOutUsd, 0).toFixed(2));
  const totalAvailablePayoutUsd = Number(channels.reduce((acc, c) => acc + c.investorAvailablePayoutUsd, 0).toFixed(2));
  const totalCryptoPaidOut = Number(channels.reduce((acc, c) => acc + (c.totalInvestorCryptoPaid || 0), 0).toFixed(3));

  return {
    investorId,
    totalChannels: channels.length,
    totalApprovedInvestUsd,
    totalPendingReviewInvestUsd,
    totalGrossStars,
    totalStarsWithdrawn,
    totalPendingUsd,
    totalMaturedUsd,
    totalGrossRevenueUsd,
    totalRecoupedUsd,
    totalRemainingInvestBalanceUsd,
    totalInvestorEarningsUsd,
    totalPaidOutUsd,
    totalAvailablePayoutUsd,
    totalCryptoPaidOut,
    channels,
  };
}

export interface SplitCalculationResult {
  starsWithdrawn: number;
  currency: "GRAM" | "TON";
  amountCrypto: number;
  investorSharePercent: number;
  managementSharePercent: number;
  investorCrypto: number;
  managementCrypto: number;
  amountUsd: number;
  investorUsd: number;
  managementUsd: number;
  recoupmentPortionUsd: number;
  profitPortionUsd: number;
}

/**
 * Calculates the exact split in crypto (GRAM / TON) and USD between Investor and Management
 * based on the channel's recoupment rules and investor share percent.
 */
export function calculatePayoutSplit(
  totalCrypto: number,
  starsWithdrawn: number,
  currency: "GRAM" | "TON" = "GRAM",
  options?: {
    investorSharePercent?: number;
    enableExpenseRecoupment?: boolean;
    remainingInvestBalanceUsd?: number;
    customStarRate?: number;
  }
): SplitCalculationResult {
  const rate = options?.customStarRate ?? Number(process.env.STAR_USD_RATE || 0.013);
  const amountUsd = Number((starsWithdrawn * rate).toFixed(2));
  
  const enableExpenseRecoupment = options?.enableExpenseRecoupment !== false;
  const remainingInvest = options?.remainingInvestBalanceUsd ?? 0;
  const sharePct = typeof options?.investorSharePercent === "number" && !isNaN(options.investorSharePercent)
    ? Math.max(0, Math.min(100, options.investorSharePercent))
    : 50.0;
  const mgmtPct = Number((100 - sharePct).toFixed(1));

  let investorCrypto = 0;
  let managementCrypto = 0;
  let investorUsd = 0;
  let managementUsd = 0;
  let recoupmentPortionUsd = 0;
  let profitPortionUsd = 0;

  if (enableExpenseRecoupment && remainingInvest > 0) {
    const recoupUsd = Math.min(amountUsd, remainingInvest);
    recoupmentPortionUsd = Number(recoupUsd.toFixed(2));
    const profitUsd = Math.max(0, amountUsd - recoupUsd);
    profitPortionUsd = Number(profitUsd.toFixed(2));

    const recoupFraction = amountUsd > 0 ? recoupUsd / amountUsd : 0;
    const profitFraction = amountUsd > 0 ? profitUsd / amountUsd : 0;

    const recoupCrypto = totalCrypto * recoupFraction;
    const profitCrypto = totalCrypto * profitFraction;

    const investorProfitCrypto = profitCrypto * (sharePct / 100);

    investorCrypto = Number((recoupCrypto + investorProfitCrypto).toFixed(3));
    managementCrypto = Number(Math.max(0, totalCrypto - investorCrypto).toFixed(3));

    investorUsd = Number((recoupmentPortionUsd + (profitPortionUsd * (sharePct / 100))).toFixed(2));
    managementUsd = Number(Math.max(0, amountUsd - investorUsd).toFixed(2));
  } else {
    // Direct Split (or already 100% recouped)
    investorCrypto = Number((totalCrypto * (sharePct / 100)).toFixed(3));
    managementCrypto = Number(Math.max(0, totalCrypto - investorCrypto).toFixed(3));
    investorUsd = Number((amountUsd * (sharePct / 100)).toFixed(2));
    managementUsd = Number(Math.max(0, amountUsd - investorUsd).toFixed(2));
  }

  return {
    starsWithdrawn,
    currency,
    amountCrypto: Number(totalCrypto.toFixed(3)),
    investorSharePercent: sharePct,
    managementSharePercent: mgmtPct,
    investorCrypto,
    managementCrypto,
    amountUsd,
    investorUsd,
    managementUsd,
    recoupmentPortionUsd,
    profitPortionUsd,
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
    slug?: string;
    avatarUrl?: string | null;
    investorSharePercent?: number | null;
    enableExpenseRecoupment?: boolean | null;
    telegramAvailableStars?: number | null;
    telegramCurrentBalance?: number | null;
    telegramOverallRevenue?: number | null;
    telegramUsdRate?: number | null;
    telegramWithdrawalEnabled?: boolean | null;
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
