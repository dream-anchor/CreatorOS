# Steve Jobs würde sagen: "Du trainierst deinen digitalen Zwilling."

Du willst nicht einfach nur "Nein" sagen. Du willst, dass das System **lernt**, warum du Nein gesagt hast.

## Das Konzept: "Teach & Trust"

Wir bauen keine klassische "Admin-Oberfläche", sondern einen **Tinder-Trainer**.

1.  **Die Karte (The Card):** Du siehst den Kommentar und den Vorschlag der KI.
2.  **Swipe Rechts (Trust):** "Ja, perfekt." -> Antwort wird sofort in die Queue geschoben (Golden Window).
3.  **Swipe Links (Teach):** "Nein, so nicht." -> **Hier passiert die Magie.**
    *   Das System fragt dich nicht nach einem Roman. Es fragt: "Zu förmlich? Zu kurz? Falscher Fakt?" (Schnellwahl-Buttons).
    *   Oder du diktierst/tippst kurz die richtige Antwort.
    *   **Der Clou:** Das System speichert deine Korrektur in einer neuen "Knowledge Base" (`reply_training_data`).

4.  **Der "Autopilot"-Modus (Trust Score):**
    *   Anfangs musst du alles swipen.
    *   Das System berechnet einen "Trust Score". Wenn du 50x in Folge "Ja" gesagt hast, schaltet es sich frei: "Ich habe das Gefühl, ich verstehe dich jetzt. Soll ich ab jetzt sichere Antworten alleine posten?"

## Technische Umsetzung (Modern Stack)

1.  **Datenbank:**
    *   Neue Tabelle `reply_training_data`: Speichert `original_comment`, `bad_reply`, `better_reply`, `correction_reason`.
    *   Dies wird genutzt, um den System-Prompt (`brand_rules`) regelmäßig per RAG (Retrieval Augmented Generation) zu verfeinern.

2.  **UI (Community.tsx):**
    *   Wir bauen den **Focus Mode** zum **Trainer Mode** um.
    *   Große Swipe-Gesten (oder Pfeiltasten).
    *   Bei "Nein": Ein elegantes Overlay für die Korrektur.

3.  **Wann wird gepostet? (Intelligent Scheduling)**
    *   Nicht sofort. Das wirkt wie ein Bot.
    *   Wir nutzen das **Golden Window**: Das System wartet auf deinen nächsten Post (z.B. heute Abend 18:00).
    *   Dann feuert es die Antworten in Wellen ab: 15 min *vor* dem Post (um Fans zu aktivieren) und 15 min *nach* dem Post (um den Algorithmus zu pushen).

## Mein Plan für dich:

1.  **Datenbank-Upgrade:** Tabelle für Trainingsdaten erstellen.
2.  **Trainer-UI:** Den Focus Mode um "Approve" (Rechts) und "Refine" (Links) erweitern.
3.  **Lern-Loop:** Eine Funktion, die bei Korrekturen lernt.

Soll ich den "Trainer Mode" bauen?
