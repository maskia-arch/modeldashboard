import { z } from "zod";

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
6. Return STRICT valid JSON matching the schema provided. Do not include markdown wraps or extra commentary.`;

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

  // Diverse authentic German creator caption banks
  const teaserCaptions = [
    "Guten Morgen meine Lieben! 💕 Kleiner Schnappschuss für euren Start in den Tag. Was habt ihr heute Schönes vor?",
    "Kurzer Gruß aus dem Bett ☕ Hoffe eure Woche läuft gut! Lasst mir gerne ein Like da ✨",
    "Shooting-Tag heute 📸 Welches Outfit gefällt euch besser? Freue mich riesig auf euer Feedback in den Kommentaren!",
    "Endlich Wochenende! Habt ihr schon Pläne? Ich mach's mir heute gemütlich... 💋",
    "Spontanes Spiegelselfie vor dem Ausgehen ✨ Wie findet ihr den Look?",
    "Frisch geduscht und bereit für den Tag 🌸 Schicke euch ganz viel Liebe und positive Energie!",
    "Ein kleiner Vorgeschmack auf das, was diese Woche noch kommt... Seid ihr bereit? 😉🔥",
    "Einfach mal die Seele baumeln lassen ☀️ Wünsche euch allen einen entspannten Tag!",
    "Wer von euch ist heute auch noch so müde wie ich? Kuscheln wäre jetzt perfekt... 🧸💕",
    "Ein kleiner Schnappschuss zwischendurch nur für euch 😘 Wie verbringt ihr euren Feierabend?"
  ];

  const softCaptions = [
    "Ein kleiner Teaser von meinem heutigen VIP-Shooting ✨ Gefällt es euch? Hinterlasst ein Herz oder schaltet das volle Set frei! 💕",
    "Hinter den Kulissen... 🤫 Manchmal geht es bei mir heißer her als gedacht. Mehr dazu unten!",
    "Nur für meine treuen Abonnenten hier ein kleiner exklusiver Einblick 🔥 Wie gefällt euch diese Pose?",
    "Wollte euch diesen Clip nicht vorenthalten 🙈 Reagiert mit 🔥 wenn ihr mehr davon sehen wollt!",
    "Ein Hauch von Luxus für eure Timeline ✨ Schönen Feierabend euch allen!",
    "Preview auf mein neues Set... Das Beste seht ihr natürlich im VIP-Bereich 💋",
    "Kleine Aufmerksamkeit für euch 🌸 Ich hoffe ihr hattet einen wundervollen Tag!",
  ];

  const ppvCaptions = [
    "Exklusiver VIP Content für euch 🔥 [THEME] Schaltet das Video unten frei mit Telegram Stars! 🌟",
    "Das bisher heißeste Set aus meiner Privatsammlung... 🤫 Komplett unzensiert und nur für euch! Jetzt freischalten 🔓✨",
    "Habe mich getraut und etwas ganz Besonderes aufgenommen 🙈 Streng geheimer Clip – exklusiv hier im VIP-Channel! 🌟",
    "Mein persönliches Lieblingsvideo des Monats 🔥 Klickt unten auf den Stern um den vollen Clip sofort freizuschalten!",
    "Für alle, die das Besondere suchen 💎 Volle Länge, beste Auflösung. Gönnt euch den exklusiven Einblick 🌟",
    "Late Night Special 🌙 Dieser Clip bleibt nur für begrenzte Zeit verfügbar. Schaltet ihn frei, bevor er im Archiv landet!",
    "Unwiderstehlich & intensiv... 💋 Holt euch diesen brandneuen Clip direkt in euren Telegram Chat!"
  ];

  let assetIndex = 0;
  let teaserIdx = 0;
  let softIdx = 0;
  let ppvIdx = 0;

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
          // Dynamic rhythm: [1, 2, 1, 1, 2, 2, 1]
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
          caption = teaserCaptions[teaserIdx++ % teaserCaptions.length];
        } else {
          timeOfDay = (dayOfWeek === 4 || dayOfWeek === 5)
            ? lateNightTimes[(day + p) % lateNightTimes.length]
            : eveningTimes[(day + p) % eveningTimes.length];

          if (ppvAssets.length > 0) {
            chosenAsset = ppvAssets[assetIndex % ppvAssets.length];
            starsPrice = 100 + ((day * 35) % 250); // 100 to 350 Stars
            const themeTag = chosenAsset.theme ? `[${chosenAsset.theme}] ` : "";
            caption = ppvCaptions[ppvIdx++ % ppvCaptions.length].replace("[THEME]", themeTag);
          } else if (softAssets.length > 0) {
            chosenAsset = softAssets[assetIndex % softAssets.length];
            starsPrice = 50;
            caption = softCaptions[softIdx++ % softCaptions.length];
          } else {
            chosenAsset = assets[assetIndex % assets.length];
            starsPrice = 100;
            caption = ppvCaptions[ppvIdx++ % ppvCaptions.length].replace("[THEME]", "");
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
          caption = teaserCaptions[teaserIdx++ % teaserCaptions.length];
        } else if (roll < 7 && softAssets.length > 0) {
          // Soft
          chosenAsset = softAssets[assetIndex % softAssets.length];
          starsPrice = (day % 3 === 0) ? 25 : 0;
          caption = softCaptions[softIdx++ % softCaptions.length];
        } else {
          // PPV
          chosenAsset = (ppvAssets.length > 0)
            ? ppvAssets[assetIndex % ppvAssets.length]
            : (softAssets.length > 0 ? softAssets[assetIndex % softAssets.length] : assets[assetIndex % assets.length]);
          starsPrice = 120 + ((day * 20) % 230); // 120 to 350 Stars
          const themeTag = chosenAsset.theme ? `[${chosenAsset.theme}] ` : "";
          caption = ppvCaptions[ppvIdx++ % ppvCaptions.length].replace("[THEME]", themeTag);
        }
      }

      assetIndex++;

      schedule.push({
        timeOffsetDays: day,
        timeOfDay,
        assetId: chosenAsset.id,
        caption,
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

export interface GrokImageClassification {
  title: string;
  theme: string;
  explicitLevel: "TEASER" | "SOFT" | "PPV";
  suggestedStarsPrice: number;
  tags: string[];
  notes: string;
  suggestedCaption: string;
  visibleFeatures?: string[];
}

/**
 * Evaluates and classifies a photo using xAI Grok Vision.
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
  const visionModel = process.env.XAI_VISION_MODEL || "grok-2-vision-1212";

  // Fallback if no valid API key is set
  if (!apiKey || apiKey === "demo_xai_key") {
    return generateFallbackClassification(params.localFilePath, params.modelName);
  }

  try {
    const fileBuffer = await fs.promises.readFile(params.localFilePath);
    let mimeType = "image/jpeg";
    if (ext === ".png") mimeType = "image/png";
    else if (ext === ".webp") mimeType = "image/webp";

    const base64Data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

    const systemPrompt = `You are Grok 4.1 Vision, an expert VIP Creator Content Auditor and NSFW Visual Analyst for OnlyFans and Telegram Stars VIP Channels.
