# Implementierung der Post- und Kommentar-Analyse

## 1. Post-Analyse (Optimierung)
Die Funktion `analyze-style` existiert bereits und analysiert deine letzten 20-50 Posts, um deinen Schreibstil, Hook-Muster und Tonalität zu lernen. Ich werde sicherstellen, dass sie optimal konfiguriert ist und die Ergebnisse transparent in deinem Dashboard anzeigt.

## 2. Kommentar-Analyse (Neuimplementierung)
Für die Analyse deiner Kommentare (Antworten) müssen wir eine neue Pipeline aufbauen, da bisher nur die Kommentare der Fans importiert wurden, nicht aber deine Antworten.

### Schritt A: Import deiner Antworten
Ich erweitere die Funktion `fetch-comments` so, dass sie nicht nur die Kommentare deiner Community speichert, sondern auch *deine* Antworten darauf extrahiert.
- Diese Antworten werden in die Tabelle `reply_queue` mit dem Status `imported` gespeichert.
- Damit haben wir eine zentrale Datenbank aller deiner Antworten (sowohl die über die App gesendeten als auch die direkt auf Instagram geschriebenen).

### Schritt B: Neue Analyse-Funktion `analyze-reply-style`
Ich erstelle eine neue KI-Funktion, die speziell deine Antwort-DNA entschlüsselt:
- **Input:** Die letzten 50-100 deiner Antworten.
- **Analyse:** 
  - Wie gehst du mit Kritik um? 
  - Wie bedankst du dich?
  - Duzt oder siezt du?
  - Nutzt du Emojis in Antworten?
- **Output:** Ein `reply_style_system_prompt`, der in deinen `brand_rules` gespeichert wird.

### Schritt C: Integration in den KI-Copiloten
Die Funktion `analyze-comments` (die Vorschläge generiert) wird aktualisiert, um diesen neuen `reply_style_system_prompt` zu nutzen.
- Das Ergebnis: Die KI schlägt Antworten vor, die *wirklich* wie du klingen, weil sie auf deinem historischen Antwortverhalten basieren.

## Zusammenfassung
- **Posts:** Analyse existiert bereits, wird verifiziert.
- **Kommentare:** Neue Import-Logik für deine Antworten + neue KI-Analyse-Funktion für deinen Antwort-Stil.
