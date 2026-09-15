/**
 * Format-Aware Captions, Visual-Context Extraction & Storyline Generation.
 * Produces authentic, natural creator messages in intimate German creator voice,
 * directly referencing visual image analysis (outfits, settings, poses, tattoos)
 * and video durations, with zero annoying marketing repetitions.
 */

export interface AssetVisualContext {
  setting: string;
  clothing: string;
  perspective: string;
  highlights: string[];
  isMirrorSelfie: boolean;
  hasTattoo: boolean;
  isWetOrShower: boolean;
  isBedOrCozy: boolean;
  isCouchOrChill: boolean;
}

export interface StorylineOptions {
  asset: {
    id: string;
    title?: string | null;
    theme?: string | null;
    notes?: string | null;
    type: "PHOTO" | "VIDEO" | "TEXT" | string;
    explicitLevel: "TEASER" | "SOFT" | "PPV" | string;
    tags?: string[];
    duration?: number | null;
    durationFormatted?: string | null;
  };
  dayOfWeek?: number; // 0 = Mon, 6 = Sun
  dayIndex?: number;
  timeSlot?: "morning" | "afternoon" | "evening" | "latenight";
  modelName?: string;
  usedCaptionsSet?: Set<string>;
}

/**
 * Extracts structured visual context from an asset's notes, title, theme, and tags.
 */
export function extractAssetVisualContext(asset: {
  title?: string | null;
  theme?: string | null;
  notes?: string | null;
  tags?: string[];
  type?: string | null;
}): AssetVisualContext {
  const text = `${asset.title || ""} ${asset.theme || ""} ${asset.notes || ""} ${(asset.tags || []).join(" ")}`.toLowerCase();

  // Setting
  let setting = "Zuhause";
  let isMirrorSelfie = text.includes("spiegel") || text.includes("mirror");
  let isWetOrShower = text.includes("dusche") || text.includes("shower") || text.includes("bad") || text.includes("bath") || text.includes("nass");
  let isBedOrCozy = text.includes("bett") || text.includes("bed") || text.includes("kissen") || text.includes("schlafzimmer") || text.includes("kuschel");
  let isCouchOrChill = text.includes("couch") || text.includes("sofa") || text.includes("wohnzimmer");
  const hasTattoo = text.includes("tattoo") || text.includes("tätowier");

  if (isWetOrShower) {
    setting = "Badezimmer vor dem Spiegel";
  } else if (isBedOrCozy) {
    setting = "Im Bett / Schlafzimmer";
  } else if (isCouchOrChill) {
    setting = "Gemütlich auf der Couch";
  } else if (text.includes("outdoor") || text.includes("strand") || text.includes("beach") || text.includes("balkon")) {
    setting = "Draußen / Balkon";
  } else if (text.includes("gym") || text.includes("sport") || text.includes("fitness")) {
    setting = "Gym / Workout";
  } else if (isMirrorSelfie) {
    setting = "Vor dem Spiegel";
  }

  // Clothing
  let clothing = "Casual";
  if (text.includes("hoodie") || text.includes("pulli") || text.includes("pullover") || text.includes("oversize")) {
    clothing = "Oversized Hoodie";
  } else if (text.includes("t-shirt") || text.includes("shirt") || text.includes("streetwear")) {
    clothing = "Casual T-Shirt Look";
  } else if (text.includes("bikini") || text.includes("badeanzug") || text.includes("swim")) {
    clothing = "Knapper Bikini";
  } else if (text.includes("dessous") || text.includes("lingerie") || text.includes("spitze") || text.includes("bh") || text.includes("slip")) {
    clothing = "Feine Spitzen-Lingerie";
  } else if (text.includes("topless") || text.includes("oben-ohne") || text.includes("oben ohne") || text.includes("teilakt")) {
    clothing = "Oben-ohne / Teilakt";
  } else if (text.includes("vollakt") || text.includes("full nude") || text.includes("nackt") || text.includes("spreiz")) {
    clothing = "Hüllenlos / Vollakt";
  }

  // Perspective
  let perspective = "Selfie";
  if (isMirrorSelfie) perspective = "Spiegelselfie";
  else if (text.includes("pov")) perspective = "POV-Perspektive";
  else if (text.includes("rücken") || text.includes("back") || text.includes("po") || text.includes("booty")) perspective = "Blick über die Schulter";
  else if (text.includes("nahaufnahme") || text.includes("close")) perspective = "Intime Nahaufnahme";

  const highlights: string[] = [];
  if (hasTattoo) highlights.push("Tattoos sichtbar");
  if (isWetOrShower) highlights.push("nasse Haare / frisch aus der Dusche");
  if (isBedOrCozy) highlights.push("verschlafen im Bett");
  if (clothing.includes("Hoodie")) highlights.push("gemütlich im Oversized Hoodie");

  return {
    setting,
    clothing,
    perspective,
    highlights,
    isMirrorSelfie,
    hasTattoo,
    isWetOrShower,
    isBedOrCozy,
    isCouchOrChill,
  };
}

