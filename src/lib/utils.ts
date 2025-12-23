export function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

export function todayISODate() {
  return isoDateInTimeZone(new Date(), "America/New_York");
}

export function isoDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const yyyy = parts.find((p) => p.type === "year")?.value ?? "0000";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yyyy}-${mm}-${dd}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const yyyy = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const dd = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const ss = Number(parts.find((p) => p.type === "second")?.value ?? "0");

  const asUTC = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss);
  return (asUTC - date.getTime()) / 60000;
}

function addDaysISODate(dateStr: string, days: number) {
  const [yyyy, mm, dd] = dateStr.split("-").map((v) => Number(v));
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcMillisForTimeZoneMidnight(dateStr: string, timeZone: string) {
  const [yyyy, mm, dd] = dateStr.split("-").map((v) => Number(v));

  const base = Date.UTC(yyyy, mm - 1, dd, 0, 0, 0);
  let guess = new Date(base);
  let offset = getTimeZoneOffsetMinutes(guess, timeZone);
  let utcMillis = base - offset * 60000;

  guess = new Date(utcMillis);
  const offset2 = getTimeZoneOffsetMinutes(guess, timeZone);
  if (offset2 !== offset) {
    utcMillis = base - offset2 * 60000;
  }

  return utcMillis;
}

export function centralDayRangeUTC(dateStr: string) {
  const tz = "America/New_York";
  const startMs = utcMillisForTimeZoneMidnight(dateStr, tz);
  const next = addDaysISODate(dateStr, 1);
  const endMs = utcMillisForTimeZoneMidnight(next, tz);
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

 export function parseLifetimeUsd(value: unknown): number | null {
   if (value == null) return null;
   if (typeof value === "number") return Number.isFinite(value) ? value : null;

   // Supabase numeric often returns string
   if (typeof value === "string") {
     const n = Number(value);
     return Number.isFinite(n) ? n : null;
   }

   return null;
 }
