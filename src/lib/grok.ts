import { z } from "zod";

export const ScheduleItemSchema = z.object({
  timeOffsetDays: z.number().int().min(0).max(120), // Support up to 4 months (120 days)
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM format (24h)"),
  assetId: z.string().uuid().or(z.string().min(1)),
  caption: z.string().min(3).max(1024),
  starsPrice: z.number().int().min(0).max(10000),
});

export const GrokScheduleResponseSchema = z.object({
  schedule: z.array(ScheduleItemSchema).min(1),
});

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type GrokScheduleResponse = z.infer<typeof GrokScheduleResponseSchema>;

export interface GenerateScheduleParams {
  modelName: string;
  channelTitle?: string | null;
  targetDays?: number; // e.g. 30, 60, 90 days plan
  postsPerDay?: number; // e.g. 1 or 2 posts per day
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
 * Calls xAI Grok API with Strict JSON schema to construct an optimal posting schedule.
 */
export async function generateGrokSchedule(params: GenerateScheduleParams): Promise<GrokScheduleResponse> {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL || "grok-beta";

  if (!apiKey || apiKey === "demo_xai_key") {
    // If no live key is set, return a high-quality deterministic fallback plan
    return generateMockSchedule(params);
  }

  const systemPrompt = `You are an elite Telegram Creator Content Strategist and Copywriter for Adult & Glamour Models.
Your goal is to build an engaging, revenue-maximizing content schedule across ${params.targetDays || 7} days for the creator "${params.modelName}".
Tone & Persona: ${params.modelTone || "Authentic, alluring, conversational German Telegram channel"}.

Rules:
1. For TEASER assets: starsPrice must be 0 (Free promotional content to drive engagement).
2. For SOFT assets: starsPrice should usually be 0 (engagement) or small tip (5-20 stars).
3. For PPV (Pay-Per-View) assets: starsPrice must be between 50 and 500 stars depending on allure.
4. Schedule posts at high-engagement hours (e.g., 09:30, 13:00, 18:30, 21:00, 23:15).
5. Captions must sound natural, seductive, and enticing with emojis, written in German (or match model persona).
6. Return STRICT valid JSON matching the schema provided. Do not include markdown wraps or extra commentary.`;

  const userPrompt = `Assets available for scheduling:
${JSON.stringify(params.availableAssets, null, 2)}

Create a posting plan with up to 1-3 posts per day over ${params.targetDays || 7} days utilizing the provided asset IDs.
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

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`xAI API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("Received empty response from xAI Grok API");
    }

    const parsedJson = JSON.parse(rawContent);
    return GrokScheduleResponseSchema.parse(parsedJson);
  } catch (error) {
    console.error("Failed to generate schedule via xAI Grok:", error);
    // Graceful fallback to mock plan so the user can continue testing/using the app
    return generateMockSchedule(params);
  }
}

/**
 * Fallback generator if xAI API is offline or unconfigured.
 * Intelligently spaces out assets across targetDays (e.g. 30, 60, 90 days)
 * with alternating Teaser, Soft, and PPV Stars paywalls.
 */
export function generateMockSchedule(params: GenerateScheduleParams): GrokScheduleResponse {
  const schedule: ScheduleItem[] = [];
  const days = params.targetDays || 30;
  const postsPerDay = params.postsPerDay || 1;
  const assets = params.availableAssets;

  if (assets.length === 0) {
    return { schedule: [] };
  }

  // Peak Telegram engagement times
  const morningTimes = ["09:45", "10:30", "11:15"];
  const eveningTimes = ["18:30", "20:45", "22:15"];

  // Separate assets by explicit level
  const teaserAssets = assets.filter((a) => a.explicitLevel === "TEASER");
  const softAssets = assets.filter((a) => a.explicitLevel === "SOFT");
  const ppvAssets = assets.filter((a) => a.explicitLevel === "PPV");

  let assetIndex = 0;

  for (let day = 0; day < days; day++) {
    // Determine post cadence: 
    // E.g. Tue/Thu/Sun: PPV or Soft Paywall. Other days: Teaser / Daily check-in
    const isPaywallDay = day % 3 === 0 || day % 7 === 5;

    for (let p = 0; p < postsPerDay; p++) {
      let chosenAsset;
      let price = 0;
      let caption = "";

      if (isPaywallDay && (ppvAssets.length > 0 || softAssets.length > 0)) {
        if (ppvAssets.length > 0 && (day % 2 === 0 || softAssets.length === 0)) {
          chosenAsset = ppvAssets[(assetIndex) % ppvAssets.length];
          price = 150 + ((day * 25) % 350); // Dynamic price 150-450 stars
          const themeLabel = chosenAsset.theme ? `[${chosenAsset.theme}] ` : "";
          caption = `Exklusiver VIP Content für euch 🔥 ${themeLabel}${chosenAsset.title || "Neuer Clip"}. Schaltet das Video unten frei mit Telegram Stars! 🌟`;
        } else {
          chosenAsset = softAssets[(assetIndex) % softAssets.length];
          price = day % 4 === 0 ? 50 : 0;
          caption = `Ein kleiner Teaser von meinem heutigen Shooting ✨ Gefällt es euch? Hinterlasst ein Herz oder schaltet das volle Set frei! 💕`;
        }
      } else {
        chosenAsset = teaserAssets.length > 0
          ? teaserAssets[(assetIndex) % teaserAssets.length]
          : assets[(assetIndex) % assets.length];
        price = 0;
        caption = `Guten Morgen meine Lieben! 💕 ${chosenAsset.title || "Ein neuer Schnappschuss"} für euren Start in den Tag. Freue mich auf eure Nachrichten! ✨`;
      }

      assetIndex++;
      const timeOfDay = p === 0 
        ? morningTimes[day % morningTimes.length] 
        : eveningTimes[day % eveningTimes.length];

      schedule.push({
        timeOffsetDays: day,
        timeOfDay,
        assetId: chosenAsset.id,
        caption,
        starsPrice: price,
      });
    }
  }

  return { schedule };
}
