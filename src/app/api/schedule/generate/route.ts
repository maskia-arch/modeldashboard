import { NextResponse } from "next/server";
import { generateGrokSchedule } from "@/lib/grok";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelName, channelTitle, targetDays, postsPerDay, strategy, allowPauseDays, modelTone, availableAssets } = body;

    if (!modelName || !availableAssets || availableAssets.length === 0) {
      return NextResponse.json(
        { error: "modelName and at least one availableAsset are required" },
        { status: 400 }
      );
    }

    const scheduleResponse = await generateGrokSchedule({
      modelName,
      channelTitle,
      targetDays: targetDays ? parseInt(targetDays, 10) : 30,
      postsPerDay: postsPerDay ? parseInt(postsPerDay, 10) : 1,
      strategy,
      allowPauseDays: typeof allowPauseDays === "boolean" ? allowPauseDays : true,
      modelTone: modelTone || "Playful, alluring, authentic German VIP creator",
      availableAssets,
    });

    return NextResponse.json(scheduleResponse);
  } catch (error: any) {
    console.error("Error in schedule generation endpoint:", error);
    return NextResponse.json({ error: error.message || "Failed to generate schedule" }, { status: 500 });
  }
}