/**
 * Generates an authentic, narrative-driven caption tailored to:
 * - Time of day (morning / afternoon / evening / late night)
 * - Day of week (storyline progression from weekday to weekend)
 * - Visual details (outfit, setting, tattoos, mirror selfie)
 * - Video duration (if video)
 * - Creator voice (warm, conversational, flirty, natural)
 */
export function composeStorylineCaption(opts: StorylineOptions): string {
  const { asset, dayOfWeek = 0, dayIndex = 0, timeSlot = "evening", modelName, usedCaptionsSet } = opts;
  const isVideo = asset.type === "VIDEO";
  const explicit = asset.explicitLevel;
  const visual = extractAssetVisualContext(asset);

  const durationStr = asset.durationFormatted
    ? asset.durationFormatted
    : asset.duration
    ? `${asset.duration} Sekunden`
    : isVideo
    ? "kurzer Clip"
    : "";

  const candidates: string[] = [];

  // ==========================================
  // 1. TEASER POSTS (Free / Engagement)
  // ==========================================
  if (explicit === "TEASER") {
    if (timeSlot === "morning" || visual.isBedOrCozy) {
      candidates.push(
        "Guten Morgen meine Lieben ☕ Direkt nach dem Aufstehen... Wer von euch braucht heute auch erstmal drei Kaffee? Lasst mir ein Herz da 💕",
        "Noch ganz verschlafen im Bett 🙈 Hoffe ihr seid gut in die neue Woche gestartet! Was habt ihr heute Schönes vor?",
        "Kurzer Morgengruß nur für euch ☀️ Wer von euch würde jetzt auch noch am liebsten gemütlich im Bett liegen bleiben? 🧸",
        "Einfach mal ohne Wecker aufgewacht... ✨ Wünsche euch allen einen entspannten und erfolgreichen Tag! Lasst Liebe da 💖"
      );
    } else if (visual.isWetOrShower) {
      candidates.push(
        "Frisch geduscht und bereit für den Tag 🌸 Schicke euch ganz viel positive Energie und einen dicken Kuss! ✨",
        "Kurzer Schnappschuss nach der Dusche vor dem Spiegel 🛁 Wie gefällt euch der Look? Schreibt mir mal in die Kommentare 😘"
      );
    } else if (visual.clothing.includes("Hoodie") || visual.isCouchOrChill) {
      candidates.push(
        "Heute ganz entspannt im gemütlichen Hoodie auf der Couch 🧸 Manchmal braucht man einfach einen ruhigen Tag... Wer leistet mir Gesellschaft? 💋",
        "Schlabberlook & Kuschelzeit ☕ Wie verbringt ihr heute euren Feierabend? Schreibt es mir mal unten! 💕"
      );
    } else if (visual.isMirrorSelfie) {
      candidates.push(
        "Spontanes Spiegelselfie vor dem Ausgehen ✨ Wie findet ihr das Outfit heute? Freue mich riesig auf euer Feedback!",
        "Konnte an keinem Spiegel vorbeigehen ohne kurz an euch zu denken... 📸 Wünsche euch einen wundervollen Tag! 💋"
      );
    } else {
      // General Teasers
      candidates.push(
        "Kleiner Gruß zwischendurch nur für euch 😘 Wie läuft eure Woche bisher? Lasst mir gerne ein Like da ✨",
        "Shooting-Tag heute 📸 Welches Outfit gefällt euch an mir am besten? Schreibt es mir in die Kommentare! 💕",
        "Ein kleiner Vorgeschmack auf das, was diese Woche noch auf euch wartet... Seid ihr bereit? 😉🔥",
        "Einfach mal die Seele baumeln lassen ☀️ Hoffe ihr hattet einen richtig schönen Tag!"
      );
    }

    if (isVideo) {
      const vidDurationText = durationStr ? `(${durationStr})` : "";
      candidates.push(
        `Guten Morgen! 💕 Kleiner Grußclip ${vidDurationText} für euren Start in den Tag. Lasst mir ein Like da ✨`,
        `Kurzer Video-Einblick hinter die Kulissen 🎥 Reagiert mit 🔥 wenn ihr mehr davon sehen wollt!`
      );
    }
  }

  // ==========================================
  // 2. SOFT POSTS (Preview / Sensual Tease)
  // ==========================================
  else if (explicit === "SOFT") {
    if (visual.isWetOrShower) {
      candidates.push(
        "Frisch aus dem Bad und die Haare noch nass 🛁... Konnte es nicht lassen, kurz diesen Einblick festzuhalten 🙈 Mehr seht ihr unten!",
        "Hinter den Kulissen nach der Dusche... 🤫 Gefällt euch dieser Anblick? Reagiert mit 🔥 für mehr!"
      );
    } else if (visual.hasTattoo) {
      candidates.push(
        "Mag diese Perspektive hier so sehr... und man sieht meine Tattoos perfekt ✨ Wer von euch steht auch so auf Tattoos? 💋",
        "Kleiner Einblick aus meinem heutigen Shooting 🔥 Wie gefällt euch die Pose? Hinterlasst ein Herz!"
      );
    } else if (visual.isBedOrCozy) {
      candidates.push(
        "Kuschelzeit im Bett... 🧸 Aber ganz allein ist es irgendwie langweilig. Wer würde mir jetzt Gesellschaft leisten? 💋",
        "Ein kleiner intimer Vorgeschmack aus meinem Schlafzimmer ✨ Das volle Set seht ihr unten!"
      );
    } else {
      candidates.push(
        "Nur für meine treuen VIPs hier ein kleiner exklusiver Einblick 🔥 Wie gefällt euch dieser Look?",
        "Hinter den Kulissen vom heutigen VIP-Set... 🤫 Manchmal geht es bei mir heißer her als gedacht!",
        "Wollte euch diesen Einblick nicht vorenthalten 🙈 Reagiert mit 🔥 wenn ihr heute Nacht noch mehr wollt!"
      );
    }

    if (isVideo) {
      const lengthNotice = durationStr ? `mit ${durationStr}` : "voller Bewegung";
      candidates.push(
        `Ein kleiner Teaser-Clip ${lengthNotice} aus meinem heutigen Set ✨ Gefällt es euch? Schaltet das volle Video frei! 💕`,
        `Nur für meine VIPs: kurzer Vorgeschmack in Bewegung 🔥 Schreibt mir mal wie es euch gefällt!`
      );
    }
  }

  // ==========================================
  // 3. PPV POSTS (Paid / Intimate / Drop)
  // ==========================================
  else {
    // Highly authentic, intimate creator paywall lines (NO robotic slogans)
    if (visual.isWetOrShower) {
      candidates.push(
        "Frisch aus der Dusche und noch feuchte Haut... 🛁 Habe mich heute getraut und dieses komplett unzensierte Set für euch festgehalten 🙈 Direkt unten freischalten 🔓✨",
        "Spiegelselfie im Bad nach dem Baden 🤫 Ganz intim und ohne jedes Tabu. Gönnt euch diesen privaten Moment 🌟"
      );
    } else if (visual.hasTattoo) {
      candidates.push(
        "Das bisher heißeste Foto mit meinen Tattoos im Fokus... 🔥 Komplett hüllenlos und intim nur für meine treuesten VIPs 🤫 Jetzt unten freischalten 🔓✨",
        "Liebe diese Perspektive... und man sieht wirklich jedes einzelne Detail ✨ Unzensiert direkt in euren Chat 🌟"
      );
    } else if (visual.isBedOrCozy) {
      candidates.push(
        "Kann heute Nacht irgendwie noch gar nicht schlafen... 🌙 Liege hier im Bett und habe mir was ganz Besonderes für euch getraut 🙈 Jetzt unzensiert freischalten 🔓✨",
        "Ganz intim zwischen den Bettdecken... 🧸 Das vielleicht persönlichste Set aus meiner privaten Sammlung 🤫 Schaltet es euch unten frei 🌟"
      );
    } else if (visual.clothing.includes("Vollakt") || visual.clothing.includes("Hüllenlos")) {
      candidates.push(
        "Komplett hüllenlos und so nah wie noch nie zuvor... 🤫 Streng limitiert und ohne jeden Filter nur für diesen Channel! Jetzt freischalten 🔓✨",
        "Habe lange überlegt ob ich diese Aufnahme wirklich teile 🙈 Aber für meine VIPs mache ich eine Ausnahme... Gönnt euch den unzensierten Einblick 🌟"
      );
    } else {
      candidates.push(
        "Das bisher aufregendste Set aus meiner persönlichen Sammlung... 🤫 Komplett unzensiert und nur für euch! Jetzt freischalten 🔓✨",
        "Habe mich heute getraut und etwas ganz Besonderes festgehalten 🙈 Exklusiv und ohne Filter hier im VIP-Channel 🌟",
        "Für alle, die mir schon so lange die Treue halten 💎 Ein intimer Einblick, den es so nirgendwo anders gibt. Gönnt euch diesen Moment 🔓✨",
        "Late Night Special 🌙 Diese Aufnahme bleibt nur für begrenzte Zeit verfügbar. Schaltet sie frei bevor sie im Archiv landet 💋"
      );
    }

    if (isVideo) {
      const dur = asset.duration || 0;
      if (dur >= 90) {
        // Long video
        candidates.push(
          `Über ${durationStr} pure Intimität komplett ohne Schnitt... 🔥 Da ist wirklich alles drauf! Schaltet das volle Video unten frei 🔓✨`,
          `Ganze ${durationStr} in bester Auflösung 🤫 Habe die Kamera einfach laufen lassen. Holt euch den unzensierten Clip direkt in den Chat 🌟`
        );
      } else if (dur > 0) {
        // Medium/Short video with duration
        candidates.push(
          `Habe heute einen intimen ${durationStr}-Clip für euch aufgenommen 🙈 Voll in Bewegung und unzensiert! Jetzt unten freischalten 🔓✨`,
          `${durationStr} purer VIP-Content in Bewegung 🔥 Schaut mal ganz genau hin... Direkt unten entsperren 🌟`
        );
      } else {
        candidates.push(
          `Der bisher intensivste Clip aus meiner Privatsammlung... 🤫 Komplett unzensiert und in voller Bewegung! Jetzt unten freischalten 🔓✨`,
          `Unwiderstehlich & intim in Bewegung... 💋 Holt euch diesen brandneuen Clip direkt in euren Telegram Chat 🌟`
        );
      }
    }
  }

  // Filter out any candidates already used in this schedule
  let selected = candidates[0];
  if (usedCaptionsSet) {
    const unused = candidates.filter((c) => !usedCaptionsSet.has(c));
    if (unused.length > 0) {
      selected = unused[dayIndex % unused.length];
    } else {
      selected = candidates[dayIndex % candidates.length];
    }
    usedCaptionsSet.add(selected);
  } else {
    selected = candidates[dayIndex % candidates.length];
  }

  return sanitizeCaptionForMediaType(selected, asset.type);
}

