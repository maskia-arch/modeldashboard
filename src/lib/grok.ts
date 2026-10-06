import { z } from "zod";
import {
  extractAssetVisualContext,
  composeStorylineCaption,
  sanitizeCaptionForMediaType,
  ensureCaptionTimeConsistency,
} from "./captions";

export const ScheduleItemSchema = z.object({
  timeOffsetDays: z.number().int().min(0).max(3650), // Support up to 10 years (3650 days)
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM format (24h)"),
  assetId: z.string().uuid().or(z.string().min(1)),
  caption: z.string().min(3).max(1024),
  starsPrice: z.number().int().min(0).max(10000),
});

export const ScheduleStatsSchema = z.object({
  totalPosts: z.number().int(),
  totalDays: z.number().int(),
  pauseDays: z.number().int(),
  daysWithOnePost: z.number().int(),
  daysWithTwoPosts: z.number().int(),
  teaserCount: z.number().int(),
  softCount: z.number().int(),
  ppvCount: z.number().int(),
});

export const GrokScheduleResponseSchema = z.object({
  schedule: z.array(ScheduleItemSchema),
  stats: ScheduleStatsSchema.optional(),
});

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type GrokScheduleResponse = z.infer<typeof GrokScheduleResponseSchema>;

export type SchedulingStrategy = "REALISTIC" | "VARIABLE_1_2" | "FIXED_1" | "FIXED_2" | "EVERY_2_DAYS" | "EVERY_3_DAYS" | "RELAXED";

export interface ScheduleStats {
  totalPosts: number;
  totalDays: number;
  pauseDays: number;
  daysWithOnePost: number;
  daysWithTwoPosts: number;
  teaserCount: number;
  softCount: number;
  ppvCount: number;
}

export interface GenerateScheduleParams {
  modelName: string;
  channelTitle?: string | null;
  targetDays?: number; // e.g. 14, 30, 60, 90, 365, 730, 1095, up to 3650 days (10 years)
  postsPerDay?: number; // e.g. 1 or 2 posts per day (legacy or fallback)
  strategy?: SchedulingStrategy;
  allowPauseDays?: boolean;
  modelTone?: string;  // e.g. "Playful, affectionate, flirty, authentic German creator"
  availableAssets: Array<{
    id: string;
    title?: string | null;
    theme?: string | null;
    notes?: string | null;
    type: 'PHOTO' | 'VIDEO' | 'TEXT';
    explicitLevel: 'TEASER' | 'SOFT' | 'PPV';
    tags: string[];
    duration?: number | null;
    durationFormatted?: string | null;
    fileUrl?: string | null;
  }>;
}

/**
 * Calls xAI Grok API with Strict JSON schema and an AbortController timeout.
 * Automatically falls back to generateRealisticSchedule if xAI is unconfigured,
 * times out, or encounters any upstream error.
 */
