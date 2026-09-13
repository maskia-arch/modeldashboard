import { calculateChannelFinancials, calculateInvestorPortfolio } from "../src/lib/financial-engine";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

console.log("=== Testing Channel-Specific 100% Recoupment & Investor Portfolio ===");

// 1. Channel A (Luna Starr):
// Approved Expenses: $1,500 + $1,000 = $2,500
// Pending Review Expense: $650 (MUST BE EXCLUDED FROM RECOUPMENT TARGET!)
// Matured Revenue: $1,950 (matured) + $1,040 (matured) = $2,990
// 21d Locked Revenue: $650
{
  console.log("\nScenario 1: Channel A (Luna Starr) - Recoupment + Profit");
  const channelA = calculateChannelFinancials(
    "model_luna",
    0,
    [
      { amountUsd: 1500, status: "APPROVED" },
      { amountUsd: 1000, status: "APPROVED" },
      { amountUsd: 650, status: "PENDING_REVIEW" }, // should NOT be counted in approved invest
    ],
    [
      { starsAmount: 150000, estimatedUsd: 1950, status: "MATURED", transactionDate: new Date(), maturesAt: new Date() },
      { starsAmount: 80000, estimatedUsd: 1040, status: "MATURED", transactionDate: new Date(), maturesAt: new Date() },
      { starsAmount: 50000, estimatedUsd: 650, status: "PENDING", transactionDate: new Date(), maturesAt: new Date() },
    ],
    [],
    { modelName: "Luna Starr", channelTitle: "@lunastarr_vip" }
  );

  assert(channelA.totalApprovedInvestUsd === 2500, "Approved invest target is exactly $2,500 (pending $650 excluded)");
  assert(channelA.pendingReviewInvestUsd === 650, "Pending review invest is $650");
  assert(channelA.totalMaturedUsd === 2990, "Total matured revenue is $2,990");
  assert(channelA.recoupedUsd === 2500, "100% of the $2,500 investment is recouped");
  assert(channelA.remainingInvestBalanceUsd === 0, "Remaining invest is $0");
  assert(channelA.isRecouped === true, "Channel A is 100% recouped");
  assert(channelA.grossProfitUsd === 490, "Gross profit beyond recoupment is $490 ($2,990 - $2,500)");
  // Investor gets 100% recoupment ($2,500) + 50% profit ($245) = $2,745
  assert(channelA.investorGrossEarningsUsd === 2745, "Investor gross earnings from Channel A is $2,745");
  assert(channelA.investorAvailablePayoutUsd === 2745, "Available liquid payout is $2,745");
  assert(channelA.pipeline.lockedPendingUsd === 650, "21-day locked escrow is $650");
}

// 2. Channel B (Elena Fox):
// Approved Expense: $800
// Matured Revenue: $520 (< $800)
// Investor gets 100% of matured funds ($520) directly toward amortizing the $800!
// Profit = $0
{
  console.log("\nScenario 2: Channel B (Elena Fox) - Active 100% Recouping");
  const channelB = calculateChannelFinancials(
    "model_elena",
    0,
    [{ amountUsd: 800, status: "APPROVED" }],
    [
      { starsAmount: 40000, estimatedUsd: 520, status: "MATURED", transactionDate: new Date(), maturesAt: new Date() },
    ],
    [],
    { modelName: "Elena Fox", channelTitle: "@elenafox_vip" }
  );

  assert(channelB.totalApprovedInvestUsd === 800, "Channel B approved invest is $800");
  assert(channelB.recoupedUsd === 520, "100% of matured ($520) goes to investor recoupment");
  assert(channelB.remainingInvestBalanceUsd === 280, "Remaining invest balance is $280");
  assert(channelB.isRecouped === false, "Channel B is still recouping (not fully amortized)");
  assert(channelB.grossProfitUsd === 0, "Profit is $0 while recouping");
  assert(channelB.investorAvailablePayoutUsd === 520, "Investor gets $520 liquid payout (100% of matured)");
}

// 3. Multi-Channel Portfolio Aggregation:
// Channel A: $2,500 invest, $2,500 recouped, $2,745 liquid
// Channel B: $800 invest, $520 recouped, $520 liquid
// Notice: Channel A's profit DOES NOT pay off Channel B's open $280!
// Accounting remains strictly channel-based!
{
  console.log("\nScenario 3: Investor Portfolio Aggregation with Channel-Specific Isolation");
  const channelA = calculateChannelFinancials(
    "model_luna", 0,
    [{ amountUsd: 2500, status: "APPROVED" }],
    [{ starsAmount: 230000, estimatedUsd: 2990, status: "MATURED", transactionDate: new Date(), maturesAt: new Date() }],
    []
  );

  const channelB = calculateChannelFinancials(
    "model_elena", 0,
    [{ amountUsd: 800, status: "APPROVED" }],
    [{ starsAmount: 40000, estimatedUsd: 520, status: "MATURED", transactionDate: new Date(), maturesAt: new Date() }],
    []
  );

  const portfolio = calculateInvestorPortfolio("inv_markus", [channelA, channelB]);

  assert(portfolio.totalApprovedInvestUsd === 3300, "Total portfolio approved invest is $3,300 ($2,500 + $800)");
  assert(portfolio.totalRecoupedUsd === 3020, "Total recouped across portfolio is $3,020 ($2,500 + $520)");
  assert(portfolio.totalRemainingInvestBalanceUsd === 280, "Total remaining invest is exactly Channel B's $280");
  assert(portfolio.totalAvailablePayoutUsd === 3265, "Total available payout is $3,265 ($2,745 + $520)");
  console.log("  ✓ Channel-specific isolation confirmed: Luna's excess profit does NOT cross-subsidize Elena's open invest.");
}

console.log("\n✨ All Investor Recoupment & Isolation Tests PASSED!");