/**
 * Sanitizes captions so that PHOTO assets NEVER contain video terms (video, clip, etc.)
 * and VIDEO assets NEVER contain photo-specific terms (schnappschuss, etc.).
 */
export function sanitizeCaptionForMediaType(
  caption: string,
  mediaType: "PHOTO" | "VIDEO" | "TEXT" | string | null | undefined
): string {
  if (!caption) return "";
  const isVideo = mediaType === "VIDEO";
  let result = caption;

  if (!isVideo) {
    // Media is PHOTO or TEXT: Strip out ALL video and clip references
    result = result
      .replace(/Mein persönliches Lieblingsvideo des Monats/gi, "Mein persönliches Lieblingsfoto des Monats")
      .replace(/Lieblingsvideo des Monats/gi, "Lieblingsfoto des Monats")
      .replace(/Lieblingsvideo/gi, "Lieblingsfoto")
      .replace(/Lieblings-Video/gi, "Lieblings-Foto")
      .replace(/Schaltet das Video unten frei/gi, "Schaltet das Foto unten frei")
      .replace(/Schaltet das Video frei/gi, "Schaltet das Foto frei")
      .replace(/Schaltet den Clip unten frei/gi, "Schaltet das Foto unten frei")
      .replace(/Schaltet den Clip frei/gi, "Schaltet das Foto frei")
      .replace(/um den vollen Clip sofort freizuschalten/gi, "um das volle Foto sofort freizuschalten")
      .replace(/um das volle Video sofort freizuschalten/gi, "um das volle Foto sofort freizuschalten")
      .replace(/um den vollen Clip freizuschalten/gi, "um das volle Foto freizuschalten")
      .replace(/um das volle Video freizuschalten/gi, "um das volle Foto freizuschalten")
      .replace(/Streng geheimer Clip/gi, "Streng geheimer Schnappschuss")
      .replace(/Streng geheimen Clip/gi, "Streng geheimen Schnappschuss")
      .replace(/geheimer Clip/gi, "geheimes Foto")
      .replace(/geheimen Clip/gi, "geheimes Foto")
      .replace(/brandneuen Clip/gi, "brandneuen Schnappschuss")
      .replace(/brandneuer Clip/gi, "brandneuer Schnappschuss")
      .replace(/vollen Clip/gi, "volles Foto")
      .replace(/voller Clip/gi, "volles Foto")
      .replace(/vollem Clip/gi, "vollem Foto")
      .replace(/diesen Clip/gi, "dieses Foto")
      .replace(/dieser Clip/gi, "dieses Foto")
      .replace(/diesem Clip/gi, "diesem Foto")
      .replace(/volles Video/gi, "volles Foto")
      .replace(/vollem Video/gi, "vollem Foto")
      .replace(/dieses Video/gi, "dieses Foto")
      .replace(/diesem Video/gi, "diesem Foto")
      .replace(/dieses Videos/gi, "dieses Fotos")
      .replace(/Video-Set/gi, "Foto-Set")
      .replace(/Videoclip/gi, "Schnappschuss")
      .replace(/Videoclips/gi, "Schnappschüsse")
      .replace(/\bVideos\b/g, "Fotos")
      .replace(/\bvideos\b/g, "Fotos")
      .replace(/\bVideo\b/g, "Foto")
      .replace(/\bvideo\b/g, "Foto")
      .replace(/\bClips\b/g, "Fotos")
      .replace(/\bclips\b/g, "Fotos")
      .replace(/\bClip\b/g, "Foto")
      .replace(/\bclip\b/g, "Foto")
      .replace(/\bgefilmt\b/gi, "fotografiert");
  } else {
    // Media is VIDEO: Ensure video terminology is used
    result = result
      .replace(/Mein persönliches Lieblingsfoto des Monats/gi, "Mein persönliches Lieblingsvideo des Monats")
      .replace(/Lieblingsfoto des Monats/gi, "Lieblingsvideo des Monats")
      .replace(/Lieblingsfoto/gi, "Lieblingsvideo")
      .replace(/Lieblings-Foto/gi, "Lieblings-Video")
      .replace(/Schaltet das Foto unten frei/gi, "Schaltet das Video unten frei")
      .replace(/Schaltet das Foto frei/gi, "Schaltet das Video frei")
      .replace(/Schaltet das Bild unten frei/gi, "Schaltet das Video unten frei")
      .replace(/Schaltet das Bild frei/gi, "Schaltet das Video frei")
      .replace(/um das volle Foto sofort freizuschalten/gi, "um den vollen Clip sofort freizuschalten")
      .replace(/um das volle Bild sofort freizuschalten/gi, "um den vollen Clip sofort freizuschalten")
      .replace(/Foto-Set/gi, "Video-Set")
      .replace(/Spiegelselfie/gi, "Video-Selfie")
      .replace(/Spiegel-Selfie/gi, "Video-Selfie")
      .replace(/\bSchnappschuss\b/gi, "Clip")
      .replace(/\bSchnappschüsse\b/gi, "Clips")
      .replace(/\bFotos\b/g, "Videos")
      .replace(/\bfotos\b/g, "Videos")
      .replace(/\bFoto\b/g, "Video")
      .replace(/\bfoto\b/g, "Video")
      .replace(/\bBilder\b/g, "Videos")
      .replace(/\bbilder\b/g, "Videos")
      .replace(/\bBild\b/g, "Video")
      .replace(/\bbild\b/g, "Video")
      .replace(/\bfotografiert\b/gi, "gefilmt");
  }

  return result.trim();
}

