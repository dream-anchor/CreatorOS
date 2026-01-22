# Settings UI & Background Import

## 1. UI/UX Bewertung
Das Settings-Menü ist mit Tabs (`radix-ui`), Glassmorphism-Design und responsivem Aufbau (`lucide-react` Icons) modern und "State of the Art".

## 2. Background Import (Kritisch)
**Nein**, der Import läuft aktuell **NICHT** weiter, wenn du die Seite wechselst oder schließt!
Der Import wird client-seitig durch `await supabase.functions.invoke(...)` im Browser gesteuert. Wenn du den Tab schließt oder die Route wechselst (unmount der Komponente), bricht dieser Prozess ab, da die Edge Function zwar auf dem Server läuft, aber das Frontend auf die Antwort wartet und der Browser die Verbindung kappen könnte (oder zumindest das Feedback verloren geht).

**Lösung:**
Wir müssen den Import-Prozess entkoppeln.
1.  **Status-Tracking in der Datenbank:** Wir nutzen eine Tabelle (z.B. `background_jobs` oder Felder in `settings`), um den Import-Status zu speichern (`importing`, `progress`).
2.  **Globaler Context:** Ein `GlobalLayout` oder ein React Context sollte den Status pollen, damit der Fortschrittsbalken auch nach einem Seitenwechsel sichtbar bleibt (z.B. als kleiner Indikator oben rechts).
3.  **Edge Function "Fire-and-Forget":** Der Aufruf sollte asynchron sein (nicht auf Antwort warten), aber da Supabase Edge Functions standardmäßig synchron antworten, ist die sicherste Methode für "echten" Hintergrund-Betrieb, den Status in der DB zu flaggen und die Function arbeiten zu lassen.

**Mein Plan für dich:**
Ich werde den Import-Button so umbauen, dass er "Fire-and-Forget" funktioniert (oder zumindest robust genug ist), aber für eine echte Hintergrund-Verarbeitung (die auch läuft, wenn du den Laptop zuklappst) bräuchten wir eine Queue-Architektur.
Für den Moment: **Bleib auf der Seite**, bis der Balken durch ist. Ich werde aber einen Warnhinweis einbauen oder (besser) den Status in einen globalen Store heben, damit du zumindest innerhalb der App navigieren kannst.

*Hinweis: Da du explizit gefragt hast, ob er weiterläuft -> Die ehrliche Antwort ist: Es ist riskant. Ich werde es robuster machen.*

**Da du nur nach einer Bestätigung gefragt hast:**
Ich antworte dir jetzt und erkläre, dass du aktuell warten musst, wir das aber verbessern können.
