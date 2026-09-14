/**
 * Timezone utilities for Europe/Berlin (German Time).
 * Handles both CET (UTC+1, Winterzeit) and CEST (UTC+2, Sommerzeit) automatically
 * using standard JavaScript Intl APIs without external heavy dependencies.
 */

export const GERMAN_TIMEZONE = "Europe/Berlin";

/**
 * Returns the UTC offset in minutes for Europe/Berlin at the given date/time.
 * Returns +120 during CEST (Summer), +60 during CET (Winter).
 */
export function getBerlinOffsetMinutes(date: Date = new Date()): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const berlinDate = new Date(date.toLocaleString("en-US", { timeZone: GERMAN_TIMEZONE }));
  return Math.round((berlinDate.getTime() - utcDate.getTime()) / 60000);
}

export interface GermanDateParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;// 0-59
  second: number;// 0-59
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
}

/**
 * Extracts date and time parts in Europe/Berlin.
 */
export function getGermanDateParts(date: Date = new Date()): GermanDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: GERMAN_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const findPart = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  const year = findPart("year");
  const month = findPart("month");
  const day = findPart("day");
  let hour = findPart("hour");
  if (hour === 24) hour = 0; // standard 24-hr normalization
  const minute = findPart("minute");
  const second = findPart("second");

  // Determine day of week in Berlin
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: GERMAN_TIMEZONE,
    weekday: "short",
  }).format(date);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = dayMap[dayName] ?? date.getDay();

  return { year, month, day, hour, minute, second, dayOfWeek };
}

/**
 * Creates a UTC Date representing a specific year, month (0-11 or 1-12), day, hour, minute in Europe/Berlin.
 * This ensures that when viewed in Germany, the time is EXACTLY the specified hour and minute,
 * regardless of whether the server runs in UTC (Docker/Linux) or any other timezone.
 *
 * @param year e.g. 2026
 * @param month 1-12 (human month) or 0-11 if isZeroIndexed is true
 * @param day 1-31
 * @param hour 0-23 German local hour
 * @param minute 0-59 German local minute
 */
export function createGermanDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
  second: number = 0,
  isZeroIndexed: boolean = false
): Date {
  const monthIndex = isZeroIndexed ? month : month - 1;
  // Construct approximate UTC timestamp
  const approxUtc = new Date(Date.UTC(year, monthIndex, day, hour, minute, second, 0));
  // Find what the offset is in Berlin around that time
  const offsetMinutes = getBerlinOffsetMinutes(approxUtc);
  // Subtract offset so that UTC + offset = target German local time
  return new Date(approxUtc.getTime() - offsetMinutes * 60 * 1000);
}

/**
 * Parses a date string "YYYY-MM-DD" and a time string "HH:mm" in German Local Time.
 * Returns the exact Date (UTC instant).
 */
export function parseGermanDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  const [hour, minute] = timeStr.split(":").map((v) => parseInt(v, 10));
  return createGermanDate(year, month, day, hour || 0, minute || 0, 0, false);
}

/**
 * Formats a Date object or timestamp as a readable German string.
 * Example: "Montag, 15.09.2026 • 14:30 Uhr"
 */
export function formatGermanDateTime(
  date: Date | string | number,
  options?: { includeWeekday?: boolean; includeYear?: boolean }
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";

  const includeWeekday = options?.includeWeekday ?? true;
  const includeYear = options?.includeYear ?? true;

  const parts = getGermanDateParts(d);
  const weekdayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const weekday = weekdayNames[parts.dayOfWeek];

  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  const yyyy = parts.year;
  const hh = String(parts.hour).padStart(2, "0");
  const min = String(parts.minute).padStart(2, "0");

  const dateSection = includeYear ? `${dd}.${mm}.${yyyy}` : `${dd}.${mm}.`;
  if (includeWeekday) {
    return `${weekday}, ${dateSection} • ${hh}:${min} Uhr`;
  }
  return `${dateSection} • ${hh}:${min} Uhr`;
}

/**
 * Formats a Date as "YYYY-MM-DD" in Europe/Berlin (useful for input[type="date"]).
 */
export function formatGermanDateInput(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const parts = getGermanDateParts(d);
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

/**
 * Formats a Date as "HH:mm" in Europe/Berlin (useful for input[type="time"]).
 */
export function formatGermanTimeInput(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const parts = getGermanDateParts(d);
  const hh = String(parts.hour).padStart(2, "0");
  const min = String(parts.minute).padStart(2, "0");
  return `${hh}:${min}`;
}
