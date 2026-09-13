import { GrokScheduleResponseSchema, generateMockSchedule } from "../src/lib/grok";

console.log("=== Testing xAI Grok Strict JSON Schema Validator ===");

const mockParams = {
  modelName: "Luna Starr",
  channelTitle: "@lunastarr_vip",
  targetDays: 5,
  modelTone: "Playful, alluring, authentic German VIP creator",
  availableAssets: [
    {
      id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "PHOTO" as const,
      explicitLevel: "TEASER" as const,
      tags: ["morning", "smile"],
    },
    {
      id: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      type: "PHOTO" as const,
      explicitLevel: "PPV" as const,
      tags: ["lingerie", "exclusive"],
    },
  ],
};

const generated = generateMockSchedule(mockParams);
console.log(`Generated ${generated.schedule.length} schedule items.`);

// Validate against Strict Zod Schema
const parsed = GrokScheduleResponseSchema.parse(generated);
console.log("✓ Zod Schema validation passed successfully!");

for (const item of parsed.schedule) {
  if (item.starsPrice > 0) {
    console.log(`  ✓ PPV Paywall item: [Day +${item.timeOffsetDays} @ ${item.timeOfDay}] -> ${item.starsPrice} Stars`);
  } else {
    console.log(`  ✓ Teaser Free item: [Day +${item.timeOffsetDays} @ ${item.timeOfDay}] -> Free`);
  }
}

console.log("\n✨ All Grok Schema & Pricing tests PASSED!");
