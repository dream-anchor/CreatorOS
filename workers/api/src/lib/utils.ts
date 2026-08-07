const GERMAN_WEEKDAYS = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch",
  "Donnerstag", "Freitag", "Samstag",
];

const GERMAN_MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Formatiert ein Datum deutsch: "Freitag, 14. März 2026"
 */
export function formatDateGerman(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = GERMAN_WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = GERMAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}

/**
 * Formatiert eine Uhrzeit deutsch: "20:00 Uhr"
 */
export function formatTimeGerman(timeStr: string | null): string {
  if (!timeStr) return "20:00 Uhr";
  return timeStr.substring(0, 5) + " Uhr";
}

/** Ortszeit-Bestandteile in Europe/Berlin (Sommer-/Winterzeit automatisch korrekt) */
export type BerlinTime = {
  /** Kalendertag in Berlin als "YYYY-MM-DD" */
  date: string;
  /** Wochentag, 0 = Sonntag … 6 = Samstag */
  weekday: number;
  /** Stunde 0-23 in Berliner Ortszeit */
  hour: number;
  /** Minute 0-59 in Berliner Ortszeit */
  minute: number;
};

const BERLIN_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Rechnet einen UTC-Zeitpunkt in Berliner Ortszeit um.
 *
 * Cloudflare-Cron-Trigger laufen ausschliesslich in UTC
 * (https://developers.cloudflare.com/workers/configuration/cron-triggers/).
 * Ein fester UTC-Ausdruck verschiebt sich deshalb zweimal im Jahr um eine
 * Stunde. Deshalb wird die Ziel-Ortszeit hier zur Laufzeit bestimmt und nicht
 * im Cron-Ausdruck festgeschrieben.
 */
export function berlinTime(now: Date = new Date()): BerlinTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = parseInt(get("hour"), 10);

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: BERLIN_WEEKDAY_INDEX[get("weekday")] ?? 0,
    // Intl liefert bei hour12:false um Mitternacht je nach Runtime "24"
    hour: hour === 24 ? 0 : hour,
    minute: parseInt(get("minute"), 10),
  };
}
