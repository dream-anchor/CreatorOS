# Steve's Redesign: "The Zen of Community"

Ich habe verstanden. Du willst kein "Tool" mit Buttons und Panels. Du willst einen **Zustand**.
Community-Management ist wie Gärtnern. Du gehst durch den Garten, zupfst hier ein Unkraut (Blockieren/Löschen) und gießt dort eine Blume (Antworten).

Das aktuelle Design ist ein Cockpit. Wir bauen jetzt einen Zen-Garten.

## 1. Die "Inbox Zero" Metapher
Die Community-Seite wird zur **Inbox**.
*   **Keine Listen-Ansicht mehr:** Listen sind Stress. Listen sind Arbeit.
*   **Nur noch Karten (The Stack):** Du siehst immer nur **eine** Sache: Den nächsten offenen Kommentar.
*   **Hintergrund:** Der Kontext (Post) ist dezent im Hintergrund, aber nicht dominant.

## 2. Der Workflow: "One Touch"
Jeder Kommentar auf dem Stapel braucht genau **eine** Entscheidung.
*   **Touch:** KI-Antwort genehmigen (grün).
*   **Hold:** KI-Antwort bearbeiten (Keyboard fährt hoch).
*   **Swipe Left:** Ignorieren/Löschen/Blockieren.
*   **Swipe Right:** Speichern für später / Sternchen.

## 3. Settings? Weg damit.
Du konfigurierst dein Auto auch nicht während der Fahrt.
*   Die `RulesConfigPanel` fliegt raus. Sie kommt in einen modalen "Settings"-Bereich (oben rechts, kleines Zahnrad).
*   Die KI-Modell-Wahl? Automatisch. Oder tief in den Settings versteckt. Es soll einfach funktionieren.

## Mein Plan für die "Apple"-Transformation:

1.  **Aufräumen (Declutter):**
    *   Ich entferne die Listen-Ansicht komplett aus dem Haupt-Flow.
    *   Der "Focus Mode" (die Karte) wird zur **Standard-Ansicht**.
    *   Wenn keine Kommentare da sind: Ein wunderschöner "All caught up" Screen (wie bei Apple Mail).

2.  **Visuelle Hierarchie:**
    *   **Oben:** Status ("5 offen").
    *   **Mitte:** Die Karte (Groß, lesbar, sexy).
    *   **Unten:** Nur zwei Buttons: "Ablehnen/Bearbeiten" und "Senden".

3.  **Technische Konsolidierung:**
    *   Ich lösche den redundanten Code. Es gibt nur noch *einen* Weg, Kommentare zu bearbeiten.

Bist du bereit für radikale Einfachheit?
