import { z } from "zod";
import {
  PHOTO_TEASER_CAPTIONS,
  PHOTO_SOFT_CAPTIONS,
  PHOTO_PPV_CAPTIONS,
  VIDEO_TEASER_CAPTIONS,
  VIDEO_SOFT_CAPTIONS,
  VIDEO_PPV_CAPTIONS,
  sanitizeCaptionForMediaType,
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
  }>;
}

/**
 * Calls xAI Grok API with Strict JSON schema and an AbortController timeout.
 * Automatically falls back to generateRealisticSchedule if xAI is unconfigured,
 * times out, or encounters any upstream error.
 */
export async function generateGrokSchedule(params: GenerateScheduleParams): Promise<GrokScheduleResponse> {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL || "grok-beta";

  if (!apiKey || apiKey === "demo_xai_key") {
    // If no live key is set, return a high-quality deterministic realistic plan
    return generateRealisticSchedule(params);
  }

  const systemPrompt = `You are an elite Telegram Creator Content Strategist and Copywriter for Adult & Glamour Models.
Your goal is to build an engaging, authentic, revenue-maximizing content schedule across ${params.targetDays || 30} days for the creator "${params.modelName}".
Tone & Persona: ${params.modelTone || "Authentic, alluring, conversational German Telegram channel"}.
Strategy: ${params.strategy || "REALISTIC"} (Realistic posting rhythm with occasional rest days, peak engagement on weekends).

Rules:
1. For TEASER assets: starsPrice must be 0 (Free promotional content to drive engagement).
2. For SOFT assets: starsPrice should usually be 0 (engagement) or small tip (5-30 stars).
3. For PPV (Pay-Per-View) assets: starsPrice must be between 50 and 450 stars depending on allure.
4. Schedule posts at high-engagement hours (e.g., 09:30, 12:45, 18:30, 21:15, 23:00).
5. Captions must sound completely natural, seductive, and enticing with emojis, written in German.
6. Return STRICT valid JSON matching the schema provided. Do not include markdown wraps or extra commentary.
7. CRITICAL MEDIA FORMAT INTEGRITY:
   - For 'PHOTO' assets: NEVER use words like "Video", "Clip", "Film", "gefilmt", etc. You must use authentic photo words like "Foto", "Bild", "Schnappschuss", "Shooting", "Aufnahme", "Spiegelselfie".
   - For 'VIDEO' assets: Refer to it accurately as "Video", "Clip", "Aufnahme". Do NOT call it a photo or snapshot.`;

  const userPrompt = `Assets available for scheduling:
${JSON.stringify(params.availableAssets.slice(0, 50), null, 2)}

Create a posting plan over ${params.targetDays || 30} days using the provided asset IDs with strategy: ${params.strategy || "REALISTIC"}, allowPauseDays: ${params.allowPauseDays ?? true}.
Respond in strict JSON with the following structure:
{
  "schedule": [
    {
      "timeOffsetDays": 0,
      "timeOfDay": "11:00",
      "assetId": "asset-uuid",
      "caption": "Teaser caption here...",
      "starsPrice": 0
    }
  ]
}`;

  // 10s timeout to prevent Nginx Gateway 504 Timeouts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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

    // Format integrity: Sanitize all captions against actual asset media types
    const assetMap = new Map(params.availableAssets.map((a) => [a.id, a]));
    validated.schedule = validated.schedule.map((item) => {
      const asset = assetMap.get(item.assetId);
      const mediaType = asset ? asset.type : "PHOTO";
      return {
        ...item,
        caption: sanitizeCaptionForMediaType(item.caption, mediaType),
      };
    });

    // Calculate stats for the validated schedule
    const days = params.targetDays || 30;
    const postsByDay = new Map<number, number>();
    for (let d = 0; d < days; d++) postsByDay.set(d, 0);
    validated.schedule.forEach(item => {
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

    validated.stats = {
      totalPosts: validated.schedule.length,
      totalDays: days,
      pauseDays,
      daysWithOnePost,
      daysWithTwoPosts,
      teaserCount: validated.schedule.filter(p => p.starsPrice === 0).length,
      softCount: validated.schedule.filter(p => p.starsPrice > 0 && p.starsPrice <= 50).length,
      ppvCount: validated.schedule.filter(p => p.starsPrice > 50).length,
    };

    return validated;
  } catch (error) {
    clearTimeout(timeoutId);
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


  let assetIndex = 0;
  let teaserIdx = 0;
  let softIdx = 0;
  let ppvIdx = 0;

  const getFormatCaption = (
    asset: typeof assets[0],
    level: "TEASER" | "SOFT" | "PPV"
  ): string => {
    const isVideo = asset.type === "VIDEO";
    let raw = "";
    if (level === "TEASER") {
      const bank = isVideo ? VIDEO_TEASER_CAPTIONS : PHOTO_TEASER_CAPTIONS;
      raw = bank[(teaserIdx++) % bank.length];
    } else if (level === "SOFT") {
      const bank = isVideo ? VIDEO_SOFT_CAPTIONS : PHOTO_SOFT_CAPTIONS;
      raw = bank[(softIdx++) % bank.length];
    } else {
      const bank = isVideo ? VIDEO_PPV_CAPTIONS : PHOTO_PPV_CAPTIONS;
      const themeTag = asset.theme ? `[${asset.theme}] ` : "";
      raw = bank[(ppvIdx++) % bank.length].replace("[THEME]", themeTag);
    }
    return sanitizeCaptionForMediaType(raw, asset.type);
  };

  for (let day = 0; day < days; day++) {
    // Determine post count for this day based on strategy
    let postCount = 1;
    const dayOfWeek = day % 7; // 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun

    switch (strategy) {
      case "REALISTIC": {
        // Natural model pacing:
        // - Sunday (6) or alternating Wednesday (2): Pause day (0 posts) if allowPauseDays
        // - Friday (4), Saturday (5): Peak days (2 posts)
        // - Weekdays: 1 post (or occasional 2 posts on paywall drop day)
        if (allowPauseDays && (dayOfWeek === 6 || (dayOfWeek === 2 && day % 14 === 2))) {
          postCount = 0; // Model rest / creative offline day
        } else if (dayOfWeek === 4 || dayOfWeek === 5) {
          postCount = 2; // Weekend high-engagement peaks
        } else if (day % 5 === 0) {
          postCount = 2; // Mid-week feature drop
        } else {
          postCount = 1; // Standard daily connection
        }
        break;
      }
      case "VARIABLE_1_2": {
        // Alternates between 1 and 2 posts, with optional rare pause day
        if (allowPauseDays && day % 10 === 6) {
          postCount = 0;
        } else {
          // Dynamic rhythm: [1, 2, 1, 2, 2, 2, 1]
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
        // Posts every 2-3 days (e.g., Mon, Wed, Fri/Sat)
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

    if (postCount === 0) {
      continue;
    }

    for (let p = 0; p < postCount; p++) {
      let chosenAsset;
      let starsPrice = 0;
      let caption = "";
      let timeOfDay = "";

      // For 2-post days:
      // Post 0: Morning/Afternoon Teaser or Soft (0-25 Stars)
      // Post 1: Evening/Late Night PPV Paywall (100-350 Stars)
      if (postCount === 2) {
        if (p === 0) {
          timeOfDay = morningTimes[(day + p) % morningTimes.length];
          chosenAsset = teaserAssets.length > 0
            ? teaserAssets[assetIndex % teaserAssets.length]
            : assets[assetIndex % assets.length];
          starsPrice = 0;
          caption = getFormatCaption(chosenAsset, "TEASER");
        } else {
          timeOfDay = (dayOfWeek === 4 || dayOfWeek === 5)
            ? lateNightTimes[(day + p) % lateNightTimes.length]
            : eveningTimes[(day + p) % eveningTimes.length];

          if (ppvAssets.length > 0) {
            chosenAsset = ppvAssets[assetIndex % ppvAssets.length];
            starsPrice = 100 + ((day * 35) % 250); // 100 to 350 Stars
            caption = getFormatCaption(chosenAsset, "PPV");
          } else if (softAssets.length > 0) {
            chosenAsset = softAssets[assetIndex % softAssets.length];
            starsPrice = 50;
            caption = getFormatCaption(chosenAsset, "SOFT");
          } else {
            chosenAsset = assets[assetIndex % assets.length];
            starsPrice = 100;
            caption = getFormatCaption(chosenAsset, "PPV");
          }
        }
      } else {
        // 1 post day: Balanced distribution (40% Teaser, 30% Soft, 30% PPV)
        timeOfDay = (day % 2 === 0)
          ? morningTimes[day % morningTimes.length]
          : eveningTimes[day % eveningTimes.length];

        const roll = (day * 13) % 10; // 0-9
        if (roll < 4 || (ppvAssets.length === 0 && softAssets.length === 0)) {
          // Teaser
          chosenAsset = teaserAssets.length > 0
            ? teaserAssets[assetIndex % teaserAssets.length]
            : assets[assetIndex % assets.length];
          starsPrice = 0;
          caption = getFormatCaption(chosenAsset, "TEASER");
        } else if (roll < 7 && softAssets.length > 0) {
          // Soft
          chosenAsset = softAssets[assetIndex % softAssets.length];
          starsPrice = (day % 3 === 0) ? 25 : 0;
          caption = getFormatCaption(chosenAsset, "SOFT");
        } else {
          // PPV
          chosenAsset = (ppvAssets.length > 0)
            ? ppvAssets[assetIndex % ppvAssets.length]
            : (softAssets.length > 0 ? softAssets[assetIndex % softAssets.length] : assets[assetIndex % assets.length]);
          starsPrice = 120 + ((day * 20) % 230); // 120 to 350 Stars
          caption = getFormatCaption(chosenAsset, "PPV");
        }
      }

      assetIndex++;

      schedule.push({
        timeOffsetDays: day,
        timeOfDay,
        assetId: chosenAsset.id,
        caption: sanitizeCaptionForMediaType(caption, chosenAsset.type),
        starsPrice,
      });
    }
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
 * Evaluates and classifies a photo using xAI Grok Vision.
 * Follows the 6-Tier Expositionsgrad system (Tier 0 to Tier 5) with secondary attributes and quality scoring.
 * Videos and GIFs are explicitly prohibited from being passed to this function.
 */
export async function classifyImageWithGrokVision(params: {
  localFilePath: string;
  modelName?: string;
  modelTone?: string;
}): Promise<GrokImageClassification> {
  const fs = await import("fs");
  const path = await import("path");

  const ext = path.extname(params.localFilePath).toLowerCase();
  if ([".mp4", ".mov", ".mkv", ".avi", ".gif"].includes(ext)) {
    throw new Error("Videos and GIFs are excluded from Grok Vision. They must be classified manually.");
  }

  if (!fs.existsSync(params.localFilePath)) {
    throw new Error(`File not found on disk: ${params.localFilePath}`);
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

  const fileBuffer = await fs.promises.readFile(params.localFilePath);
  let mimeType = "image/jpeg";
  if (ext === ".png") mimeType = "image/png";
  else if (ext === ".webp") mimeType = "image/webp";

  const base64Data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const systemPrompt = `You are Grok 4.20 Vision, the expert VIP Content Auditor for OnlyFans and Telegram Stars VIP Channels.
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
4. Titel und Bildunterschrift müssen wahrheitsgetreu zum Bild passen: Ein T-Shirt-Spiegelselfie darf NIEMALS "Dessous" oder "Lingerie" genannt werden!

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
      console.log(`[GrokVision] Image triggered xAI content filter/refusal -> automatically classifying as Tier 4 / PPV.`);
      return {
        explicitLevel: "PPV",
        title: `Exklusiver VIP Vollakt (${params.modelName || "Creator"})`,
        theme: "Vollakt / Explicit",
        tags: ["tier4", "vollakt", "nude", "ppv", "explicit", "vip", "stars"],
        notes: "Grok 4.20 Vision: Tier 4 - Vollakt (Full Nude) | xAI NSFW-Filter ausgelöst",
        suggestedCaption: "Streng geheim und unzensiert... 🤫 Nur für echte VIPs hier im Channel! Jetzt freischalten 🔓✨",
        suggestedStarsPrice: 350,
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
    return {
      explicitLevel: "PPV",
      title: `Exklusiver VIP Vollakt (${params.modelName || "Creator"})`,
      theme: "Vollakt / Explicit",
      tags: ["tier4", "vollakt", "nude", "ppv", "explicit", "vip", "stars"],
      notes: `Grok 4.20 Vision: Tier 4 - Vollakt (Full Nude) | xAI Refusal: ${refusal}`,
      suggestedCaption: "Streng geheim und unzensiert... 🤫 Nur für echte VIPs hier im Channel! Jetzt freischalten 🔓✨",
      suggestedStarsPrice: 350,
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
    return generateFallbackClassification(params.localFilePath, params.modelName);
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
    return generateFallbackClassification(params.localFilePath, params.modelName);
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

  const structuredNotes = `[${normalizedTier}: ${classification.category} | Score: ${quality.score}/10 | ${attributes.perspective} | ${attributes.setting} | Face: ${attributes.face_visible ? "Ja" : "Nein"}]`;

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
  modelName?: string
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

  if (fileName.includes("pussy") || fileName.includes("nude") || fileName.includes("naked") || fileName.includes("explicit") || fileName.includes("sex")) {
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


