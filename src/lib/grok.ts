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

  const systemPrompt = `You are Grok 4.1 Vision, the master VIP Creator Content Auditor and NSFW Visual Analyst for OnlyFans and Telegram Stars VIP Channels.
Analyze the provided photo of creator "${params.modelName || "Creator"}".

HAUPT-KLASSIFIZIERUNG NACH EXPOSITIONSGRAD (TIERS):
- Tier 0: "SFW / Lifestyle" -> Vollständig bekleidet, keine Reizwäsche, keine anzügliche Ausrichtung. (Streetwear, Porträts, Casual Selfies, Alltagskleidung, Hoodies, normale Kleider). Stars: 0.
- Tier 1: "Suggestive / Bademode" -> Knappe Kleidung, aber gesellschaftlich öffentlich akzeptiert. Keine Unterwäsche. (Bikini, Badeanzug, knappe Sportkleidung, tiefer Ausschnitt). Stars: 0-25.
- Tier 2: "Lingerie / Unterwäsche" -> Typische Reizwäsche oder Unterwäsche. Intimbereich und Brustwarzen sind bedeckt oder maximal semi-transparent. (BH & Slip, Corsagen, Bodysuits, Strapsen, Boudoir-Shootings). Stars: 25-75.
- Tier 3: "Teilakt (Partial Nude)" -> Gezielte Entblößung ohne direkte Genitalansicht. (Oben-ohne / Topless, unbedeckter Po / Rückansicht, verdeckter Akt mit Händen/Schatten). Stars: 100-250.
- Tier 4: "Vollakt (Full Nude)" -> Vollständige Nacktheit mit sichtbarem Genitalbereich. (Frontalakt, intime Close-ups, gespreizte Posen). Stars: 250-450.
- Tier 5: "Explizit / Interaktion" -> Direkte sexuelle Handlungen, Masturbation, Toys im Einsatz oder Partner-Content. (Sexuelle Akte, Penetration, intensive BDSM-/Fetisch-Aktionen). Stars: 450-800+.

SEKUNDÄRE MERKMALE (ZUSATZ-TAGS FÜR FILTER & SUCHE):
- face_visible: boolean (true wenn das Gesicht erkennbar ist, false wenn abgeschnitten oder verdeckt)
- perspective: "Selfie" | "Mirror-Selfie" | "POV" | "Close-up" | "Full-Body" | "Third-Person"
- setting: "Bedroom" | "Bathroom" | "Outdoor" | "Studio" | "Car" | "Living Room" | "Other"
- body_writing: boolean (true wenn Beschriftungen auf der Haut vorhanden sind wie Custom-Namen oder Sprüche)
- body_writing_text: string or null (der erkannte Text auf der Haut)
- fetish_tags: array of strings (z.B. "Feet", "BDSM", "Costume/Cosplay", "Latex/Leder", "Dom/Sub", "Tattoo", "Piercing")
- quality: { score: number (1.0-10.0 basierend auf Belichtung, Bildschärfe und Komposition), lighting: string, sharpness: string }

STRICT JSON OUTPUT FORMAT:
{
  "classification": {
    "tier": "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Tier 5",
    "category": "SFW / Lifestyle" | "Suggestive / Bademode" | "Lingerie / Unterwäsche" | "Teilakt (Partial Nude)" | "Vollakt (Full Nude)" | "Explizit / Interaktion",
    "confidence": 0.95
  },
  "attributes": {
    "face_visible": true,
    "body_writing": false,
    "body_writing_text": null,
    "perspective": "Mirror-Selfie",
    "setting": "Bedroom",
    "fetish_tags": ["Tattoo"]
  },
  "tags": ["Topless", "Selfie", "Tattoo", "Mirror"],
  "quality": {
    "score": 7.5,
    "lighting": "Warm / Indoor",
    "sharpness": "Hoch"
  },
  "title": "Kurzer aussagekräftiger deutscher Titel",
  "suggestedCaption": "Authentische, verführerische deutsche Bildunterschrift abgestimmt auf dieses Bild",
  "suggestedStarsPrice": 150
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  let response: Response;
  try {
    response = await fetch("https://api.x.ai/v1/chat/completions", {
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
                text: "Auditiere das Creator-Bild exakt nach dem Tier 0-5 System. Gib striktes JSON zurück.",
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
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Grok Vision API error (HTTP ${response.status}): ${errText}`);
    throw new Error(`xAI Grok Vision API Fehler (${response.status}): ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  const rawJson = data.choices?.[0]?.message?.content;
  if (!rawJson) throw new Error("Keine Antwort von Grok Vision erhalten.");

  const parsed = JSON.parse(rawJson);
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

  const rawTier = String(classification.tier || "Tier 0").trim();
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

  const combinedTags = Array.from(
    new Set([
      ...systemGeneratedTags,
      ...fetishTags.map((t: string) => t.toLowerCase()),
      ...rawTags.map((t: string) => t.toLowerCase()),
    ])
  );

  const structuredNotes = `[${normalizedTier}: ${classification.category} | Score: ${quality.score}/10 | ${attributes.perspective} | ${attributes.setting} | Face: ${attributes.face_visible ? "Ja" : "Nein"}]`;

  return {
    title: parsed.title || `${normalizedTier} - ${classification.category}`,
    theme: classification.category,
    explicitLevel,
    suggestedStarsPrice,
    tags: combinedTags,
    notes: structuredNotes,
    suggestedCaption: parsed.suggestedCaption || "Kleiner Einblick für meine treuen VIPs 💕",
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
function generateFallbackClassification(
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


