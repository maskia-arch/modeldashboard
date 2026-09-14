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