export async function generateGrokSchedule(params: GenerateScheduleParams): Promise<GrokScheduleResponse> {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL || "grok-4.20-non-reasoning";

  const requestedDays = Math.min(Math.max(params.targetDays || 30, 1), 3650);

  if (!apiKey || apiKey === "demo_xai_key") {
    // If no live key is set, return a high-quality deterministic realistic plan
    return generateRealisticSchedule(params);
  }

  const available = params.availableAssets || [];
  if (available.length === 0) {
    return {
      schedule: [],
      stats: {
        totalPosts: 0,
        totalDays: requestedDays,
        pauseDays: requestedDays,
        daysWithOnePost: 0,
        daysWithTwoPosts: 0,
        teaserCount: 0,
        softCount: 0,
        ppvCount: 0,
      },
    };
  }

  const { getGermanDateParts } = await import("./timezone");
  const nowGerman = getGermanDateParts(new Date());
  const currentGermanTimeStr = `${String(nowGerman.hour).padStart(2, "0")}:${String(nowGerman.minute).padStart(2, "0")}`;

  const assetMap = new Map(available.map((a) => [a.id, a]));

  // Enrich all available assets with rich visual context & duration
  const enrichedAssets = available.map((a) => {
    const vis = extractAssetVisualContext(a);
    return {
      assetId: a.id,
      type: a.type,
      explicitLevel: a.explicitLevel,
      title: a.title || "VIP Content",
      theme: a.theme || "Allgemein",
      setting: vis.setting,
      clothing: vis.clothing,
      perspective: vis.perspective,
      highlights: vis.highlights.length > 0 ? vis.highlights.join(", ") : undefined,
      videoDuration: a.type === "VIDEO" ? (a.durationFormatted || (a.duration ? `${a.duration} Sekunden` : "Video-Clip")) : undefined,
    };
  });

  // Batch assets into chunks of up to 20 assets each so Grok produces thorough, highly specific copy
  const BATCH_SIZE = 20;
  const batches: (typeof enrichedAssets)[] = [];
  for (let i = 0; i < enrichedAssets.length; i += BATCH_SIZE) {
    batches.push(enrichedAssets.slice(i, i + BATCH_SIZE));
  }

  const numBatches = batches.length;
  const daysPerBatch = Math.max(1, Math.ceil(requestedDays / numBatches));

  try {
    const batchPromises = batches.map(async (batchAssets, batchIdx) => {
      const startDay = batchIdx * daysPerBatch;
      const batchTargetDays = Math.min(daysPerBatch, Math.max(1, requestedDays - startDay));

      const systemPrompt = `You are the authentic creator voice for "${params.modelName}" on Telegram.
You are designing an authentic content schedule for her Telegram VIP Channel.

MANDATORY PERSONA & TONALITY (HIGHEST PRIORITY):
Voice & Persona: ${params.modelTone || "Authentic, intimate, charming, playful, flirty German creator"}.
You MUST adopt this EXACT personality for ALL captions!
- Incorporate her unique tone of voice, attitude, slang, expressions, quirks, and humor in EVERY post.
- NEVER use generic bot / canned phrases (such as "Guten Morgen meine Lieben ☕ Direkt nach dem Aufstehen... Wer von euch braucht heute auch erstmal drei Kaffee?"). These sound like robotic templates and are strictly forbidden.
- Write like a real person typing on Telegram or recording a quick voice note directly to her closest VIP fans.
- Directly incorporate what is visible in the media organically (setting, outfit, tattoos, wet hair, bed, mirror).
- For VIDEO assets: emphasize video duration and exclusivity.
- Schedule entries must use unique assetIds from the provided list. Every asset in the list must be scheduled.

CURRENT TIME CONTEXT (Europe/Berlin):
- Right now in Germany it is ${currentGermanTimeStr} Uhr. Day 0 is TODAY.
- If it is already past 11:30 in Germany: Morning slots (07:00 - 11:30) for Day 0 have ALREADY PASSED!
  Any morning posts ("Guten Morgen", coffee, waking thoughts) MUST be scheduled for Day 1 (tomorrow morning, e.g. 09:30 or 10:15) or later!
  Day 0 may only have slots strictly AFTER ${currentGermanTimeStr} Uhr.
- If it is already past 21:00 in Germany: Day 0 has ended; start your schedule on Day 1 (tomorrow morning).

PRICING & FORMAT RULES:
- ALL VIDEO ASSETS: starsPrice >= 25 (e.g. 25-50 for teaser clips, 100-250 for standard, 250-450 for full/explicit).
- PHOTO TEASER assets: starsPrice = 0.
- PHOTO SOFT assets: starsPrice = 15 to 50.
- PHOTO PPV assets: starsPrice = 100 to 450.
- For PHOTO assets: NEVER use words like "Video", "Clip", "Film", "gefilmt".
- For VIDEO assets: Use "Video", "Clip", "Aufnahme". NEVER call it a photo or snapshot.

Return strictly valid JSON conforming to the schema.`;

      const userPrompt = `Assets to schedule (all ${batchAssets.length} assets must be scheduled):
${JSON.stringify(batchAssets, null, 2)}

Create a posting plan starting at timeOffsetDays = ${startDay} spanning across ${batchTargetDays} days (from day ${startDay} to ${startDay + batchTargetDays - 1}).
Strategy: ${params.strategy || "REALISTIC"}, allowPauseDays: ${params.allowPauseDays ?? true}.
Each asset must be scheduled exactly once using its unique assetId.
Respond in strict JSON with the following structure:
{
  "schedule": [
    {
      "timeOffsetDays": ${startDay},
      "timeOfDay": "14:30",
      "assetId": "asset-id",
      "caption": "Authentische, persönliche deutsche Bildunterschrift mit direktem Bezug zum Bild...",
      "starsPrice": 0
    }
  ]
}`;

      // 45s timeout per batch call: provides plenty of buffer for deep Grok reasoning & rich copy
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      try {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            response_format: { type: "json_object" },
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`xAI API HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        if (!rawContent) throw new Error("Empty content in xAI response");

        const parsedJson = JSON.parse(rawContent);
        const validated = GrokScheduleResponseSchema.parse(parsedJson);
        return validated.schedule || [];
      } finally {
        clearTimeout(timeoutId);
      }
    });

    const batchResults = await Promise.all(batchPromises);
    const combinedSchedule: ScheduleItem[] = batchResults.flat();

    // Deduplicate by assetId and sanitize all captions
    const seenAssetIds = new Set<string>();
    const deduplicatedSchedule: ScheduleItem[] = [];

    for (const item of combinedSchedule) {
      if (!seenAssetIds.has(item.assetId) && assetMap.has(item.assetId)) {
        seenAssetIds.add(item.assetId);
        const asset = assetMap.get(item.assetId)!;
        const isVideo = asset.type === "VIDEO";
        let starsPrice = item.starsPrice;
        if (isVideo) {
          starsPrice = Math.max(starsPrice, 25);
        }

        let timeOffsetDays = Math.max(0, item.timeOffsetDays);
        if (timeOffsetDays === 0 && item.timeOfDay <= currentGermanTimeStr) {
          timeOffsetDays = 1;
        }

        const sanitized = sanitizeCaptionForMediaType(item.caption, asset.type);
        deduplicatedSchedule.push({
          ...item,
          timeOffsetDays,
          starsPrice,
          caption: ensureCaptionTimeConsistency(sanitized, item.timeOfDay),
        });
      }
    }

    // Safety check: If Grok omitted any asset from the prompt, fill it with persona-aware fallback
    const missedAssets = available.filter((a) => !seenAssetIds.has(a.id));
    if (missedAssets.length > 0) {
      console.log(`[generateGrokSchedule] Grok missed ${missedAssets.length} assets, filling with persona-aware captions...`);
      const usedCaptionsSet = new Set(deduplicatedSchedule.map((p) => p.caption));
      let nextDayOffset = deduplicatedSchedule.length > 0
        ? Math.max(...deduplicatedSchedule.map((p) => p.timeOffsetDays)) + 1
        : 0;

      for (const asset of missedAssets) {
        seenAssetIds.add(asset.id);
        const dayIdx = nextDayOffset++;
        const timeOfDay = "20:15";
        const isVideo = asset.type === "VIDEO";
        let starsPrice = isVideo ? 150 : (asset.explicitLevel === "PPV" ? 150 : (asset.explicitLevel === "SOFT" ? 25 : 0));
        if (isVideo) starsPrice = Math.max(starsPrice, 25);

        const caption = composeStorylineCaption({
          asset,
          dayOfWeek: dayIdx % 7,
          dayIndex: dayIdx,
          timeSlot: "evening",
          modelName: params.modelName,
          modelTone: params.modelTone,
          usedCaptionsSet,
        });

        deduplicatedSchedule.push({
          timeOffsetDays: dayIdx,
          timeOfDay,
          assetId: asset.id,
          caption: ensureCaptionTimeConsistency(sanitizeCaptionForMediaType(caption, asset.type), timeOfDay),
          starsPrice,
        });
      }
    }

    // Sort schedule chronologically
    deduplicatedSchedule.sort((a, b) => {
      if (a.timeOffsetDays !== b.timeOffsetDays) return a.timeOffsetDays - b.timeOffsetDays;
      return a.timeOfDay.localeCompare(b.timeOfDay);
    });

    // Hard ceiling: A schedule must NEVER contain more posts than available assets
    const finalSchedule = deduplicatedSchedule.slice(0, available.length);

    // Calculate stats
    const postsByDay = new Map<number, number>();
    for (let d = 0; d < requestedDays; d++) postsByDay.set(d, 0);
    finalSchedule.forEach((item) => {
      postsByDay.set(item.timeOffsetDays, (postsByDay.get(item.timeOffsetDays) || 0) + 1);
    });

    let pauseDays = 0;
    let daysWithOnePost = 0;
    let daysWithTwoPosts = 0;
    postsByDay.forEach((count) => {
      if (count === 0) pauseDays++;
      else if (count === 1) daysWithOnePost++;
      else if (count >= 2) daysWithTwoPosts++;
    });

    const stats: ScheduleStats = {
      totalPosts: finalSchedule.length,
      totalDays: requestedDays,
      pauseDays,
      daysWithOnePost,
      daysWithTwoPosts,
      teaserCount: finalSchedule.filter((p) => p.starsPrice === 0).length,
      softCount: finalSchedule.filter((p) => p.starsPrice > 0 && p.starsPrice <= 50).length,
      ppvCount: finalSchedule.filter((p) => p.starsPrice > 50).length,
    };

    return { schedule: finalSchedule, stats };
  } catch (error) {
    console.warn("[generateGrokSchedule] xAI Grok call failed or timed out. Falling back to realistic scheduler:", error);
    return generateRealisticSchedule(params);
  }
}

/**
 * Realistic generator that models the natural, varied posting behavior of a real creator.
 * - Supports variable posting frequencies (0-2 posts/day).
 * - Incorporates authentic rest/pause days (e.g. Sundays, creative mid-week pauses).
 * - Distributes content intelligently between Free Teasers, Soft Sneak-Peeks, and High-Ticket PPVs.
 * - Produces rich German VIP creator captions.
 */
export function generateRealisticSchedule(params: GenerateScheduleParams): GrokScheduleResponse {
  const schedule: ScheduleItem[] = [];
  const days = Math.min(Math.max(params.targetDays || 30, 1), 3650);
  const strategy: SchedulingStrategy = params.strategy || (params.postsPerDay === 2 ? "FIXED_2" : "REALISTIC");
  const allowPauseDays = params.allowPauseDays ?? (strategy === "REALISTIC" || strategy === "RELAXED");
  const assets = params.availableAssets;

  if (!assets || assets.length === 0) {
    return {
      schedule: [],
      stats: {
        totalPosts: 0,
        totalDays: days,
        pauseDays: days,
        daysWithOnePost: 0,
        daysWithTwoPosts: 0,
        teaserCount: 0,
        softCount: 0,
        ppvCount: 0,
      }
    };
  }

  // Realistic Telegram creator posting hours
  const morningTimes = ["09:30", "10:15", "11:00", "11:45"];
  const eveningTimes = ["18:15", "19:30", "20:45", "21:30", "22:15"];
  const lateNightTimes = ["23:00", "23:45", "00:15"];

  // Group assets by level
  const teaserAssets = assets.filter((a) => a.explicitLevel === "TEASER");
  const softAssets = assets.filter((a) => a.explicitLevel === "SOFT");
  const ppvAssets = assets.filter((a) => a.explicitLevel === "PPV");


  // Group available assets into non-repeating consumable pools (each asset is used at most ONCE)
  let teaserPool = [...assets.filter((a) => a.explicitLevel === "TEASER")];
  let softPool = [...assets.filter((a) => a.explicitLevel === "SOFT")];
  let ppvPool = [...assets.filter((a) => a.explicitLevel === "PPV")];

  const takeAsset = (preferredTier: "TEASER" | "SOFT" | "PPV"): typeof assets[0] | null => {
    let pool: typeof assets = preferredTier === "TEASER" ? teaserPool : preferredTier === "SOFT" ? softPool : ppvPool;
    if (pool.length === 0) {
      if (teaserPool.length > 0) pool = teaserPool;
      else if (softPool.length > 0) pool = softPool;
      else if (ppvPool.length > 0) pool = ppvPool;
      else return null;
    }

    const item = pool.shift()!;
    teaserPool = teaserPool.filter((a) => a.id !== item.id);
    softPool = softPool.filter((a) => a.id !== item.id);
    ppvPool = ppvPool.filter((a) => a.id !== item.id);
    return item;
  };

  const usedCaptionsSet = new Set<string>();

  const getStoryCaption = (
    asset: typeof assets[0],
    level: "TEASER" | "SOFT" | "PPV",
    timeSlot: "morning" | "afternoon" | "evening" | "latenight",
    dayIdx: number
  ): string => {
    return composeStorylineCaption({
      asset: {
        ...asset,
        explicitLevel: level,
      },
      dayOfWeek: dayIdx % 7,
      dayIndex: dayIdx,
      timeSlot,
      modelName: params.modelName,
      modelTone: params.modelTone,
      usedCaptionsSet,
    });
  };

  for (let day = 0; day < days; day++) {
    const totalRemaining = teaserPool.length + softPool.length + ppvPool.length;
    if (totalRemaining === 0) {
      // ALL available media files scheduled! Stop to guarantee posts NEVER exceed files in folder!
      break;
    }

    // Determine post count for this day based on strategy
    let postCount = 1;
    const dayOfWeek = day % 7; // 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun

    switch (strategy) {
      case "REALISTIC": {
        const remainingDays = days - day;
        if (allowPauseDays && remainingDays > totalRemaining && (dayOfWeek === 6 || (dayOfWeek === 2 && day % 14 === 2))) {
          postCount = 0;
        } else if (dayOfWeek === 4 || dayOfWeek === 5 || totalRemaining > remainingDays) {
          postCount = 2;
        } else if (day % 5 === 0) {
          postCount = 2;
        } else {
          postCount = 1;
        }
        break;
      }
      case "VARIABLE_1_2": {
        if (allowPauseDays && day % 10 === 6) {
          postCount = 0;
        } else {
          postCount = [1, 2, 1, 2, 2, 2, 1][dayOfWeek];
        }
        break;
      }
      case "FIXED_1": {
        if (allowPauseDays && dayOfWeek === 6 && day % 14 === 6) {
          postCount = 0;
        } else {
          postCount = 1;
        }
        break;
      }
      case "FIXED_2": {
        if (allowPauseDays && dayOfWeek === 6 && day % 28 === 27) {
          postCount = 0;
        } else {
          postCount = 2;
        }
        break;
      }
      case "RELAXED": {
        if (dayOfWeek === 0 || dayOfWeek === 2 || dayOfWeek === 4) {
          postCount = 1;
        } else {
          postCount = 0;
        }
        break;
      }
      case "EVERY_2_DAYS": {
        postCount = day % 2 === 0 ? 1 : 0;
        break;
      }
      case "EVERY_3_DAYS": {
        postCount = day % 3 === 0 ? 1 : 0;
        break;
      }
      default:
        postCount = 1;
    }

    // Ensure we never plan more posts on this day than remaining assets
    postCount = Math.min(postCount, totalRemaining);
    if (postCount === 0) {
      continue;
    }

    for (let p = 0; p < postCount; p++) {
      let chosenAsset: typeof assets[0] | null = null;
      let starsPrice = 0;
      let caption = "";
      let timeOfDay = "";
      let slot: "morning" | "afternoon" | "evening" | "latenight" = "evening";

      if (postCount === 2) {
        if (p === 0) {
          // Slot 0 (Afternoon): 14:30
          timeOfDay = "14:30";
          slot = "afternoon";
          chosenAsset = takeAsset("TEASER");
          if (!chosenAsset) break;
          const isVid = chosenAsset.type === "VIDEO";
          starsPrice = isVid ? 50 : (chosenAsset.explicitLevel === "PPV" ? 150 : (chosenAsset.explicitLevel === "SOFT" ? 25 : 0));
        } else {
          // Slot 1 (Evening): 20:15 or 21:30
          timeOfDay = (dayOfWeek === 4 || dayOfWeek === 5) ? "21:30" : "20:15";
          slot = "evening";
          chosenAsset = takeAsset("PPV");
          if (!chosenAsset) break;
          const isVid = chosenAsset.type === "VIDEO";
          starsPrice = isVid ? 200 : (chosenAsset.explicitLevel === "PPV" ? 150 + ((day * 25) % 200) : (chosenAsset.explicitLevel === "SOFT" ? 35 : 0));
        }
      } else {
        // 1 post day: Alternate between Afternoon (14:30) and Evening (20:15 / 19:45)
        if (day % 3 === 0) {
          timeOfDay = "14:30";
          slot = "afternoon";
        } else {
          timeOfDay = (day % 2 === 0) ? "19:45" : "20:15";
          slot = "evening";
        }

        const preferredLevel: "TEASER" | "SOFT" | "PPV" = (day % 4 === 0) ? "TEASER" : (day % 4 === 1 ? "SOFT" : "PPV");
        chosenAsset = takeAsset(preferredLevel);
        if (!chosenAsset) break;

        const isVid = chosenAsset.type === "VIDEO";
        starsPrice = isVid ? 150 : (chosenAsset.explicitLevel === "PPV" ? 120 + ((day * 20) % 230) : (chosenAsset.explicitLevel === "SOFT" ? 25 : 0));
      }

      const isVideoAsset = chosenAsset.type === "VIDEO";
      if (isVideoAsset) {
        starsPrice = Math.max(starsPrice, 25);
      }

      caption = getStoryCaption(chosenAsset, chosenAsset.explicitLevel, slot, day);
      caption = ensureCaptionTimeConsistency(caption, timeOfDay);

      let timeOffsetDays = day;
      // Exact timing: if scheduled on Day 0 but time has already passed today, roll to Day 1
      if (day === 0) {
        const { getGermanDateParts } = require("./timezone");
        const nowG = getGermanDateParts(new Date());
        const curGTime = `${String(nowG.hour).padStart(2, "0")}:${String(nowG.minute).padStart(2, "0")}`;
        if (timeOfDay <= curGTime) {
          timeOffsetDays = 1;
        }
      }

      schedule.push({
        timeOffsetDays,
        timeOfDay,
        assetId: chosenAsset.id,
        caption: ensureCaptionTimeConsistency(sanitizeCaptionForMediaType(caption, chosenAsset.type), timeOfDay),
        starsPrice,
      });
    }
  }

  // If there are still unused assets in pools, backfill them into days with only 1 post (max 2 posts/day)
  let leftoverRemaining = teaserPool.length + softPool.length + ppvPool.length;
  if (leftoverRemaining > 0) {
    const postsPerDayMap = new Map<number, number>();
    schedule.forEach((p) => {
      postsPerDayMap.set(p.timeOffsetDays, (postsPerDayMap.get(p.timeOffsetDays) || 0) + 1);
    });

    for (let d = 0; d < days && leftoverRemaining > 0; d++) {
      const countOnDay = postsPerDayMap.get(d) || 0;
      if (countOnDay === 1) {
        const chosenAsset = takeAsset("PPV");
        if (!chosenAsset) break;
        const timeOfDay = "14:30";
        const slot = "afternoon";
        const isVid = chosenAsset.type === "VIDEO";
        let starsPrice = isVid ? 150 : (chosenAsset.explicitLevel === "PPV" ? 150 : (chosenAsset.explicitLevel === "SOFT" ? 25 : 0));
        if (isVid) starsPrice = Math.max(starsPrice, 25);
        const caption = getStoryCaption(chosenAsset, chosenAsset.explicitLevel, slot, d);

        let timeOffsetDays = d;
        if (d === 0) {
          const { getGermanDateParts } = require("./timezone");
          const nowG = getGermanDateParts(new Date());
          const curGTime = `${String(nowG.hour).padStart(2, "0")}:${String(nowG.minute).padStart(2, "0")}`;
          if (timeOfDay <= curGTime) {
            timeOffsetDays = 1;
          }
        }

        schedule.push({
          timeOffsetDays,
          timeOfDay,
          assetId: chosenAsset.id,
          caption: ensureCaptionTimeConsistency(sanitizeCaptionForMediaType(caption, chosenAsset.type), timeOfDay),
          starsPrice,
        });
        postsPerDayMap.set(d, 2);
        leftoverRemaining = teaserPool.length + softPool.length + ppvPool.length;
      }
    }

    schedule.sort((a, b) => {
      if (a.timeOffsetDays !== b.timeOffsetDays) return a.timeOffsetDays - b.timeOffsetDays;
      return a.timeOfDay.localeCompare(b.timeOfDay);
    });
  }

  // Calculate detailed statistics
  const postsByDay = new Map<number, number>();
  for (let d = 0; d < days; d++) postsByDay.set(d, 0);
  schedule.forEach(item => {
    postsByDay.set(item.timeOffsetDays, (postsByDay.get(item.timeOffsetDays) || 0) + 1);
  });

  let pauseDays = 0;
  let daysWithOnePost = 0;
  let daysWithTwoPosts = 0;
  postsByDay.forEach(count => {
    if (count === 0) pauseDays++;
    else if (count === 1) daysWithOnePost++;
    else if (count >= 2) daysWithTwoPosts++;
  });

  const stats: ScheduleStats = {
    totalPosts: schedule.length,
    totalDays: days,
    pauseDays,
    daysWithOnePost,
    daysWithTwoPosts,
    teaserCount: schedule.filter(p => p.starsPrice === 0).length,
    softCount: schedule.filter(p => p.starsPrice > 0 && p.starsPrice <= 50).length,
    ppvCount: schedule.filter(p => p.starsPrice > 50).length,
  };

  return { schedule, stats };
}

export const generateMockSchedule = generateRealisticSchedule;

export interface GrokClassificationDetails {
  tier: "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5";
  category: string;
  confidence: number;
}

export interface GrokAttributes {
  face_visible: boolean;
  body_writing: boolean;
  body_writing_text?: string | null;
  perspective: "Selfie" | "Mirror-Selfie" | "POV" | "Close-up" | "Full-Body" | "Third-Person" | string;
  setting: "Bedroom" | "Bathroom" | "Outdoor" | "Studio" | "Car" | "Living Room" | "Other" | string;
  fetish_tags?: string[];
}

export interface GrokQuality {
  score: number;
  lighting: string;
  sharpness: string;
}

export interface GrokImageClassification {
  title: string;
  theme: string;
  explicitLevel: "TEASER" | "SOFT" | "PPV";
  suggestedStarsPrice: number;
  tags: string[];
  notes: string;
  suggestedCaption: string;
  classification: GrokClassificationDetails;
  attributes: GrokAttributes;
  quality: GrokQuality;
  visibleFeatures?: string[];
}

/**
 * Evaluates and classifies a photo or video thumbnail using xAI Grok Vision.
 * Follows the 6-Tier Expositionsgrad system (Tier 0 to Tier 5) with secondary attributes and quality scoring.
 * For videos, the thumbnail image is evaluated alongside the extracted video duration.
 * Every video is strictly treated as VIP Content (PPV) with mandatory Stars pricing.
 */
export async function classifyImageWithGrokVision(params: {
  localFilePath: string;
  modelName?: string;
  modelTone?: string;
  isVideo?: boolean;
  videoDurationSeconds?: number;
  videoDurationFormatted?: string;
}): Promise<GrokImageClassification> {
  const fs = await import("fs");
  const path = await import("path");

  const ext = path.extname(params.localFilePath).toLowerCase();
  const isVideoExt = [".mp4", ".mov", ".mkv", ".avi", ".webm"].includes(ext);
  const isVideo = Boolean(params.isVideo) || isVideoExt;

  let imagePath = params.localFilePath;
  if (isVideo) {
    // For videos, strictly resolve to the thumbnail image (Titelbild), never pass the video container
    const { ensureVideoThumbnailExists } = await import("./video-thumbnails");
    imagePath = await ensureVideoThumbnailExists(params.localFilePath);
  } else if ([".gif"].includes(ext)) {
    throw new Error("GIFs are excluded from direct image Vision. Please classify them manually.");
  }

  // Ensure file exists
  if (!fs.existsSync(imagePath)) {
    throw new Error(`File not found on disk: ${imagePath}`);
  }

  const apiKey = process.env.XAI_API_KEY;
  let visionModel = process.env.XAI_VISION_MODEL || "grok-4.20-non-reasoning";
  if (
    visionModel.includes("grok-2-vision") ||
    visionModel === "grok-vision-beta" ||
    visionModel === "grok-beta"
  ) {
    visionModel = "grok-4.20-non-reasoning";
  }

  if (!apiKey || apiKey === "demo_xai_key") {
    throw new Error(
      "Kein gültiger XAI_API_KEY gefunden. Bitte trage einen aktiven xAI Grok API-Key in der .env ein."
    );
  }

  const fileBuffer = await fs.promises.readFile(imagePath);
  const imgExt = path.extname(imagePath).toLowerCase();
  let mimeType = "image/jpeg";
  if (imgExt === ".png") mimeType = "image/png";
  else if (imgExt === ".webp") mimeType = "image/webp";

  const base64Data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const durationSec = typeof params.videoDurationSeconds === "number" && params.videoDurationSeconds > 0
    ? params.videoDurationSeconds
    : 0;
  const durationLabel = params.videoDurationFormatted || (durationSec > 0 ? `${durationSec} Sekunden` : "Video-Clip");

  const promptBody = isVideo
    ? `You are Grok 4.20 Vision, the expert VIP Content Auditor for OnlyFans and Telegram Stars VIP Channels.
Audit the provided preview THUMBNAIL (cover image) for a VIDEO of creator "${params.modelName || "Creator"}".
Video Duration: ${durationSec} seconds (${durationLabel}).

CRITICAL BUSINESS RULES FOR VIDEOS:
1. INPUT PROVIDED:
   - You are provided exclusively with:
     a) The video's THUMBNAIL preview image (Titelbild).
     b) The exact VIDEO DURATION in numbers: ${durationSec} seconds (${durationLabel}).
2. EVERY VIDEO IS VIP CONTENT:
   - For all videos, explicitLevel MUST be "PPV"! No video can be free.
3. STARS PRICING (BASED ON DURATION & EXCLUSIVITY):
   - Every video requires Stars (minimum 25 Stars).
   - Short teaser clips (< 45s): 25 to 75 Stars.
   - Standard videos (45s - 3 min): 100 to 250 Stars.
   - Long / exclusive videos (> 3 min or high nudity): 250 to 500+ Stars.
4. AUTHENTIC CAPTION:
   - The suggested caption MUST refer to the video format and duration (${durationLabel}):
     e.g. "${durationLabel} Exklusiv-Content für euch 🔥 Direkt unten freischalten 🔓✨",
     "Ganze ${durationLabel} unzensierter VIP-Content nur für euch...".
   - NEVER refer to it as a photo or snapshot!

PRÄZISE DEFINITIONEN NACH EXPOSITIONSGRAD (TIERS):
- Tier 0: "SFW / Lifestyle" -> Vollständig bekleidet. Stars: 25-50 (da Video VIP).
- Tier 1: "Suggestive / Bademode" -> Knappe Kleidung / Bikini. Stars: 50-100.
- Tier 2: "Lingerie / Unterwäsche" -> Reizwäsche am Körper. Stars: 100-200.
- Tier 3: "Teilakt (Partial Nude)" -> Oben-ohne / verdeckter Akt. Stars: 200-350.
- Tier 4: "Vollakt (Full Nude)" -> Vollständige Nacktheit. Stars: 350-500.
- Tier 5: "Explizit / Interaktion" -> Sexuelle Handlungen / Toys. Stars: 500-800+.`
    : `You are Grok 4.20 Vision, the expert VIP Content Auditor for OnlyFans and Telegram Stars VIP Channels.
Analyze the provided photo of creator "${params.modelName || "Creator"}".

PRÄZISE DEFINITIONEN NACH EXPOSITIONSGRAD (TIERS):
- Tier 0: "SFW / Lifestyle" -> Vollständig bekleidet in normaler Alltagskleidung. Trägt z.B. T-Shirt, Band-Shirt, Top, Pullover, Hoodie, Jacke, Hose, Rock oder normales Kleid. WICHTIG: Auch wenn ein Bett, Schlafzimmer, Spiegel oder Sofa im Hintergrund zu sehen ist: Sobald normale Kleidung getragen wird, ist es ZWINGEND Tier 0! Stars: 0.
- Tier 1: "Suggestive / Bademode" -> Knappe Kleidung, aber gesellschaftlich öffentlich akzeptiert. Keine Unterwäsche. (Bikini, Badeanzug, knappe Sportkleidung, tiefer Ausschnitt, bauchfrei). Stars: 0-25.
- Tier 2: "Lingerie / Unterwäsche" -> Echte Reizwäsche oder Unterwäsche sichtbar direkt am Körper. (BH & Slip, Corsagen, Bodysuits, Strapsen, Boudoir). WICHTIG: Ein normales T-Shirt oder Streetwear ist NIEMALS Tier 2, auch nicht vor einem Bett! Stars: 25-75.
- Tier 3: "Teilakt (Partial Nude)" -> Gezielte Entblößung ohne direkte Genitalansicht. (Oben-ohne / Topless, unbedeckter Po / Rückansicht, verdeckter Akt mit Händen/Schatten). Stars: 100-250.
- Tier 4: "Vollakt (Full Nude)" -> Vollständige Nacktheit mit sichtbarem Genitalbereich. (Frontalakt, intime Close-ups, gespreizte Posen). Stars: 250-450.
- Tier 5: "Explizit / Interaktion" -> Direkte sexuelle Handlungen, Masturbation, Toys im Einsatz oder Partner-Content. Stars: 450-800+.

⛔ ABSOLUTE REGELN:
1. Bestimme ZUERST in "visual_audit.clothing_detected" objektiv die tatsächlich getragene Kleidung (z.B. "T-Shirt mit Print", "Hoodie", "BH & Slip", "Bikini", "Oben-Ohne").
2. Wenn die Person ein normales T-Shirt, einen Pullover, Hoodie oder Alltagskleidung trägt, MUSS das Tier zwingend "Tier 0" sein!
3. Ein Bett, Kissen oder Spiegel im Hintergrund macht ein Bild NIEMALS zu Lingerie oder Reizwäsche! Lingerie existiert NUR, wenn echte Unterwäsche sichtbar getragen wird.
4. Titel und Bildunterschrift müssen wahrheitsgetreu zum Bild passen: Ein T-Shirt-Spiegelselfie darf NIEMALS "Dessous" oder "Lingerie" genannt werden!`;

  const systemPrompt = `${promptBody}

STRICT JSON OUTPUT FORMAT:
{
  "visual_audit": {
    "clothing_detected": "z.B. T-Shirt mit Aufdruck",
    "is_fully_clothed": true,
    "is_underwear_actually_worn": false
  },
  "classification": {
    "tier": "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5",
    "category": "SFW / Lifestyle" | "Suggestive / Bademode" | "Lingerie / Unterwäsche" | "Teilakt (Partial Nude)" | "Vollakt (Full Nude)" | "Explizit / Interaktion",
    "confidence": 0.95
  },
  "attributes": {
    "face_visible": true,
    "body_writing": false,
    "body_writing_text": null,
    "perspective": "Mirror-Selfie" | "Selfie" | "POV" | "Close-up" | "Full-Body" | "Third-Person",
    "setting": "Bedroom" | "Bathroom" | "Outdoor" | "Studio" | "Car" | "Living Room" | "Other",
    "fetish_tags": []
  },
  "tags": ["Selfie", "Mirror", "Streetwear", "Lifestyle"],
  "quality": {
    "score": 7.5,
    "lighting": "Warm / Indoor",
    "sharpness": "Hoch"
  },
  "title": "Passender deutscher Titel zum echten Inhalt",
  "suggestedCaption": "Authentische deutsche Bildunterschrift",
  "suggestedStarsPrice": 0
}`;

  let response: Response | null = null;
  let lastErrorText = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: isVideo
                    ? `Hier ist das Titelbild (Vorschaubild) des Videos. Die Videolänge beträgt ${durationSec} Sekunden (${durationLabel}). Auditiere das Video objektiv anhand des Titelbilds und der Videolänge. Klassifiziere das Video als VIP Content (PPV) und bestimme Sterne-Preis, Titel, Thema, Tags und eine passende deutsche Bildunterschrift.`
                    : "Auditiere das Bild objektiv: 1. Beschreibe in visual_audit.clothing_detected die sichtbare Kleidung genau. 2. Wenn normale Oberbekleidung wie T-Shirt, Shirt, Hoodie getragen wird, MUSS es Tier 0 (SFW) sein, auch wenn im Hintergrund ein Bett steht. Erfinde niemals Lingerie/Dessous. Gib striktes JSON zurück.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: base64Data,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 600,
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        response = res;
        break;
      }

      lastErrorText = await res.text();
      console.warn(`[GrokVision] Attempt ${attempt}/2 failed (HTTP ${res.status}): ${lastErrorText.slice(0, 160)}`);

      // If it's a permanent error (not 429 or 5xx), break immediately to let refusal/fallback handle it
      if (res.status !== 429 && res.status < 500) {
        response = res;
        break;
      }

      // If rate limited or transient server error, wait briefly before retry
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    } catch (fetchErr: any) {
      console.warn(`[GrokVision] Attempt ${attempt}/2 fetch exception: ${fetchErr.message}`);
      if (attempt >= 2) throw fetchErr;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!response || !response.ok) {
    const errText = lastErrorText;
    console.error(`Grok Vision API error: ${errText}`);

    // Check if xAI refused due to explicit content or safety filter
    const isNsfwOrSafetyRefusal =
      errText.toLowerCase().includes("safety") ||
      errText.toLowerCase().includes("content") ||
      errText.toLowerCase().includes("policy") ||
      errText.toLowerCase().includes("moderation") ||
      errText.toLowerCase().includes("refusal") ||
      errText.toLowerCase().includes("inappropriate") ||
      errText.toLowerCase().includes("nsfw");

    if (isNsfwOrSafetyRefusal) {
      console.log(`[GrokVision] Content triggered xAI filter/refusal -> classifying as Tier 4 / PPV.`);
      const vidDurText = params.videoDurationFormatted || (params.videoDurationSeconds ? `${params.videoDurationSeconds}s` : "");
      return {
        explicitLevel: "PPV",
        title: isVideo ? `Exklusives VIP Video (${params.modelName || "Creator"})` : `Exklusiver VIP Vollakt (${params.modelName || "Creator"})`,
        theme: isVideo ? "VIP Video / Explicit" : "Vollakt / Explicit",
        tags: isVideo ? ["video", "vip", "ppv", "stars", "explicit", "tier4", "vollakt"] : ["tier4", "vollakt", "nude", "ppv", "explicit", "vip", "stars"],
        notes: `Grok 4.20 Vision: Tier 4 - Vollakt (Full Nude) | xAI NSFW-Filter ausgelöst${vidDurText ? ` | [DURATION:${params.videoDurationSeconds || 0}s]` : ""}`,
        suggestedCaption: isVideo
          ? `${params.videoDurationFormatted ? `${params.videoDurationFormatted} ` : ""}Exklusiv-Content für euch 🔥 Komplett unzensiert und in voller Bewegung! Jetzt freischalten 🔓✨`
          : "Streng geheim und unzensiert... 🤫 Nur für echte VIPs hier im Channel! Jetzt freischalten 🔓✨",
        suggestedStarsPrice: isVideo ? Math.max(350, (params.videoDurationSeconds && params.videoDurationSeconds > 180 ? 450 : 350)) : 350,
        classification: {
          tier: "Tier 4",
          category: "Vollakt (Full Nude)",
          confidence: 0.99,
        },
        attributes: {
          face_visible: true,
          body_writing: false,
          body_writing_text: null,
          perspective: "POV",
          setting: "Bedroom",
          fetish_tags: [],
        },
        quality: {
          score: 8.0,
          lighting: "Indoor",
          sharpness: "Hoch",
        },
        visibleFeatures: ["nude", "vollakt", "ppv"],
      };
    }

    const statusCode = response ? response.status : "Offline";
    throw new Error(`xAI Grok Vision API Fehler (${statusCode}): ${errText.slice(0, 180)}`);
  }

  const activeResponse = response as Response;
  const data = await activeResponse.json();
  const choice = data.choices?.[0];
  const refusal = choice?.message?.refusal;
  const rawJson = choice?.message?.content;

  if (refusal) {
    console.log(`[GrokVision] Model refused with: "${refusal}" -> classifying as Tier 4 / PPV.`);
    const vidDurText = params.videoDurationFormatted || (params.videoDurationSeconds ? `${params.videoDurationSeconds}s` : "");
    return {
      explicitLevel: "PPV",
      title: isVideo ? `Exklusives VIP Video (${params.modelName || "Creator"})` : `Exklusiver VIP Vollakt (${params.modelName || "Creator"})`,
      theme: isVideo ? "VIP Video / Explicit" : "Vollakt / Explicit",
      tags: isVideo ? ["video", "vip", "ppv", "stars", "explicit", "tier4", "vollakt"] : ["tier4", "vollakt", "nude", "ppv", "explicit", "vip", "stars"],
      notes: `Grok 4.20 Vision: Tier 4 - Vollakt (Full Nude) | xAI Refusal: ${refusal}${vidDurText ? ` | [DURATION:${params.videoDurationSeconds || 0}s]` : ""}`,
      suggestedCaption: isVideo
        ? `${params.videoDurationFormatted ? `${params.videoDurationFormatted} ` : ""}Exklusiv-Content für euch 🔥 Komplett unzensiert und in voller Bewegung! Jetzt freischalten 🔓✨`
        : "Streng geheim und unzensiert... 🤫 Nur für echte VIPs hier im Channel! Jetzt freischalten 🔓✨",
      suggestedStarsPrice: isVideo ? Math.max(350, (params.videoDurationSeconds && params.videoDurationSeconds > 180 ? 450 : 350)) : 350,
      classification: {
        tier: "Tier 4",
        category: "Vollakt (Full Nude)",
        confidence: 0.99,
      },
      attributes: {
        face_visible: true,
        body_writing: false,
        body_writing_text: null,
        perspective: "POV",
        setting: "Bedroom",
        fetish_tags: [],
      },
      quality: {
        score: 8.0,
        lighting: "Indoor",
        sharpness: "Hoch",
      },
      visibleFeatures: ["nude", "vollakt", "ppv"],
    };
  }

  if (!rawJson) {
    throw new Error("Grok 4.20 Vision hat keine Daten zurückgegeben (leere Antwort).");
  }

  // Robust JSON extraction removing markdown fences, leading/trailing text
  let cleanJson = rawJson.trim();
  cleanJson = cleanJson.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseErr) {
    throw new Error(`Grok 4.20 Vision Antwort konnte nicht als JSON interpretiert werden: ${cleanJson.slice(0, 100)}`);
  }

  const classification = parsed.classification || {
    tier: "Tier 0",
    category: "SFW / Lifestyle",
    confidence: 0.9,
  };
  const attributes = parsed.attributes || {
    face_visible: true,
    body_writing: false,
    body_writing_text: null,
    perspective: "Selfie",
    setting: "Bedroom",
    fetish_tags: [],
  };
  const quality = parsed.quality || {
    score: 7.0,
    lighting: "Gut",
    sharpness: "Hoch",
  };

  const visualAudit = parsed.visual_audit || {};
  const clothingDetected = String(visualAudit.clothing_detected || "").toLowerCase();
  const isFullyClothed = visualAudit.is_fully_clothed === true || visualAudit.is_fully_clothed === "true";
  const isUnderwearWorn = visualAudit.is_underwear_actually_worn === true || visualAudit.is_underwear_actually_worn === "true";

  let rawTier = String(classification.tier || "Tier 0").trim();

  // Guardrail: If model detected normal outerwear / t-shirt / hoodie / fully clothed,
  // but classified as Tier 1 or Tier 2 without actual underwear being worn:
  const hasOuterwear = /t-?shirt|shirt|hoodie|pullover|pulli|sweater|streetwear|alltagskleidung|jacke|jeans|hose/i.test(clothingDetected);
  if ((isFullyClothed || hasOuterwear) && !isUnderwearWorn && (rawTier === "Tier 1" || rawTier === "Tier 2")) {
    console.log(`[GrokVision] Guardrail triggered: outer clothing detected ("${clothingDetected}"), overriding ${rawTier} -> Tier 0`);
    rawTier = "Tier 0";
    classification.category = "SFW / Lifestyle";
  }

  const normalizedTier: "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5" =
    ["Tier 0", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5"].includes(rawTier)
      ? (rawTier as any)
      : "Tier 0";

  // Map Tier to Core Level (TEASER / SOFT / PPV)
  let explicitLevel: "TEASER" | "SOFT" | "PPV" = "TEASER";
  let suggestedStarsPrice = 0;

  if (normalizedTier === "Tier 0") {
    explicitLevel = "TEASER";
    suggestedStarsPrice = 0;
  } else if (normalizedTier === "Tier 1") {
    explicitLevel = "TEASER";
    suggestedStarsPrice = typeof parsed.suggestedStarsPrice === "number" && parsed.suggestedStarsPrice > 0
      ? Math.min(parsed.suggestedStarsPrice, 25)
      : 0;
  } else if (normalizedTier === "Tier 2") {
    explicitLevel = "SOFT";
    suggestedStarsPrice = typeof parsed.suggestedStarsPrice === "number" && parsed.suggestedStarsPrice > 0
      ? Math.min(Math.max(parsed.suggestedStarsPrice, 25), 75)
      : 50;
  } else if (normalizedTier === "Tier 3") {
    explicitLevel = "PPV";
    suggestedStarsPrice = typeof parsed.suggestedStarsPrice === "number" && parsed.suggestedStarsPrice >= 100
      ? Math.min(Math.max(parsed.suggestedStarsPrice, 100), 250)
      : 150;
  } else if (normalizedTier === "Tier 4") {
    explicitLevel = "PPV";
    suggestedStarsPrice = typeof parsed.suggestedStarsPrice === "number" && parsed.suggestedStarsPrice >= 200
      ? Math.min(Math.max(parsed.suggestedStarsPrice, 250), 450)
      : 350;
  } else if (normalizedTier === "Tier 5") {
    explicitLevel = "PPV";
    suggestedStarsPrice = typeof parsed.suggestedStarsPrice === "number" && parsed.suggestedStarsPrice >= 400
      ? Math.max(parsed.suggestedStarsPrice, 500)
      : 500;
  }

  // Generate enriched tags for easy filtering and searching
  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
  const fetishTags = Array.isArray(attributes.fetish_tags) ? attributes.fetish_tags : [];
  const tierSlug = normalizedTier.toLowerCase().replace(/\s+/g, ""); // "tier0", "tier1", ...
  const perspectiveSlug = attributes.perspective ? attributes.perspective.toLowerCase().replace(/[^a-z0-9]/g, "-") : "";
  const settingSlug = attributes.setting ? attributes.setting.toLowerCase().replace(/[^a-z0-9]/g, "-") : "";

  const systemGeneratedTags = [
    tierSlug,
    attributes.face_visible ? "face" : "no-face",
    perspectiveSlug,
    settingSlug,
    normalizedTier === "Tier 3" ? "topless" : "",
    normalizedTier === "Tier 3" ? "teilakt" : "",
    normalizedTier === "Tier 4" ? "vollakt" : "",
    normalizedTier === "Tier 4" ? "nude" : "",
    normalizedTier === "Tier 5" ? "explicit" : "",
    quality.score >= 8 ? "high-quality" : "",
    attributes.body_writing ? "body-writing" : "",
  ].filter(Boolean);

  let combinedTags = Array.from(
    new Set([
      ...systemGeneratedTags,
      ...fetishTags.map((t: string) => t.toLowerCase()),
      ...rawTags.map((t: string) => t.toLowerCase()),
    ])
  );

  let title = String(parsed.title || `${normalizedTier} - ${classification.category}`).trim();
  let suggestedCaption = String(parsed.suggestedCaption || "Kleiner Einblick für meine treuen VIPs 💕").trim();

  // Tier 0 Cleanup: purge hallucinated lingerie/erotic terms
  if (normalizedTier === "Tier 0") {
    const forbiddenTier0Tags = new Set([
      "lingerie", "dessous", "reizwäsche", "ass", "booty", "soft", "ppv",
      "bh", "slip", "panties", "thong", "g-string", "erotik", "intimate", "nude", "topless"
    ]);
    combinedTags = combinedTags.filter((t) => !forbiddenTier0Tags.has(t));

    if (/dessous|lingerie|reizwäsche|spitzen|bh\b|slip\b|panties|erotik/i.test(title)) {
      title = attributes.perspective?.toLowerCase().includes("selfie")
        ? "Casual Spiegelselfie"
        : "Casual Lifestyle Porträt";
    }

    if (/dessous|lingerie|reizwäsche|spitzen|bh\b|slip\b|ausziehen|sexy|intim/i.test(suggestedCaption)) {
      suggestedCaption = "Schönen Tag euch allen! Kleiner Schnappschuss für zwischendurch 💕✨";
    }
  }

  // Critical Business Rule: EVERY video is VIP Content (PPV) and requires Stars
  if (isVideo) {
    explicitLevel = "PPV";
    suggestedStarsPrice = Math.max(suggestedStarsPrice || 0, 25);
    if (!combinedTags.includes("video")) combinedTags.push("video");
    if (!combinedTags.includes("vip")) combinedTags.push("vip");
    if (!combinedTags.includes("ppv")) combinedTags.push("ppv");
    if (params.videoDurationFormatted) {
      const durTag = params.videoDurationFormatted.toLowerCase().replace(/[^a-z0-9]/g, "_");
      if (!combinedTags.includes(durTag)) combinedTags.push(durTag);
    }
    const durPrefix = params.videoDurationFormatted ? `${params.videoDurationFormatted} Exklusiv-Content für euch 🔥` : "Exklusiv-Content für euch 🔥";
    if (
      !suggestedCaption.toLowerCase().includes("minuten") &&
      !suggestedCaption.toLowerCase().includes("sekunden") &&
      !suggestedCaption.toLowerCase().includes("exklusiv")
    ) {
      suggestedCaption = `${durPrefix} ${suggestedCaption}`;
    }
    if (!title.toLowerCase().includes("video") && !title.toLowerCase().includes("clip")) {
      title = `${params.videoDurationFormatted ? `${params.videoDurationFormatted} ` : ""}VIP Video (${title})`;
    }
  }

  const structuredNotes = `[${normalizedTier}: ${classification.category} | Score: ${quality.score}/10 | ${attributes.perspective} | ${attributes.setting} | Face: ${attributes.face_visible ? "Ja" : "Nein"}${isVideo && params.videoDurationSeconds ? ` | [DURATION:${params.videoDurationSeconds}s]` : ""}]`;

  return {
    title,
    theme: classification.category,
    explicitLevel,
    suggestedStarsPrice,
    tags: combinedTags,
    notes: structuredNotes,
    suggestedCaption,
    classification: {
      tier: normalizedTier,
      category: classification.category,
      confidence: typeof classification.confidence === "number" ? classification.confidence : 0.95,
    },
    attributes: {
      face_visible: Boolean(attributes.face_visible),
      body_writing: Boolean(attributes.body_writing),
      body_writing_text: attributes.body_writing_text || null,
      perspective: attributes.perspective || "Selfie",
      setting: attributes.setting || "Bedroom",
      fetish_tags: fetishTags,
    },
    quality: {
      score: typeof quality.score === "number" ? quality.score : 7.0,
      lighting: quality.lighting || "Normal",
      sharpness: quality.sharpness || "Normal",
    },
    visibleFeatures: combinedTags,
  };
}

/**
 * Smart local fallback classifier when Grok API key is unconfigured or offline.
 */
export function generateFallbackClassification(
  filePath: string,
  modelName?: string,
  isVideo?: boolean,
  videoDurationFormatted?: string,
  videoDurationSeconds?: number
): GrokImageClassification {
  const path = require("path");
  const fileName = path.basename(filePath).toLowerCase();

  let explicitLevel: "TEASER" | "SOFT" | "PPV" = "TEASER";
  let tier: "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5" = "Tier 0";
  let category = "SFW / Lifestyle";
  let suggestedStarsPrice = 0;
  let title = "Casual Streetwear Portrait";
  let suggestedCaption = "Guten Morgen ihr Lieben! 💕 Ich wünsche euch einen wundervollen Start in den Tag ✨ Was habt ihr heute Schönes vor?";
  let tags = ["lifestyle", "selfie", "portrait"];
  let visibleFeatures: string[] = ["face"];

  if (isVideo) {
    explicitLevel = "PPV";
    tier = "Tier 3";
    category = "VIP Video Content";
    const durLabel = videoDurationFormatted || (videoDurationSeconds ? `${videoDurationSeconds}s` : "Clip");
    title = `${durLabel} Exklusiv-Video (${modelName || "Creator"})`;
    suggestedStarsPrice = videoDurationSeconds && videoDurationSeconds > 180 ? 350 : 150;
    tags = ["video", "vip", "ppv", "stars", ...(videoDurationFormatted ? [videoDurationFormatted.toLowerCase().replace(/[^a-z0-9]/g, "_")] : [])];
    visibleFeatures = ["video"];
    suggestedCaption = `${durLabel} Exklusiv-Content für euch 🔥 Komplett unzensiert in voller Bewegung! Jetzt unten freischalten 🔓✨`;
  } else if (fileName.includes("pussy") || fileName.includes("nude") || fileName.includes("naked") || fileName.includes("explicit") || fileName.includes("sex")) {
    explicitLevel = "PPV";
    tier = "Tier 4";
    category = "Vollakt (Full Nude)";
    title = "Intimer unzensierter Einblick";
    suggestedStarsPrice = 350;
    tags = ["pussy", "nude", "explicit", "vip", "stars", "tier4", "vollakt"];
    visibleFeatures = ["pussy", "ass", "tits"];
    suggestedCaption = "Ganz exklusiv und ohne jedes Geheimnis für meine treuesten VIPs... 🤫 Klickt unten auf den Stern um das unzensierte Set freizuschalten! 🌟🔞";
  } else if (fileName.includes("tits") || fileName.includes("boobs") || fileName.includes("topless") || fileName.includes("obenohne") || fileName.includes("brüste")) {
    explicitLevel = "PPV";
    tier = "Tier 3";
    category = "Teilakt (Partial Nude)";
    title = "Sinnliches Oben-Ohne Porträt";
    suggestedStarsPrice = 180;
    tags = ["tits", "topless", "nude", "vip", "tier3", "teilakt"];
    visibleFeatures = ["tits"];
    suggestedCaption = "Zu heiß für Instagram... 🔥 Schaltet das komplette Oben-Ohne Foto unten mit Telegram Stars frei! 🌟";
  } else if (fileName.includes("ass") || fileName.includes("booty") || fileName.includes("lingerie") || fileName.includes("dessous") || fileName.includes("boudoir")) {
    explicitLevel = "SOFT";
    tier = "Tier 2";
    category = "Lingerie / Unterwäsche";
    title = "Verführerisches Lingerie Set";
    suggestedStarsPrice = 50;
    tags = ["lingerie", "ass", "booty", "dessous", "tier2"];
    visibleFeatures = ["ass", "cleavage"];
    suggestedCaption = "Spitze auf der Haut und ein kleiner Blick hinter die Kulissen... Gefällt euch dieses Set? 😉💕";
  } else {
    explicitLevel = "TEASER";
    tier = "Tier 0";
    category = "SFW / Lifestyle";
    title = `Foto (${path.basename(filePath)})`;
    suggestedStarsPrice = 0;
    tags = ["foto", "unclassified", "tier0"];
    visibleFeatures = [];
    suggestedCaption = "Neuer Content für euch! 💕";
  }

  return {
    title,
    theme: category,
    explicitLevel,
    suggestedStarsPrice,
    tags,
    notes: `[${tier}: ${category}] Offline-Fallback (${modelName || "Model"})`,
    suggestedCaption,
    classification: {
      tier,
      category,
      confidence: 0.5,
    },
    attributes: {
      face_visible: true,
      body_writing: false,
      body_writing_text: null,
      perspective: "Selfie",
      setting: "Bedroom",
      fetish_tags: [],
    },
    quality: {
      score: 6.0,
      lighting: "Normal",
      sharpness: "Normal",
    },
    visibleFeatures,
  };
}


