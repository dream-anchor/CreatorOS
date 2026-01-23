# Steve's Critique: "It's not just how it looks, it's how it works."

Das Tool ist mächtig, aber es hat noch zu viel "Verwaltungs-Charakter". Ein Creator will **erschaffen**, nicht Datenbanken pflegen. Hier ist mein Plan, um die "Seele" der Software zu ändern:

## 1. Die Sidebar: Weniger Lärm, mehr Fokus
Die Sidebar ist vollgestopft. Wir müssen sie radikal aufräumen.
*   **Visuelle Ruhe:** Die Sektionen (Strategie, Creation, Management) sind gut, aber sie brauchen "Luft". Ich werde subtile Trenner und Überschriften einfügen, die nicht schreien, sondern führen.
*   **Chats verstecken:** Die Chat-History ist wichtig, aber sie dominiert die Navigation. Sie sollte standardmäßig eingeklappt sein oder dezenter wirken. Wir machen sie "on demand".

## 2. Der Generator: Magie statt Formular
Der Generator ist das Herzstück, fühlt sich aber an wie ein Steuerformular (Wizard Steps).
*   **Output-Struktur:** Das Ergebnis (rechte Spalte) ist eine endlose Scroll-Wüste. Das ist faul. Wir führen **Tabs für den Output** ein: "Post", "Alternativen", "Analyse". Der Nutzer soll das Ergebnis *genießen*, nicht danach suchen müssen.
*   **Modell-Wahl:** Der `AiModelSelector` klebt lieblos am Rand. Er muss ein bewusster Schalter sein, der dem Nutzer Macht gibt, oder ganz verschwinden (Smart Default). Wir integrieren ihn besser.

## 3. Micro-Interactions: "Delight"
Ein Apple-Produkt "lebt".
*   **Import-Status:** Der neue Import-Indikator ist gut, aber wir machen ihn noch "smoother".
*   **Feedback:** Wenn etwas gespeichert wird, darf nicht einfach ein Text kommen. Es muss ein befriedigendes "Pling" (visuell) geben.

## Konkrete Schritte (Code):

1.  **GlobalLayout.tsx Refinement:**
    *   Überarbeitung der `navItems`-Darstellung (Gruppierung visuell stärken, Icons zentrieren).
    *   `Collapsible` für Chats standardmäßig schließen oder visuell in den Hintergrund rücken.
2.  **Generator.tsx UX-Polishing:**
    *   Einführung von `Tabs` für den Output-Bereich (statt untereinander gestapelte Cards).
    *   Aufräumen des Headers (Modell-Selektor).

Wir entfernen nichts. Wir machen es nur so, dass man es benutzen *will*.