/**
 * Returns a high-quality default caption matching both media format and tier.
 */
export function getFormatAwareDefaultCaption(
  mediaType: "PHOTO" | "VIDEO" | "TEXT" | string | null | undefined,
  explicitLevel: "TEASER" | "SOFT" | "PPV" | string,
  theme?: string | null,
  durationFormatted?: string | null
): string {
  const isVideo = mediaType === "VIDEO";
  const themeTag = theme && theme !== "Unklassifiziert" && theme !== "Allgemein" ? `[${theme}] ` : "";

  if (explicitLevel === "PPV") {
    if (isVideo) {
      const dur = durationFormatted ? ` (${durationFormatted})` : "";
      return `Habe mich getraut und diesen intimen Clip${dur} für euch festgehalten 🙈 ${themeTag}Jetzt unzensiert unten freischalten 🔓✨`;
    } else {
      return `Das bisher heißeste Set aus meiner persönlichen Sammlung... 🤫 ${themeTag}Komplett unzensiert direkt unten freischalten 🔓✨`;
    }
  }

  if (explicitLevel === "SOFT") {
    if (isVideo) {
      return `Ein kleiner Einblick hinter die Kulissen ✨ ${themeTag}Wie gefällt euch die Bewegung? Reagiert mit 🔥 für mehr!`;
    } else {
      return `Ein kleiner Einblick hinter die Kulissen ✨ ${themeTag}Wie gefällt euch dieser Schnappschuss? Hinterlasst ein Herz ❤️`;
    }
  }

  // TEASER
  if (isVideo) {
    return "Guten Morgen meine Lieben! 💕 Kleiner Grußclip für euren Start in den Tag. Lasst mir gerne ein Like da ✨";
  } else {
    return "Guten Morgen meine Lieben! 💕 Kleiner Gruß für euren Start in den Tag. Was habt ihr heute Schönes vor? 🥰";
  }
}
