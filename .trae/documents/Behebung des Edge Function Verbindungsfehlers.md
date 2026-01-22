# Fehleranalyse: "Failed to send a request to the Edge Function"

Die Fehlermeldung deutet darauf hin, dass die Edge Function `fetch-instagram-history` nicht erreichbar ist. Da ich in der Konsole gesehen habe, dass der `supabase`-Befehl nicht gefunden wurde (`command not found: supabase`), scheint es, als ob wir die Funktionen hier lokal nicht deployen können oder die CLI nicht installiert/verfügbar ist.

Der Fehler tritt meistens auf, wenn:
1.  **Funktion nicht deployed:** Die Edge Function existiert lokal, wurde aber nie auf den Supabase-Server hochgeladen.
2.  **CORS-Problem:** Der Browser blockiert die Anfrage (passiert oft lokal).
3.  **Netzwerk/Auth:** Die Verbindung zum Supabase-Server wird blockiert.

## Mein Plan

1.  **CORS-Handling in der Edge Function prüfen:** Ich werde sicherstellen, dass die Datei `supabase/functions/fetch-instagram-history/index.ts` korrekte CORS-Header (`Access-Control-Allow-Origin: *`) zurückgibt, damit der Browser die Anfrage nicht blockiert.
2.  **Fehlerbehandlung im Client verbessern:** Ich werde den `ImportContext` so erweitern, dass er bei einem Netzwerkfehler einen hilfreichen Hinweis gibt (z.B. "Funktion nicht deployed" oder "Verbindung prüfen").
3.  **Manueller Deployment-Hinweis:** Da ich die Funktion von hier aus nicht deployen kann (CLI fehlt), werde ich dir genau erklären, was du tun musst, falls die Funktion auf dem Server fehlt.

Wir starten mit der Code-Prüfung der Edge Function, um CORS als Ursache auszuschließen.
