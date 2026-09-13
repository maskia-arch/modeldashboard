import { calculateFinancials, calculateMaturityDate, starsToUsd } from "../src/lib/financial-engine";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

console.log("=== Testing Financial Engine & Recoupment Logic ===");

// Scenario 1: Initial phase, expenses = $2,500, matured = $1,500 (< expenses)
{
  console.log("\nScenario 1: Partial Recoupment (Under Target)");
  const res = calculateFinancials(
    "model_1",
    2500,
    [{ amountUsd: 1500 }, { amountUsd: 1000 }], // $2500 total
    [
      {
        starsAmount: 115384,
        estimatedUsd: 1500,
        status: "MATURED",
        transactionDate: new Date(),
        maturesAt: new Date(),
      },
      {
        starsAmount: 38461,
        estimatedUsd: 500,
        status: "PENDING", // locked in 21d escrow
        transactionDate: new Date(),
        maturesAt: new Date(),
      },
    ],
    []
  );

  assert(res.totalInvestTargetUsd === 2500, "Total invest target is $2,500");
  assert(res.recoupedUsd === 1500, "Recouped amount is $1,500 (100% of matured)");
  assert(res.remainingInvestBalanceUsd === 1000, "Remaining invest balance is $1,000");
  assert(!res.isRecouped, "isRecouped is false");
  assert(res.grossProfitUsd === 0, "Gross profit is $0 before 100% recoupment");
  assert(res.investorAvailablePayoutUsd === 1500, "Investor receives 100% of matured funds ($1,500) until recouped");
  assert(res.pipeline.lockedPendingUsd === 500, "Pipeline Locked/Pending is $500");
  assert(res.pipeline.recoupingUsd === 1500, "Pipeline Recouping is $1,500");
  assert(res.pipeline.availableForPayoutUsd === 1500, "Pipeline Available for investor payout is $1,500");
}

// Scenario 2: Full recoupment + 50/50 profit split!
// Expenses = $2,000, Matured = $5,000
// Investor gets: $2,000 (100% recouped) + $1,500 (50% profit) = $3,500 gross. Minus $500 paid = $3,000 available!
{
  console.log("\nScenario 2: Full Recoupment & 50/50 Profit Split");
  const res = calculateFinancials(
    "model_2",
    2000,
    [{ amountUsd: 2000 }],
    [
      {
        starsAmount: 384615,
        estimatedUsd: 5000,
        status: "MATURED",
        transactionDate: new Date(),
        maturesAt: new Date(),
      },
      {
        starsAmount: 76923,
        estimatedUsd: 1000,
        status: "PENDING",
        transactionDate: new Date(),
        maturesAt: new Date(),
      },
    ],
    [
      { amountUsd: 500, paidAt: new Date() }, // Previous payout of $500
    ]
  );

  assert(res.totalInvestTargetUsd === 2000, "Invest target is $2,000");
  assert(res.recoupedUsd === 2000, "Recouped is $2,000");
  assert(res.remainingInvestBalanceUsd === 0, "Remaining invest is $0");
  assert(res.isRecouped === true, "Model is 100% recouped");
  assert(res.grossProfitUsd === 3000, "Gross profit is $3,000");
  assert(res.partnerTotalShareUsd === 1500, "Investor 50% profit share is $1,500");
  assert(res.investorGrossEarningsUsd === 3500, "Investor gross earnings is $3,500 ($2,000 invest + $1,500 profit)");
  assert(res.investorAvailablePayoutUsd === 3000, "Investor available payout is $3,000 ($3,500 minus $500 paid out)");
  assert(res.pipeline.lockedPendingUsd === 1000, "Pipeline Locked is $1,000");
  assert(res.pipeline.recoupingUsd === 2000, "Pipeline Recouping is $2,000");
  assert(res.pipeline.availableForPayoutUsd === 3000, "Pipeline Available is $3,000");
}

// Scenario 3: Maturity Date Calculation
{
  console.log("\nScenario 3: 21-Day Maturity Date Calculation");
  const baseDate = new Date("2026-09-01T12:00:00Z");
  const maturity = calculateMaturityDate(baseDate);
  const diffDays = Math.round((maturity.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000));
  assert(diffDays === 21, `Maturity date is exactly 21 days later (diff = ${diffDays} days)`);
}

console.log("\n✨ All Financial Engine tests PASSED successfully!");