Analyze the provided photo of creator "${params.modelName || "Creator"}".

YOUR CORE DIRECTIVE:
Classify the image strictly according to visible body parts, erotic allure, explicit level, and Telegram Stars monetization.

CRITICAL CLASSIFICATION HIERARCHY (FOLLOW STRICTLY):

1. "TEASER" (0 Stars / Free / Public Channel):
   - STRICT REQUIREMENT: NON-NUDE ONLY. MUST BE 100% SOCIAL-MEDIA SAFE (Instagram / TikTok compliant).
   - Fully clothed, streetwear, lifestyle portraits, gym/fitness in sports bra and leggings, beachwear/bikini WITHOUT bare buttocks or exposed breasts.
   - ABSOLUTE PROHIBITION: NO bare ass, NO exposed breasts or nipples, NO see-through/sheer exposure, NO visible genitalia.
   - suggestedStarsPrice: 0.

2. "SOFT" (25 - 75 Stars / Paid Teaser):
   - Erotic allure, lingerie, boudoir, lace underwear, sheer/translucent clothing, deep cleavage, sideboob, underboob.
   - Booty / Ass in panties, thongs, or cheeky bikinis.
   - Seductive bedroom/bathroom poses, covered topless (hands or hair covering nipples).
   - NO fully bare nipples, NO exposed vulva / pussy.
   - suggestedStarsPrice: 25 to 75 Stars.

3. "PPV" (100 - 500 Stars / Premium Paywall):
   - FULL NUDITY OR EXPLICIT GENITAL / BREAST / BUTTOCK EXPOSURE!
   - Topless / bare breasts / visible nipples -> TAG "tits", suggestedStarsPrice: 100 - 200 Stars.
   - Fully bare uncovered ass / butt cheek close-up -> TAG "ass", suggestedStarsPrice: 150 - 250 Stars.
   - Genitalia visible, uncovered pussy, spreading, highly erotic explicit nude -> TAG "pussy", suggestedStarsPrice: 300 - 500 Stars.

