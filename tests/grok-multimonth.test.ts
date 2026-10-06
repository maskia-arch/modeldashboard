import { GrokScheduleResponseSchema, generateMockSchedule } from "../src/lib/grok";

console.log("=== Testing Multi-Month (60-Day) Content Schedule & Pacing ===");

const mockAssets = Array.from({ length: 60 }).map((_, i) => ({
  id: `asset-${i + 1}`,
  title: `Media #${i + 1}`,
  theme: i % 2 === 0 ? "Strand" : "Boudoir",
  type: i % 3 === 0 ? ("VIDEO" as const) : ("PHOTO" as const),
  explicitLevel: i % 3 === 0 ? ("PPV" as const) : i % 3 === 1 ? ("TEASER" as const) : ("SOFT" as const),
  tags: ["vip"],
}));

// Test 60-Day (2 Months) Schedule Generation
const result60 = generateMockSchedule({
  modelName: "Luna Starr",
  channelTitle: "Luna Starr Official",
  targetDays: 60,
  postsPerDay: 1,
  availableAssets: mockAssets,
});

console.log(`Generated ${result60.schedule.length} posts for 60-day schedule.`);
if (result60.schedule.length !== 60) {
  throw new Error(`Expected 60 posts, got ${result60.schedule.length}`);
}

const parsed = GrokScheduleResponseSchema.parse(result60);
console.log("✓ 60-day schedule conforms strictly to Zod Schema!");

const ppvPosts = parsed.schedule.filter((p) => p.starsPrice > 0);
const freePosts = parsed.schedule.filter((p) => p.starsPrice === 0);

console.log(`  ✓ PPV Paywall posts: ${ppvPosts.length} (monetized with Stars)`);
console.log(`  ✓ Free Teaser posts: ${freePosts.length} (audience retention)`);

if (ppvPosts.length === 0 || freePosts.length === 0) {
  throw new Error("Expected both PPV and Free posts across the 60-day schedule");
}

console.log("\n✨ Multi-Month Content Pacing Test PASSED!");
