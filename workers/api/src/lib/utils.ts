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
