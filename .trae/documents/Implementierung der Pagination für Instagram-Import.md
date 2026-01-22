# Pagination für den Instagram Import

Ich werde den Import-Prozess so umbauen, dass er große Mengen an Posts (mehr als 200) in "Häppchen" (Batches) verarbeitet, um Timeouts zu vermeiden.

## Mein Plan

1.  **Backend (Edge Function)**:
    *   Ich erweitere `fetch-instagram-history/index.ts` so, dass sie einen `cursor` (Startpunkt) akzeptiert.
    *   Die Funktion lädt dann **maximal 200 Posts** ab diesem Startpunkt.
    *   Sie gibt am Ende einen `next_cursor` zurück, falls es noch mehr Posts gibt.

2.  **Frontend (ImportContext)**:
    *   Ich baue eine Schleife in `startImport` ein.
    *   Das Frontend ruft die Funktion auf, speichert die 200 Posts, nimmt den `next_cursor` und ruft die Funktion erneut auf.
    *   Das wiederholt sich, bis alles importiert ist.
    *   Der Fortschrittsbalken wird aktualisiert (z.B. "200 Posts...", "400 Posts...").

3.  **Deployment**:
    *   Ich pushe die Änderungen wieder zu GitHub, damit Lovable/Supabase sie übernimmt.

Damit umgehen wir das 2.5-Minuten-Timeout, weil jeder "Happen" nur ca. 30 Sekunden dauert, aber wir können trotzdem tausende Posts importieren.
