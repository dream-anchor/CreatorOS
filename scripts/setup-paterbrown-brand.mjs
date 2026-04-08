#!/usr/bin/env node
/**
 * setup-paterbrown-brand.mjs
 * Pater Brown Brand Rules in Neon setzen + episode-Feld Migration
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." USER_ID="<pater-brown-user-id>" node scripts/setup-paterbrown-brand.mjs
 *
 * USER_ID = die user_id des Pater-Brown-Accounts in CreatorOS
 * (nach Login sichtbar im Dashboard oder via SELECT id FROM profiles LIMIT 5)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
const USER_ID = process.env.USER_ID;

if (!DATABASE_URL) {
  console.error("Fehler: DATABASE_URL nicht gesetzt");
  process.exit(1);
}
if (!USER_ID) {
  console.error("Fehler: USER_ID nicht gesetzt (z.B. USER_ID=abc-123 node setup-paterbrown-brand.mjs)");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  console.log("1. Migration: episode-Feld zu events hinzufügen...");
  await sql`ALTER TABLE public.events ADD COLUMN IF NOT EXISTS episode TEXT`;
  console.log("   ✓ events.episode vorhanden");

  console.log("2. Brand Rules für Pater Brown setzen...");

  const stylePrompt = `Du bist der Instagram-Ghostwriter für "Pater Brown – Das Live-Hörspiel".

IDENTITÄT:
- Pater Brown ist der warmherzige, scharfsinnige Detektivpriester aus den Geschichten von G.K. Chesterton
- Das Ensemble reist als Live-Hörspiel durch Deutschland und Österreich
- Besetzung: Wanja Mues (Hauptrolle), Antoine Monot Jr., und weitere

TONALITÄT:
- Mysteriös, einladend, mit Augenzwinkern
- Unterhaltsam und informativ, niemals aufdringlich
- Deutsch, du-Form gegenüber der Community verboten — keine direkte Ansprache

HASHTAGS (immer):
#PaterBrown #LiveHörspiel #KrimiLive

HASHTAGS (passend wählen):
#Theater #Hörspiel #WanjaMues #AntoineMonot #GKChesterton #Krimi #BühnenHörspiel #LiveEvent

CALL TO ACTION:
"Tickets über den Link in der Bio"

EMOJI-STIL: Sparsam, gezielt
Erlaubte Emojis: 🔍 🎭 🎧 🕵️ ✨

VERBOTEN:
- Keine Ausrufezeichen-Inflation (max 1 pro Post)
- Kein "Jetzt buchen!", kein "Seid dabei!"
- Kein Emoji-Spam

FORMAT:
- Caption: 3-5 kurze Absätze
- Hashtags: am Ende, separater Block
- Max 2200 Zeichen gesamt`;

  await sql`
    INSERT INTO brand_rules (
      user_id, org_id, tone_style, language_primary,
      hashtag_min, hashtag_max, emoji_level,
      do_list, dont_list,
      content_pillars, writing_style, style_system_prompt,
      ai_model
    ) VALUES (
      ${USER_ID}, 'default',
      'Mysteriös, einladend, mit Augenzwinkern. Unterhaltsam und informativ.',
      'DE',
      5, 12, 1,
      ARRAY['Immer Datum + Ort nennen', 'Auf Tickets hinweisen', 'Vorfreude wecken', 'Sparsam mit Emojis'],
      ARRAY['Kein Emoji-Spam', 'Keine Ausrufezeichen-Inflation', 'Kein direktes Du'],
      '[
        {"name": "Tour-Ankündigung", "description": "Ankündigungen und Reminder für Tour-Termine"},
        {"name": "Hinter den Kulissen", "description": "Blicke hinter die Kulissen der Produktion"},
        {"name": "Pater Brown Wissen", "description": "Fakten über Chesterton, die Figur, die Geschichten"}
      ]'::jsonb,
      'Kurze, atmosphärische Sätze. Bildhafte Sprache. Krimistimmung erzeugen.',
      ${stylePrompt},
      'google/gemini-2.5-flash'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tone_style = EXCLUDED.tone_style,
      language_primary = EXCLUDED.language_primary,
      hashtag_min = EXCLUDED.hashtag_min,
      hashtag_max = EXCLUDED.hashtag_max,
      emoji_level = EXCLUDED.emoji_level,
      do_list = EXCLUDED.do_list,
      dont_list = EXCLUDED.dont_list,
      content_pillars = EXCLUDED.content_pillars,
      writing_style = EXCLUDED.writing_style,
      style_system_prompt = EXCLUDED.style_system_prompt,
      ai_model = EXCLUDED.ai_model,
      updated_at = NOW()
  `;
  console.log(`   ✓ Brand Rules für user_id=${USER_ID} gesetzt`);

  console.log("3. Settings: auto_post_mode auf 'review' setzen...");
  await sql`
    INSERT INTO settings (user_id, org_id, auto_post_mode, posts_per_week, preferred_days)
    VALUES (${USER_ID}, 'default', 'review', 3, ARRAY['monday', 'wednesday', 'friday'])
    ON CONFLICT (user_id) DO UPDATE SET
      auto_post_mode = 'review',
      posts_per_week = 3,
      preferred_days = ARRAY['monday', 'wednesday', 'friday'],
      updated_at = NOW()
  `;
  console.log("   ✓ Settings: auto_post_mode=review, 3x/Woche Mo/Mi/Fr");

  console.log("\n✅ Pater Brown Brand Setup abgeschlossen!");
  console.log(`   user_id: ${USER_ID}`);
}

run().catch((err) => {
  console.error("Fehler:", err.message);
  process.exit(1);
});
