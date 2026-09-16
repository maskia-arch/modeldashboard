import { z } from "zod";
import {
  extractAssetVisualContext,
  composeStorylineCaption,
  sanitizeCaptionForMediaType,
  ensureCaptionTimeConsistency,
} from "./captions";

export const ScheduleItemSchema = z.object({
  timeOffsetDays: z.number().int().min(0).max(120), // Support up to 4 months (120 days)
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

export type SchedulingStrategy = "REALISTIC" | "VARIABLE_1_2" | "FIXED_1" | "FIXED_2" | "RELAXED";

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
  targetDays?: number; // e.g. 14, 30, 60, 90, 120 days plan
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

  const requestedDays = Math.min(Math.max(params.targetDays || 30, 1), 120);

  if (!apiKey || apiKey === "demo_xai_key") {
    // If no live key is set, return a high-quality deterministic realistic plan
    return generateRealisticSchedule(params);
  }

  // To guarantee the response returns within 3-4 seconds and completely avoids reverse-proxy 520 timeouts:
  // We ask Grok to design the core narrative anchor posts (up to 4 days with up to 6 key assets).
  // If requestedDays > 4, we seamlessly extend the storyline across the remaining days locally in 3ms.
  const grokTargetDays = Math.min(requestedDays, 4);

  // Pick up to 6 representative anchor assets across tiers for Grok's opening narrative
  const teaserAssets = params.availableAssets.filter((a) => a.explicitLevel === "TEASER");
  const softAssets = params.availableAssets.filter((a) => a.explicitLevel === "SOFT");
  const ppvAssets = params.availableAssets.filter((a) => a.explicitLevel === "PPV");

  const grokAssets: typeof params.availableAssets = [];
  grokAssets.push(...teaserAssets.slice(0, 2));
  grokAssets.push(...softAssets.slice(0, 2));
  grokAssets.push(...ppvAssets.slice(0, 2));

  if (grokAssets.length < 6) {
    const includedIds = new Set(grokAssets.map((a) => a.id));
    for (const a of params.availableAssets) {
      if (!includedIds.has(a.id)) {
        grokAssets.push(a);
        includedIds.add(a.id);
        if (grokAssets.length >= 6) break;
      }
    }
  }

  const { getGermanDateParts } = await import("./timezone");
  const nowGerman = getGermanDateParts(new Date());
  const currentGermanTimeStr = `${String(nowGerman.hour).padStart(2, "0")}:${String(nowGerman.minute).padStart(2, "0")}`;

  const systemPrompt = `You are the authentic, intimate German creator voice for "${params.modelName}" on Telegram.
You are designing a narrative-driven, authentic content schedule across ${grokTargetDays} days for her Telegram VIP Channel.
Tone & Persona: ${params.modelTone || "Authentic, intimate, charming, playful, flirty German creator"}.
Strategy: ${params.strategy || "REALISTIC"} (Realistic posting rhythm with rest days and weekend peaks).

CURRENT TIME CONTEXT (Europe/Berlin):
- Right now in Germany it is ${currentGermanTimeStr} Uhr. Day 0 is TODAY.
- If it is already past 11:30 in Germany: Morning slots (07:00 - 11:30) for Day 0 have ALREADY PASSED!
  Any morning posts ("Guten Morgen", coffee, waking thoughts) MUST be scheduled for Day 1 (tomorrow morning, e.g. 09:30 or 10:15) or later!
  Day 0 may only have slots strictly AFTER ${currentGermanTimeStr} Uhr.
- If it is already past 21:00 in Germany: Day 0 has ended; start your schedule on Day 1 (tomorrow morning).
- Every post will be scheduled at its EXACT planned "timeOfDay" and "timeOffsetDays".

CORE PRINCIPLES:
1. AUTHENTIC FIRST-PERSON MESSAGES (NO MARKETING SPEAK!):
   - You write exclusively in first-person ("ich", "mein", "euch", "meine Lieben").
   - It must feel like an intimate personal text message or voice note from the model directly to her subscribers.
   - NEVER use corporate or marketing phrases like "Exklusiver VIP Content", "Mein persönliches Lieblingsfoto des Monats", "Klickt unten auf den Stern".

2. COHESIVE STORYLINE & NARRATIVE ARC:
   - Schedule posts that tell an ongoing story across days and hours:
     * Morning (09:00 - 11:30): Waking up in bed, morning coffee, waking thoughts, checking in on the community ("Guten Morgen ihr Lieben ☕...").
     * Midday/Afternoon (13:00 - 16:30): Casual lifestyle, workout, errands, outfit check, what she's doing today, asking fans a question.
     * Evening (18:30 - 21:00): Feierabend, winding down on the couch, relaxing, getting ready to go out, teasing the night ahead.
     * Late Night / Drop (21:30 - 00:30): Intimate bedtime thoughts, sleeplessness, drops of spicy PPV content, whispering mood ("Kann noch nicht schlafen...").
     * Weekly flow: Mon/Tue chill start -> Wed/Thu anticipation & sneak peeks -> Fri/Sat peak VIP drops & party/weekend vibe -> Sun relaxed cuddling & recovery.

3. DEEP CONNECTION TO VISUAL ANALYSIS:
   - For every asset, you are provided with: 'setting', 'clothing', 'perspective', and 'highlights' (e.g. tattoos, shower, wet hair, bed, oversized hoodie).
   - You MUST explicitly and organically reference what is actually visible in the media:
     * Setting in Bathroom / Mirror -> mention the bathroom mirror, shower, getting ready, or wet hair.
     * Setting in Bed / Bedroom -> mention relaxing in bed, cuddling under the blanket, sleepless night, pillows. (If posted in the evening, talk about an evening bedtime/cuddle mood, NOT "Guten Morgen"!).
     * Clothing Oversized Hoodie -> joke about wearing cozy oversized loungewear and what might (or might not) be underneath.
     * Tattoos visible -> mention your tattoos, asking how they like the ink on your skin.
     * Topless / Nude PPV drop -> be intimate, personal and vulnerable, teasing that you dared to share something private.

4. VIDEO DURATION & EXCLUSIVITY (CRITICAL):
   - For VIDEO assets, you receive 'videoDuration' (e.g. "10 Minuten", "45 Sekunden" or "2 Min. 15 Sek."):
     * EVERY video is VIP Content! Even video teasers / previews cost Stars (min 25 Stars).
     * The caption MUST prominently emphasize the duration and exclusivity:
       e.g. "\${videoDuration} Exklusiv-Content für euch 🔥 Direkt unten freischalten 🔓✨",
       "Ganze \${videoDuration} pure Intimität komplett ohne Schnitt... 🔥 Holt euch den Clip direkt in den Chat 🌟".
     * Never call a video a photo or snapshot!

5. CRITICAL MEDIA FORMAT INTEGRITY:
   - For 'PHOTO' assets: NEVER use words like "Video", "Clip", "Film", "gefilmt", etc. You must use authentic photo words like "Foto", "Bild", "Schnappschuss", "Shooting", "Aufnahme", "Spiegelselfie".
   - For 'VIDEO' assets: Refer to it accurately as "Video", "Clip", "Aufnahme". Do NOT call it a photo or snapshot.

6. ZERO REPETITION:
   - Every single caption MUST be unique in wording, emotion, and angle. Never reuse identical hooks or phrases across days.

7. PRICING RULES:
   - ALL VIDEO ASSETS: Must have starsPrice >= 25 (e.g. 25-50 for teaser clips, 100-250 for standard, 250-450 for full/explicit).
   - PHOTO TEASER assets: starsPrice = 0.
   - PHOTO SOFT assets: starsPrice = 15 to 50.
   - PHOTO PPV assets: starsPrice = 100 to 450.

8. ABSOLUTE STRICT TIME-OF-DAY CONSISTENCY:
   - "timeOfDay" dictates the greeting and emotional context:
     * If timeOfDay >= "12:00" (e.g. 14:00, 19:30, 20:00, 20:15, 21:00): It is STRICTLY FORBIDDEN to say "Guten Morgen", "Morgengruß", "Start in den Tag", "direkt nach dem Aufstehen", or "erstmal drei Kaffee"!
     * For 18:00 - 21:59: You MUST use evening greetings ("Schönen Feierabend", "Guten Abend meine Lieben", "Gemütlicher Abend", "Ausgehen").
     * For 22:00 - 05:00: You MUST use late-night thoughts ("Gute Nacht", "Kann noch nicht schlafen", "Später Einblick").
     * "Guten Morgen" is EXCLUSIVELY permitted for morning slots between 07:00 and 11:30!

9. STRICT 1-TO-1 ASSET USAGE (NO DUPLICATE ASSETS):
   - Every post in "schedule" MUST reference a unique "assetId". NEVER reuse an assetId more than once.
   - Do NOT schedule more posts than the number of available assets provided.
   - Return STRICT valid JSON conforming to the schema.`;

  const enrichedAssets = grokAssets.map((a) => {
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

  const userPrompt = `Assets available for scheduling with rich visual context & duration:
${JSON.stringify(enrichedAssets, null, 2)}

Create a posting plan over ${grokTargetDays} days using the provided asset IDs with strategy: ${params.strategy || "REALISTIC"}, allowPauseDays: ${params.allowPauseDays ?? true}.
Respond in strict JSON with the following structure:
{
  "schedule": [
    {
      "timeOffsetDays": 0,
      "timeOfDay": "11:00",
      "assetId": "asset-uuid",
      "caption": "Authentische, persönliche deutsche Bildunterschrift mit direktem Bezug zum Bild...",
      "starsPrice": 0
    }
  ]
}`;

  // 7.5s hard timeout: well below reverse-proxy 520 / 524 limits (15-20s).
  // If Grok doesn't answer within 7.5s, fallback instantly generates the full schedule locally in 2ms.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7500);

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
        response_format: {
          type: "json_object",
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`xAI API returned non-OK ${response.status}: ${errText}. Falling back to realistic scheduler.`);
      return generateRealisticSchedule(params);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.warn("Empty response from xAI Grok API. Falling back to realistic scheduler.");
      return generateRealisticSchedule(params);
    }

    const parsedJson = JSON.parse(rawContent);
    const validated = GrokScheduleResponseSchema.parse(parsedJson);

    // Format integrity: Deduplicate by assetId and sanitize all captions against media type and time of day
    const assetMap = new Map(params.availableAssets.map((a) => [a.id, a]));
    const seenAssetIds = new Set<string>();
    const deduplicatedSchedule: typeof validated.schedule = [];

    for (const item of validated.schedule) {
      if (!seenAssetIds.has(item.assetId) && assetMap.has(item.assetId)) {
        seenAssetIds.add(item.assetId);
        const asset = assetMap.get(item.assetId)!;
        const isVideo = asset.type === "VIDEO";
        let starsPrice = item.starsPrice;
        if (isVideo) {
          starsPrice = Math.max(starsPrice, 25);
        }

        let timeOffsetDays = item.timeOffsetDays;
        // Exact timing protection: if planned for Day 0 but time has already passed today, roll forward to tomorrow at exact time
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
    validated.schedule = deduplicatedSchedule;

    // If user requested more days than the Grok anchor window (e.g. 30, 60, 90 days),
    // extend the schedule ONLY with remaining unused assets (NEVER recycle used assets!)
    if (requestedDays > grokTargetDays && validated.schedule.length > 0) {
      const unusedAssets = params.availableAssets.filter((a) => !seenAssetIds.has(a.id));
      let nextUnusedIdx = 0;
      const usedCaptionsSet = new Set(validated.schedule.map((p) => p.caption));

      const maxGrokDay = Math.max(...validated.schedule.map((p) => p.timeOffsetDays), grokTargetDays - 1);

      for (let d = maxGrokDay + 1; d < requestedDays; d++) {
        if (nextUnusedIdx >= unusedAssets.length) {
          // All available assets scheduled! Stop so post count NEVER exceeds files in folder!
          break;
        }

        const dayOfWeek = d % 7;
        const remainingUnused = unusedAssets.length - nextUnusedIdx;
        const remainingDays = requestedDays - d;

        // Only pause if there are plenty of days left to schedule remaining assets
        const isPauseDay = (params.allowPauseDays ?? true) && (remainingDays > remainingUnused) && (dayOfWeek === 6 || (dayOfWeek === 2 && d % 14 === 2));
        if (isPauseDay) continue;

        // Schedule 2 posts on weekend peaks OR when there are more assets than remaining days
        const postCount = ((dayOfWeek === 4 || dayOfWeek === 5) || remainingUnused > remainingDays) && remainingUnused >= 2 ? 2 : 1;
        for (let p = 0; p < postCount && nextUnusedIdx < unusedAssets.length; p++) {
          const asset = unusedAssets[nextUnusedIdx++];
          seenAssetIds.add(asset.id);
          const timeOfDay = p === 0 ? (postCount === 2 ? "14:30" : "20:15") : "20:45";
          const slot: "morning" | "afternoon" | "evening" | "latenight" = p === 0 ? (postCount === 2 ? "afternoon" : "evening") : "evening";
          const isVideo = asset.type === "VIDEO";
          const level = asset.explicitLevel;
          let starsPrice = isVideo ? (level === "PPV" ? 200 : 50) : (level === "PPV" ? 150 : (level === "SOFT" ? 25 : 0));
          if (isVideo) starsPrice = Math.max(starsPrice, 25);

          const caption = composeStorylineCaption({
            asset,
            dayOfWeek,
            dayIndex: d,
            timeSlot: slot,
            modelName: params.modelName,
            usedCaptionsSet,
          });

          validated.schedule.push({
            timeOffsetDays: d,
            timeOfDay,
            assetId: asset.id,
            caption: ensureCaptionTimeConsistency(caption, timeOfDay),
            starsPrice,
          });
        }
      }

      // If there are still unused assets, backfill them into days with only 1 post (max 2 posts/day)
      if (nextUnusedIdx < unusedAssets.length) {
        const postsPerDayMap = new Map<number, number>();
        validated.schedule.forEach((p) => {
          postsPerDayMap.set(p.timeOffsetDays, (postsPerDayMap.get(p.timeOffsetDays) || 0) + 1);
        });

        for (let d = 0; d < requestedDays && nextUnusedIdx < unusedAssets.length; d++) {
          const countOnDay = postsPerDayMap.get(d) || 0;
          if (countOnDay === 1) {
            const asset = unusedAssets[nextUnusedIdx++];
            seenAssetIds.add(asset.id);
            const isVideo = asset.type === "VIDEO";
            const level = asset.explicitLevel;
            let starsPrice = isVideo ? (level === "PPV" ? 200 : 50) : (level === "PPV" ? 150 : (level === "SOFT" ? 25 : 0));
            if (isVideo) starsPrice = Math.max(starsPrice, 25);
            const caption = composeStorylineCaption({
              asset,
              dayOfWeek: d % 7,
              dayIndex: d,
              timeSlot: "afternoon",
              modelName: params.modelName,
              usedCaptionsSet,
            });

            validated.schedule.push({
              timeOffsetDays: d,
              timeOfDay: "14:30",
              assetId: asset.id,
              caption: ensureCaptionTimeConsistency(caption, "14:30"),
              starsPrice,
            });
            postsPerDayMap.set(d, 2);
          }
        }
      }

      // Re-sort schedule by timeOffsetDays and timeOfDay
      validated.schedule.sort((a, b) => {
        if (a.timeOffsetDays !== b.timeOffsetDays) return a.timeOffsetDays - b.timeOffsetDays;
        return a.timeOfDay.localeCompare(b.timeOfDay);
      });
    }

    // Hard ceiling: A schedule must NEVER contain more posts than available assets!
    if (validated.schedule.length > params.availableAssets.length) {
      validated.schedule = validated.schedule.slice(0, params.availableAssets.length);
    }

    // Calculate stats for the full requestedDays schedule
    const postsByDay = new Map<number, number>();
    for (let d = 0; d < requestedDays; d++) postsByDay.set(d, 0);
    validated.schedule.forEach((item) => {
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

    validated.stats = {
      totalPosts: validated.schedule.length,
      totalDays: requestedDays,
      pauseDays,
      daysWithOnePost,
      daysWithTwoPosts,
      teaserCount: validated.schedule.filter((p) => p.starsPrice === 0).length,
      softCount: validated.schedule.filter((p) => p.starsPrice > 0 && p.starsPrice <= 50).length,
      ppvCount: validated.schedule.filter((p) => p.starsPrice > 50).length,
    };

    return validated;
  } catch (error) {
    console.warn("xAI Grok call timed out or failed. Generating realistic schedule locally:", error);
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
  const days = Math.min(Math.max(params.targetDays || 30, 1), 120);
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
  if (isVideoExt) {
    // If a video container was passed directly, look for its thumbnail image
    const candidateThumb = params.localFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".jpg");
    if (fs.existsSync(candidateThumb)) {
      imagePath = candidateThumb;
    }
  } else if ([".gif"].includes(ext)) {
    throw new Error("GIFs are excluded from direct image Vision. Please classify them manually.");
  }

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

  const durationLabel = params.videoDurationFormatted || (params.videoDurationSeconds ? `${params.videoDurationSeconds} Sekunden` : "Video-Clip");

  const promptBody = isVideo
    ? `You are Grok 4.20 Vision, the expert VIP Content Auditor for OnlyFans and Telegram Stars VIP Channels.
Analyze the provided preview THUMBNAIL for a VIDEO of creator "${params.modelName || "Creator"}".
Video Duration: ${durationLabel}.

CRITICAL BUSINESS RULES FOR VIDEOS:
1. EVERY VIDEO IS VIP CONTENT:
   - For all videos, explicitLevel MUST be "PPV"! No video can be free.
2. STARS PRICING:
   - Even video teasers / previews REQUIRE Stars!
   - Short teaser clips (< 45s): 25 to 75 Stars.
   - Standard videos (45s - 3 min): 100 to 250 Stars.
   - Long / exclusive videos (> 3 min or high nudity): 250 to 500+ Stars.
3. AUTHENTIC CAPTION:
   - The suggested caption MUST refer to the video format and duration:
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

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

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
                  text: "Auditiere das Bild objektiv: 1. Beschreibe in visual_audit.clothing_detected die sichtbare Kleidung genau. 2. Wenn normale Oberbekleidung wie T-Shirt, Shirt, Hoodie getragen wird, MUSS es Tier 0 (SFW) sein, auch wenn im Hintergrund ein Bett steht. Erfinde niemals Lingerie/Dessous. Gib striktes JSON zurück.",
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
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        response = res;
        break;
      }

      lastErrorText = await res.text();
      console.warn(`[GrokVision] Attempt ${attempt}/3 failed (HTTP ${res.status}): ${lastErrorText.slice(0, 160)}`);

      // If it's a permanent error (not 429 or 5xx), break immediately to let refusal/fallback handle it
      if (res.status !== 429 && res.status < 500) {
        response = res;
        break;
      }

      // If rate limited or transient server error, wait before retry
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    } catch (fetchErr: any) {
      console.warn(`[GrokVision] Attempt ${attempt}/3 fetch exception: ${fetchErr.message}`);
      if (attempt >= 3) throw fetchErr;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
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
    console.warn("Empty response from Grok Vision, using fallback classification.");
    return generateFallbackClassification(params.localFilePath, params.modelName, isVideo, params.videoDurationFormatted, params.videoDurationSeconds);
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
    console.warn("[GrokVision] JSON parse failed on raw output, using fallback parser:", rawJson);
    return generateFallbackClassification(params.localFilePath, params.modelName, isVideo, params.videoDurationFormatted, params.videoDurationSeconds);
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


