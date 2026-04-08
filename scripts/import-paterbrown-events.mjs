#!/usr/bin/env node
/**
 * import-paterbrown-events.mjs
 * Pater Brown Tour-Termine von paterbrown.com scrapen und in events-Tabelle laden
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." USER_ID="<pater-brown-user-id>" node scripts/import-paterbrown-events.mjs
 *
 * Voraussetzung: playwright installiert
 *   npx playwright install chromium
 */

import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

const DATABASE_URL = process.env.DATABASE_URL;
const USER_ID = process.env.USER_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DATABASE_URL) { console.error("Fehler: DATABASE_URL nicht gesetzt"); process.exit(1); }
if (!USER_ID) { console.error("Fehler: USER_ID nicht gesetzt"); process.exit(1); }

const sql = neon(DATABASE_URL);

function parseDateDE(dateStr) {
  // "05.09.2026" → "2026-09-05"
  const [day, month, year] = dateStr.trim().split(".");
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function scrapeEvents() {
  console.log("Browser starten...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Öffne paterbrown.com/termine...");
    await page.goto("https://paterbrown.com/termine", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Warte auf Event-Cards
    try {
      await page.waitForSelector(".event-card, [data-id], article", { timeout: 10000 });
    } catch {
      console.log("Kein .event-card gefunden, versuche alternatives Selector...");
    }

    // Kurz warten für dynamisches Laden
    await page.waitForTimeout(2000);

    // Scrape Event-Cards
    const events = await page.evaluate(() => {
      const results = [];

      // Primärer Selektor: .event-card
      const cards = document.querySelectorAll(".event-card, article[data-id]");

      if (cards.length === 0) {
        // Fallback: Suche nach Datums-Patterns
        const allText = document.body.innerText;
        console.log("Keine Event-Cards gefunden. Page text:", allText.slice(0, 500));
        return [];
      }

      cards.forEach((card) => {
        const dateEl = card.querySelector(".date, [class*='date']");
        const cityEl = card.querySelector(".city, h3, [class*='city']");
        const venueEl = card.querySelector(".venue, p, [class*='venue']");
        const ticketEl = card.querySelector("a.cta-button, a[href*='ticket'], a[href*='eventim'], a[href*='reservix']");

        const dateRaw = dateEl?.textContent?.trim() || "";
        const city = cityEl?.textContent?.trim() || "";
        const venue = venueEl?.textContent?.trim() || "";
        const ticketUrl = ticketEl?.href || "";

        if (dateRaw && city) {
          results.push({ dateRaw, city, venue, ticketUrl });
        }
      });

      return results;
    });

    console.log(`${events.length} Events gefunden`);
    return events;
  } finally {
    await browser.close();
  }
}

async function importEvents(scraped) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const ev of scraped) {
    const date = parseDateDE(ev.dateRaw);
    if (!date) {
      console.warn(`  ⚠️  Datum nicht parsebar: "${ev.dateRaw}" — übersprungen`);
      skipped++;
      continue;
    }

    const title = `Pater Brown – Das Live-Hörspiel`;
    const venue = ev.venue || "Venue TBA";
    const city = ev.city;
    const ticketUrl = ev.ticketUrl || null;

    console.log(`  → ${date} | ${city} | ${venue}`);

    if (DRY_RUN) {
      console.log(`     [DRY RUN] Würde einfügen: user_id=${USER_ID}, title="${title}"`);
      inserted++;
      continue;
    }

    try {
      await sql`
        INSERT INTO events (
          user_id, title, date, time, venue, city, ticket_url,
          cast_members, event_type, is_active
        ) VALUES (
          ${USER_ID}, ${title}, ${date}, '20:00', ${venue}, ${city},
          ${ticketUrl}, ARRAY['Wanja Mues', 'Antoine Monot Jr.'],
          'inthega_tournee', true
        )
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.error(`  ✗ Fehler bei ${date} ${city}:`, err.message);
      errors++;
    }
  }

  return { inserted, skipped, errors };
}

async function run() {
  console.log(`\n=== Pater Brown Tour-Import ===`);
  console.log(`USER_ID: ${USER_ID}`);
  console.log(`DRY_RUN: ${DRY_RUN ? "ja" : "nein"}\n`);

  // 1. Termine scrapen
  let scraped = [];
  try {
    scraped = await scrapeEvents();
  } catch (err) {
    console.error("Scraping fehlgeschlagen:", err.message);
    console.log("\nFallback: Termine manuell eingeben...");
    scraped = MANUAL_EVENTS;
  }

  if (scraped.length === 0) {
    console.log("Keine Termine gefunden. Verwende manuelle Einträge.");
    scraped = MANUAL_EVENTS;
  }

  // 2. In DB importieren
  const { inserted, skipped, errors } = await importEvents(scraped);

  console.log(`\n✅ Import abgeschlossen:`);
  console.log(`   Eingefügt: ${inserted}`);
  console.log(`   Übersprungen: ${skipped}`);
  console.log(`   Fehler: ${errors}`);
}

// Manuelle Fallback-Termine (aus kulturkurier.de, Stand April 2026)
// Aktualisieren wenn neue Termine bekannt!
const MANUAL_EVENTS = [
  { dateRaw: "05.09.2026", city: "München", venue: "Alte Kongresshalle", ticketUrl: "https://www.eventim.de/artist/pater-brown/" },
  { dateRaw: "23.10.2026", city: "Hamburg", venue: "", ticketUrl: "https://www.eventim.de/artist/pater-brown/" },
  { dateRaw: "16.12.2026", city: "Zürich", venue: "", ticketUrl: "https://www.ticketcorner.ch/" },
  { dateRaw: "20.01.2027", city: "Baunatal", venue: "", ticketUrl: "https://www.eventim.de/artist/pater-brown/" },
  { dateRaw: "21.01.2027", city: "Gießen", venue: "", ticketUrl: "https://www.eventim.de/artist/pater-brown/" },
];

run().catch((err) => {
  console.error("Fehler:", err.message);
  process.exit(1);
});