BODY PART DETECTION:
You MUST check if any of these are visible or strongly showcased and include them in "visibleFeatures":
- "ass": if buttocks are clearly visible or the primary focus (in thong or bare).
- "tits": if breasts or nipples are bare, sheer, or prominent.
- "pussy": if vulva, mons pubis, or genitalia are exposed or clearly outlined.
- "cleavage", "lingerie", "bikini", "legs", "feet", "face".

TAGGING RULES:
- If "tits" detected: include "tits", "topless" in tags.
- If "ass" detected: include "ass", "booty" in tags.
- If "pussy" detected: include "pussy", "nude", "explicit" in tags.
- Add relevant aesthetic tags (e.g. "dessous", "spitze", "bett", "spiegel", etc.).

IMAGE-ACCURATE GERMAN CAPTION:
- You MUST write a conversational, authentic, flirty German caption matching the EXACT visual details of this photo (outfit color, setting like bed/mirror/couch/balcony, expression, mood).
- If TEASER: Friendly lifestyle greeting or playful question to fans.
- If SOFT/PPV: Seductive, tantalizing paywall teaser text that makes subscribers eager to unlock the image with Telegram Stars!

STRICT JSON OUTPUT FORMAT:
{
  "title": "Short German title (e.g. 'Rote Spitze im Bett', 'Oben Ohne am Spiegel', 'Booty Close-Up')",
  "theme": "Theme (e.g. 'Boudoir & Lingerie', 'Topless & Nude', 'Booty & Curves', 'Beach & Bikini', 'Casual Lifestyle')",
  "explicitLevel": "TEASER" | "SOFT" | "PPV",
  "visibleFeatures": ["ass", "tits", "pussy"],
  "suggestedStarsPrice": number (0 for TEASER, 25-75 for SOFT, 100-500 for PPV),
  "tags": ["array", "of", "tags"],
  "notes": "Exact visual breakdown: What is the creator wearing? What body parts (tits/ass/pussy) are visible? Describe setting.",
  "suggestedCaption": "Authentic German caption tailored to this specific photo"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
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
                text: "Auditing creator image for explicitLevel, visible body parts (ass/tits/pussy), stars price, and tailored German caption. Return strict JSON.",
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
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Grok Vision API returned status ${response.status}. Falling back to smart local classifier.`);
      return generateFallbackClassification(params.localFilePath, params.modelName);
    }

    const data = await response.json();
    const rawJson = data.choices?.[0]?.message?.content;
    if (!rawJson) throw new Error("Empty response from Grok Vision");

    const parsed = JSON.parse(rawJson);
    const visible = Array.isArray(parsed.visibleFeatures) ? parsed.visibleFeatures : [];
    const baseTags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const allTags = Array.from(new Set([...baseTags, ...visible])).map((t) => t.toLowerCase());

    let level: "TEASER" | "SOFT" | "PPV" = "TEASER";
    if (parsed.explicitLevel === "PPV" || visible.includes("pussy") || visible.includes("tits") || allTags.includes("nude") || allTags.includes("topless")) {
      level = "PPV";
    } else if (parsed.explicitLevel === "SOFT" || visible.includes("ass") || allTags.includes("lingerie") || allTags.includes("dessous") || allTags.includes("booty")) {
      level = "SOFT";
    }

    let stars = typeof parsed.suggestedStarsPrice === "number" ? parsed.suggestedStarsPrice : 0;
    if (level === "PPV" && stars < 100) stars = visible.includes("pussy") ? 350 : 150;
    if (level === "SOFT" && stars <= 0) stars = 50;
    if (level === "TEASER") stars = 0;

    return {
      title: parsed.title || "Exklusives Creator Foto",
      theme: parsed.theme || (level === "PPV" ? "Topless & Nude" : level === "SOFT" ? "Boudoir & Lingerie" : "Lifestyle & Allure"),
      explicitLevel: level,
      suggestedStarsPrice: stars,
      tags: allTags.length > 0 ? allTags : ["creator", level.toLowerCase()],
      notes: `Grok 4.1 Vision: ${parsed.notes || "Klassifiziert"} | Sichtbar: ${visible.length > 0 ? visible.join(", ") : "Keine Nacktheit"}`,
      suggestedCaption: parsed.suggestedCaption || "Kleiner Gruß für meine VIPs 💕 Wie gefällt euch das Bild?",
      visibleFeatures: visible,
    };
  } catch (error) {
    console.warn("Grok Vision analysis failed, using smart local fallback:", error);
    return generateFallbackClassification(params.localFilePath, params.modelName);
  }
}

/**
 * Smart local fallback classifier when Grok API key is unconfigured or offline.
 * Implements a realistic distribution (Teaser / Soft Lingerie / PPV Nude) with tags and stars.
 */
function generateFallbackClassification(
  filePath: string,
  modelName?: string
): GrokImageClassification {
  const path = require("path");
  const fileName = path.basename(filePath).toLowerCase();

  let explicitLevel: "TEASER" | "SOFT" | "PPV" = "TEASER";
  let theme = "Casual & Lifestyle";
  let suggestedStarsPrice = 0;
  let title = "Casual Streetwear Portrait";
  let suggestedCaption = "Guten Morgen ihr Lieben! 💕 Ich wünsche euch einen wundervollen Start in den Tag ✨ Was habt ihr heute Schönes vor?";
  let tags = ["lifestyle", "selfie", "portrait"];
  let visibleFeatures: string[] = ["face"];

  // Inspect filename keywords for explicit clues
  if (fileName.includes("pussy") || fileName.includes("nude") || fileName.includes("naked") || fileName.includes("explicit") || fileName.includes("sex")) {
    explicitLevel = "PPV";
    theme = "Full Nude & Explicit";
    title = "Intimer unzensierter Einblick";
    suggestedStarsPrice = 350;
    tags = ["pussy", "nude", "explicit", "vip", "stars"];
    visibleFeatures = ["pussy", "ass", "tits"];
    suggestedCaption = "Ganz exklusiv und ohne jedes Geheimnis für meine treuesten VIPs... 🤫 Klickt unten auf den Stern um das unzensierte Set freizuschalten! 🌟🔞";
  } else if (fileName.includes("tits") || fileName.includes("boobs") || fileName.includes("topless") || fileName.includes("obenohne") || fileName.includes("brüste")) {
    explicitLevel = "PPV";
    theme = "Topless & Nude";
    title = "Sinnliches Oben-Ohne Porträt";
    suggestedStarsPrice = 180;
    tags = ["tits", "topless", "nude", "vip"];
    visibleFeatures = ["tits"];
    suggestedCaption = "Zu heiß für Instagram... 🔥 Schaltet das komplette Oben-Ohne Foto unten mit Telegram Stars frei! 🌟";
  } else if (fileName.includes("ass") || fileName.includes("booty") || fileName.includes("lingerie") || fileName.includes("dessous") || fileName.includes("boudoir")) {
    explicitLevel = "SOFT";
    theme = "Boudoir & Lingerie";
    title = "Verführerisches Lingerie Set";
    suggestedStarsPrice = 50;
    tags = ["lingerie", "ass", "booty", "dessous"];
    visibleFeatures = ["ass", "cleavage"];
    suggestedCaption = "Spitze auf der Haut und ein kleiner Blick hinter die Kulissen... Gefällt euch dieses Set? 😉💕";
  } else {
    // Deterministic hash based on filename so generic Telegram messages get a realistic mix
    let hash = 0;
    for (let i = 0; i < fileName.length; i++) {
      hash = (hash * 31 + fileName.charCodeAt(i)) % 100;
    }

    if (hash < 30) {
      // 30% Teaser (Non-Nude)
      explicitLevel = "TEASER";
      theme = "Casual & Lifestyle";
      title = "Süßes Spiegelselfie";
      suggestedStarsPrice = 0;
      tags = ["teaser", "lifestyle", "casual", "face"];
      visibleFeatures = ["face", "outfit"];
      suggestedCaption = "Ein kleiner Gruß aus dem Alltag 💕 Wie gefällt euch mein heutiges Outfit? Schreibt es mir in die Kommentare!";
    } else if (hash < 65) {
      // 35% Soft (Lingerie / Booty)
      explicitLevel = "SOFT";
      theme = "Boudoir & Lingerie";
      title = "Spitzen-Dessous am Bett";
      suggestedStarsPrice = 45;
      tags = ["lingerie", "ass", "booty", "dessous", "soft"];
      visibleFeatures = ["ass", "cleavage"];
      suggestedCaption = "Gemütlicher Abend im Schlafzimmer... 🔥 Wer von euch leistet mir Gesellschaft? Klickt unten für das volle Foto!";
    } else {
      // 35% PPV (Topless / Nude)
      explicitLevel = "PPV";
      theme = "Topless & VIP Special";
      title = "Hautnah & Unzensiert";
      suggestedStarsPrice = 180;
      tags = ["tits", "topless", "nude", "ppv", "vip"];
      visibleFeatures = ["tits", "ass"];
      suggestedCaption = "Nur für meine echten Fans hier im Kanal... 🤫 Holt euch das unzensierte Foto direkt mit Telegram Stars! 🌟✨";
    }
  }

  return {
    title,
    theme,
    explicitLevel,
    suggestedStarsPrice,
    tags,
    notes: `Klassifiziert (${modelName || "Model"}) | Merkmale: ${visibleFeatures.join(", ")}`,
    suggestedCaption,
    visibleFeatures,
  };
}


