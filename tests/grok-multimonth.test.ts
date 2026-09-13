import { GrokScheduleResponseSchema, generateMockSchedule } from "../src/lib/grok";

console.log("=== Testing Multi-Month (60-Day) Content Schedule & Pacing ===");

const mockAssets = [
  { id: "asset-1", title: "Strand Teaser #1", theme: "Strand", type: "PHOTO" as const, explicitLevel: "TEASER" as const, tags: ["beach"] },
  { id: "asset-2", title: "Strand Teaser #2", theme: "Strand", type: "PHOTO" as const, explicitLevel: "TEASER" as const, tags: ["beach"] },
  { id: "asset-3", title: "Lingerie Soft #1", theme: "Boudoir", type: "PHOTO" as const, explicitLevel: "SOFT" as const, tags: ["lingerie"] },
  { id: "asset-4", title: "VIP Clip #1", theme: "VIP Room", type: "VIDEO" as const, explicitLevel: "PPV" as const, tags: ["vip"] },
  { id: "asset-5", title: "VIP Clip #2", theme: "VIP Shower", type: "VIDEO" as const, explicitLevel: "PPV" as const, tags: ["vip"] },
];

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
